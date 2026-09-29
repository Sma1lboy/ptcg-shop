// Pulls card lists, rarities and TCGplayer market prices from TCGdex and writes data/cards-<set>.json (imported by src/sets.ts).
// Usage: node scripts/fetch-data.mjs [set ids…]   (default: every set; raw responses are cached in data/raw/, delete it to refresh)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ALL = ['sv08', 'sv10', 'sv08.5', 'sv03.5', 'sv09', 'me01', 'me02', 'me03', 'me04', 'me05']; // keep in sync with src/sets.ts (not imported: it needs the files this script writes)
const SETS = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const API = 'https://api.tcgdex.net/v2/en';

async function getJSON(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) return JSON.parse(await readFile(cacheFile, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (cacheFile) await writeFile(cacheFile, JSON.stringify(j));
        return j;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500 * 2 ** i));
  }
  throw new Error('fetch failed: ' + url);
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const RARITY = {
  'Common': 'C', 'Uncommon': 'U', 'Rare': 'R', 'Double rare': 'RR', 'Ultra Rare': 'UR',
  'Illustration rare': 'IR', 'Special illustration rare': 'SIR', 'Hyper rare': 'HR', 'ACE SPEC Rare': 'ACE',
  'Mega Hyper Rare': 'MHR', // Mega Evolution series: replaces Hyper Rare
};

// TCGplayer keys per printing → our short keys
function prices(card) {
  const p = {}; let updated = null;
  for (const v of card.variants_detailed || []) {
    const tp = v.pricing?.tcgplayer; if (!tp) continue;
    updated = tp.updated || updated;
    const pick = k => tp[k]?.marketPrice ?? null;
    if (v.foil === 'pokeball') p.pb = pick('holofoil');
    else if (v.foil === 'masterball') p.mb = pick('holofoil');
    else if (v.type === 'normal') p.n = pick('normal');
    else if (v.type === 'reverse') p.r = pick('reverse-holofoil');
    else if (v.type === 'holo') p.h = pick('holofoil');
  }
  for (const k in p) if (p[k] == null) delete p[k];
  return { p, updated };
}

await mkdir('data/raw', { recursive: true });
const unknown = new Set();
for (const set of SETS) {
  const s = await getJSON(`${API}/sets/${set}`, `data/raw/set-${set}.json`);
  const cards = await pool(s.cards, 8, c => getJSON(`${API}/cards/${c.id}`, `data/raw/${c.id}.json`));
  let updated = null;
  const rows = cards.map(c => {
    const r = RARITY[c.rarity]; if (!r) unknown.add(`${set}:${c.rarity}`);
    const { p, updated: u } = prices(c); if (u && (!updated || u > updated)) updated = u;
    return { n: c.localId, name: c.name, r: r || c.rarity, p };
  });
  const out = { id: set, name: s.name, total: s.cardCount.total, official: s.cardCount.official, pricesUpdated: updated, cards: rows };
  await writeFile(`data/cards-${set}.json`, JSON.stringify(out) + '\n');
  console.log(set, s.name, rows.length, 'cards, prices', updated);
}
if (unknown.size) console.log('UNMAPPED RARITIES:', [...unknown].join(', '));
