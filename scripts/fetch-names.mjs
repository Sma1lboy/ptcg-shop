// Builds data/names-zh.json: the Simplified-Chinese card names, keyed set id → card number. src/sets.ts merges it into DATA (name = 中文, en = the English name from TCGdex).
// Usage: node scripts/fetch-names.mjs      (network responses are cached in data/raw/, delete it to refresh; prices are not touched: data/cards-*.json is only read)
//
// Sources, in order of preference per card:
//   1. 神奇宝贝百科 (wiki.52poke.com) set pages «XXX（TCG）»: one row per printed card, numbered like the English set, names in Chinese (rendered as zh-hans by the wiki's own converter).
//   2. The same English name seen on another card (a reprint) in any set's page.
//   3. Pokémon only: the species name from PokeAPI (zh-Hans) by the card's dexId, with the "Mega / regional form / X's / ex" affixes learned from the wiki rows.
//   4. Nothing found: no entry, the game keeps the English name.
// Every wiki row whose species disagrees with the card's dexId (a misaligned number) is dropped and reported, so a wrong name never ships.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const UA = { 'User-Agent': 'ptcg-shop/1.0 (name data build; https://github.com/sma1lboy)' };
const WIKI = 'https://wiki.52poke.com/api.php';
const TCGDEX = 'https://api.tcgdex.net/v2/en';
const SPECIES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
// keep in sync with src/sets.ts; the page title is the wiki's English-set page (me05 has none yet: it is filled from the rules below)
const PAGES = {
  'sv08': '浪湧電光（TCG）', 'sv10': '命定劲敌（TCG）', 'sv08.5': '棱镜进化（TCG）', 'sv03.5': '151（TCG）', 'sv09': '旅途偕行（TCG）',
  'me01': '超级 进化（TCG）', 'me02': '诡火灵焰（TCG）', 'me03': '完全秩序（TCG）', 'me04': '混沌崛起（TCG）', 'me05': null,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cached(file, make) {
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const v = await make(); await writeFile(file, JSON.stringify(v)); return v;
}
async function fetchRetry(url, kind, body) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url, { headers: UA, ...(body && { method: 'POST', body }) }); if (r.ok) return kind === 'text' ? await r.text() : await r.json(); console.log('  HTTP', r.status, url.slice(0, 90)); } catch (e) { console.log('  fetch error', e.message, url.slice(0, 90)); }
    await sleep(600 * 2 ** i);
  }
  throw new Error('fetch failed: ' + url);
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

await mkdir('data/raw', { recursive: true });

// --- wiki rows: {number → raw name}
const params = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
async function wikiRows(set, title) {
  const wt = await cached(`data/raw/wiki-${set}.json`, async () => {
    const j = await fetchRetry(`${WIKI}?${params({ action: 'query', titles: title, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json' })}`);
    const p = Object.values(j.query.pages)[0]; if (!p.revisions) throw new Error('no wiki page: ' + title);
    return { title, text: p.revisions[0].slots.main['*'] };
  });
  const rows = {};
  for (const line of wt.text.split('\n')) {
    const m = line.match(/^\{\{卡牌列表\/entry\|(\d+)\/\d+\|(.*)$/); if (!m) continue;
    // the second cell: {{C|name|SET}} (a Pokémon or a card with a set tag) or {{TCG|name}} (a Trainer / Energy)
    const c = m[2].match(/^\{\{(?:C|TCG|TCGPM)\|([^|}]+)/); if (!c) { console.log('  unparsed row', set, line.slice(0, 80)); continue; }
    // a typo on the wiki repeats the previous number (me03 054 twice): the repeat is the next card
    let n = m[1]; if (rows[n]) { n = String(+n + 1).padStart(n.length, '0'); console.log('  duplicate number', set, m[1], '→', n); }
    rows[n] = c[1].trim();
  }
  return rows;
}
// the wiki's own converter turns the traditional characters some names are stored with into simplified
async function simplify(names) {
  const uniq = [...new Set(names)], out = {};
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80); await sleep(500); // the wiki answers 429 to a burst
    const j = await fetchRetry(WIKI, 'json', new URLSearchParams({ action: 'parse', text: chunk.join('\n\n'), contentmodel: 'wikitext', prop: 'text', variant: 'zh-hans', format: 'json' }));
    const ps = [...j.parse.text['*'].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim().replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))); // full-width letters and digits ＰＰ → PP, punctuation stays
    if (ps.length !== chunk.length) throw new Error(`simplify: ${ps.length} != ${chunk.length}`);
    chunk.forEach((n, k) => { out[n] = ps[k].replace(/&amp;/g, '&').replace(/&#160;/g, ' ').replace(/&#0?39;/g, "'"); });
  }
  return out;
}

// --- PokeAPI: dex number → 简中 species name (language_id 12 = zh-Hans)
const csv = await cached('data/raw/species-zh.json', async () => {
  const dex = {};
  for (const line of (await fetchRetry(SPECIES_CSV, 'text')).split('\n').slice(1)) {
    const m = line.match(/^(\d+),12,([^,]+),/); if (m) dex[m[1]] = m[2];
  }
  const sm = await simplify(Object.values(dex)); // PokeAPI has a few traditional characters left (纏红鹤)
  for (const k in dex) dex[k] = sm[dex[k]];
  return dex;
});

const sets = {};
for (const id of Object.keys(PAGES)) sets[id] = JSON.parse(await readFile(`data/cards-${id}.json`, 'utf8'));

// --- TCGdex English card details (category + dexId), used to check alignment and to build the fallback
async function detail(set, n) {
  return cached(`data/raw/${set}-${n}.json`, () => fetchRetry(`${TCGDEX}/cards/${set}-${n}`));
}
const info = {};
for (const id of Object.keys(sets)) {
  info[id] = {};
  await pool(sets[id].cards, 8, async c => { const d = await detail(id, c.n); info[id][c.n] = { cat: d.category, dex: d.dexId?.[0] }; });
}

// --- 1. wiki rows
const wiki = {};
for (const [id, title] of Object.entries(PAGES)) {
  wiki[id] = {};
  if (!title) continue;
  const rows = await wikiRows(id, title), sm = await simplify(Object.values(rows));
  for (const [n, raw] of Object.entries(rows)) wiki[id][n] = sm[raw];
}

// --- alignment check against the dex number: a Pokémon row must contain its species' name. The wiki spells a few species the Taiwanese way
// (火爆兽 for 火暴兽): one differing character is taken as the same species and rewritten to PokeAPI's mainland spelling.
const withSpecies = (zh, sp) => {
  if (zh.includes(sp)) return zh;
  for (let i = 0; i + sp.length <= zh.length; i++) {
    let d = 0; for (let k = 0; k < sp.length; k++) if (zh[i + k] !== sp[k]) d++;
    if (d <= 1 && sp.length >= 3) return zh.slice(0, i) + sp + zh.slice(i + sp.length);
  }
  return null;
};
const zhOf = new Map(); // en name → Map(zh → count)
const bump = (en, zh) => { if (!zhOf.has(en)) zhOf.set(en, new Map()); zhOf.get(en).set(zh, (zhOf.get(en).get(zh) || 0) + 1); };
const out = {}, dropped = [];
for (const [id, s] of Object.entries(sets)) {
  out[id] = {};
  for (const c of s.cards) {
    let zh = wiki[id][c.n]; if (!zh) continue;
    const { cat, dex } = info[id][c.n];
    if (cat === 'Pokemon' && dex && csv[dex]) {
      const fixed = withSpecies(zh, csv[dex]);
      if (!fixed) { dropped.push(`${id} ${c.n} ${c.name} ≠ ${zh} (${csv[dex]})`); continue; }
      if (fixed !== zh) console.log('  respelled', id, c.n, zh, '→', fixed);
      zh = fixed;
    }
    if (!/[\u4e00-\u9fff]/.test(zh)) continue; // an untranslated row (still English)
    // Trainer rows carry the artwork's character after a space («博士的研究 奥琳博士», the English card is just "Professor's Research"); a real space stays only in "Technical Machine: X"
    if (cat !== 'Pokemon' && !c.name.includes(':')) zh = zh.split(' ')[0];
    out[id][c.n] = zh; bump(c.name, zh);
  }
}
const best = m => [...m].sort((a, b) => b[1] - a[1])[0][0];

// --- 3. affixes learned from the wiki rows: "Team Rocket's Mewtwo ex" → 火箭队的超梦ex gives  prefix "Team Rocket's" = 火箭队的
const prefixes = {};
const parse = name => {
  const m = name.match(/^(?:(.+?'s|N's) )?(Mega )?(Alolan |Galarian |Hisuian |Paldean )?(.+?)( ex)?( [XY])?$/); // (owner's)(Mega)(regional)(species)(ex)(X|Y)
  return m && { owner: m[1], mega: !!m[2], region: m[3]?.trim(), rest: m[4], ex: !!m[5], xy: m[6]?.trim() };
};
for (const [id, s] of Object.entries(sets)) for (const c of s.cards) {
  const zh = out[id][c.n], dex = info[id][c.n].dex; if (!zh || !dex || !csv[dex]) continue;
  const p = parse(c.name); if (!p?.owner || p.mega || p.region) continue;
  const at = zh.indexOf(csv[dex]); if (at > 0) (prefixes[p.owner] ||= new Map()).set(zh.slice(0, at), ((prefixes[p.owner].get(zh.slice(0, at)) || 0) + 1));
}
// the "Mega" word as it is written on the wiki's rows ("超级妙蛙花ex") and whether the space before ex is dropped
const megaWord = '超级';
const compose = (c, inf) => {
  if (inf.cat !== 'Pokemon' || !inf.dex || !csv[inf.dex]) return null;
  const p = parse(c.name); if (!p || p.region) return null;
  // the species must be the name the parse left over: "Charizard" for dex 6, not a form we cannot spell ("Bloodmoon Ursaluna")
  let owner = '';
  if (p.owner) { const m = prefixes[p.owner]; if (!m) return null; owner = best(m); }
  return owner + (p.mega ? megaWord : '') + csv[inf.dex] + (p.xy || '') + (p.ex ? 'ex' : '');
};
// 2b. the wiki has a page per card («鏽蝕組手下（TCG）», header {{N|中文||日本語|English}}), created before the set page: search by the English name and take a page whose header names it
async function cardPage(en) {
  const slug = en.replace(/[^A-Za-z0-9]+/g, '-');
  return cached(`data/raw/cardpage-${slug}.json`, async () => {
    const hits = (await fetchRetry(`${WIKI}?${params({ action: 'query', list: 'search', srsearch: `"${en}"`, srlimit: 8, format: 'json' })}`)).query.search.filter(h => h.title.endsWith('（TCG）'));
    if (!hits.length) return null;
    const j = await fetchRetry(`${WIKI}?${params({ action: 'query', pageids: hits.map(h => h.pageid).join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json' })}`);
    for (const p of Object.values(j.query.pages)) {
      const m = p.revisions?.[0].slots.main['*'].match(/^\{\{N\|([^|]+)\|[^|]*\|[^|]*\|([^}]+)\}\}/);
      if (m && m[2].trim().toLowerCase().replace(/’/g, "'") === en.toLowerCase()) return m[1].trim();
    }
    return null;
  });
}
const pageNames = {};
{
  const need = [...new Set(Object.entries(sets).flatMap(([id, s]) => s.cards.filter(c => !out[id][c.n] && !zhOf.has(c.name) && info[id][c.n].cat !== 'Pokemon').map(c => c.name)))];
  const got = await pool(need, 1, cardPage);
  const sm = await simplify(got.filter(Boolean));
  need.forEach((en, i) => { if (got[i]) pageNames[en] = sm[got[i]].split(' ')[0]; });
}
const unresolved = [];
let composed = 0, reprint = 0, pages = 0;
for (const [id, s] of Object.entries(sets)) for (const c of s.cards) {
  if (out[id][c.n]) continue;
  // 2. a reprint of a card the wiki gave a name for
  if (zhOf.has(c.name)) { out[id][c.n] = best(zhOf.get(c.name)); reprint++; continue; }
  if (pageNames[c.name]) { out[id][c.n] = pageNames[c.name]; pages++; continue; }
  // 3. a Pokémon card with a plain name
  const z = compose(c, info[id][c.n]);
  if (z) { out[id][c.n] = z; composed++; continue; }
  unresolved.push(`${id} ${c.n} ${c.name}`);
}

// --- an English name must not turn into a Chinese name another English name already has (the shop's logic tells cards apart by name)
const owner = new Map();
for (const [id, s] of Object.entries(sets)) for (const c of s.cards) {
  const zh = out[id][c.n]; if (!zh) continue;
  if (owner.has(zh) && owner.get(zh) !== c.name) console.log('  COLLISION', zh, '<-', owner.get(zh), '|', c.name);
  owner.set(zh, c.name);
}

await writeFile('data/names-zh.json', JSON.stringify(out) + '\n');
let total = 0, have = 0;
for (const [id, s] of Object.entries(sets)) {
  const n = s.cards.length, h = Object.keys(out[id]).length; total += n; have += h;
  console.log(id.padEnd(7), `${h}/${n}`, `(wiki ${Object.keys(wiki[id]).length})`);
}
console.log(`total ${have}/${total}; card pages ${pages}, composed ${composed}, reprints ${reprint}, dropped rows ${dropped.length}, unresolved ${unresolved.length}`);
if (dropped.length) console.log('DROPPED (species mismatch):\n  ' + dropped.join('\n  '));
if (unresolved.length) console.log('UNRESOLVED (kept English):\n  ' + unresolved.join('\n  '));
