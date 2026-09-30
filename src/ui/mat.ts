// 开包台: tear, flip, reveal — on the three.js table (src/table3d.js) when it can run, else the 2D mat. Deliberately NOT lit-html:
// #mat (and the #stage / #scene3d inside it) is rebuilt only on player actions and then driven by direct DOM work
// (cloneNode slide-outs, class toggles, timed flips, the WebGL canvas) that would corrupt lit's markers.
import type { Pull } from '../sim.ts';
import * as S from '../sim.ts';
import * as FX from '../fx.ts';
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, imgUrl, logoUrl, rar, rarLabel, batchBtn } from './common.ts';
import { face, backFace, cap, mark, toHTML } from './card.ts';
import { showPack } from './share.ts';
import { mountTable, packFront, ready as threeReady } from '../table3d.js';
import { bill } from '../debt.ts';
import { toBook } from './binder.ts';

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// m3d: this pack is on the 3D table; quiet: a 连开 round, no flip sound per card (全部翻开 on the 3D table: the table's onFlip quiet flag).
// Batch on the 3D table: picks = [pack, card] of the cards that fly to the front (cheapest first), up = which picks are face up, torn = packs ripped.
// news: indexes into picks of the cards this batch pulled by hand for the first time (亲手开出).
interface Mat { mode: 'idle' | 'pack' | 'cards' | 'batch'; set: string; cards: Pull[]; packs: Pull[][]; picks: [number, number][]; news: number[]; up: Set<number>; cur: number; busy?: boolean; finished?: boolean; m3d?: boolean; quiet?: boolean; torn?: boolean }
let mat = { mode: 'idle' } as Mat;

// The 3D table's caption line (s3-cap): the printed rarity mark, the rarity's name, the market price.
const capHTML = (c: Pull) => `${toHTML(mark(c, false))}${rarLabel(c.kind)}<b>${money(c.price)}</b>`;
// One card on the 2D mat, the shared card face (card.ts) back to back with the card back. big = the card in hand on the stage
// (hi-res, tap to advance); otherwise a tray thumb (tap to inspect once face-up). The ten-pack builds its own (haulHTML).
function cardHTML(c: Pull, i: number, up: boolean, big?: boolean) {
  const size = big ? 'big' : 'thumb', act = big ? 'advance' : up ? 'peek' : '';
  return `<figure class="slot">
      <button type="button" class="card t${rar(c).t} k-${c.kind}${up ? ' up' : ''}" ${act ? `data-act="${act}"` : 'tabindex="-1"'} data-i="${i}" aria-label="${up ? esc(c.name) : big ? '翻开这张' : `第 ${i + 1} 张（未翻）`}">
        <span class="card-in"><span class="back">${BACK()}</span><span class="face">${toHTML(face(c, size))}</span></span>
      </button>
      <figcaption>${toHTML(cap(c, size))}</figcaption>
    </figure>`;
}
let backMarkup = '';
const BACK = () => (backMarkup ||= toHTML(backFace()));

// Where one pack ranks among simulated packs of the same set, in words a player can quote.
function rankText(setId: string, v: number) {
  const p = S.packPercentile(S.rateKey(setId, G.luckMult()), v), pc = p >= .995 ? '99.5' : (p * 100).toFixed(0);
  return { p, text: `比 ${pc}% 的${G.setById(setId).name}包值钱${p >= .9 ? `，约 ${Math.min(1000, Math.round(1 / (1 - p)))} 包才出一包这样的` : ''}` };
}
const shareBtn = () => '<button type="button" data-act="sharemat">分享这次开包</button>';
function shareSpec() {
  const set = G.setById(mat.set), packs = mat.mode === 'batch' ? mat.packs : [mat.cards];
  const vals = packs.map(S.packValue), bi = vals.indexOf(Math.max(...vals)), cards = packs.flat();
  const best = cards.reduce((a, b) => (b.price > a.price ? b : a)), rk = rankText(set.id, vals[bi]);
  return { set: set.name, en: set.en, n: packs.length, value: vals.reduce((a, b) => a + b, 0), cost: G.wholesale(set.id) * packs.length,
    bestPack: vals[bi], rank: rk.text, pct: rk.p, best, hits: cards.filter(c => S.HITS.includes(c.kind)).length, img: imgUrl(best, 'high'),
    count: cards.length, front: cards.filter(c => S.HITS.includes(c.kind)).sort((a, b) => b.price - a.price).slice(0, 5) }; // the table's front row (RR and up, dearest first): the pack poster lays out the same
}
export type ShareSpec = ReturnType<typeof shareSpec>;

// Where the pull went: the cards new to the binder since the player last looked at it, how full the set is, and the way there.
// named: false after a 连开 that stopped on a new card (its end line already names it)
function bookLine(id: string, named = true) {
  const b = toBook(id), n = b.names.length;
  if (!n) return '';
  return `<p class="to-bk">卡册新插进 <b>${n}</b> 张${named ? `：${b.names.slice(0, 3).map(esc).join('、')}${n > 3 ? ' 等' : ''}` : ''} · 入册 ${b.count}/${b.total}${b.next ? `，${b.next}` : ''}
      <a href="#luck" data-bk-set="${id}">看卡册</a></p>`;
}
function packSummary(cards: Pull[], set: { id: string }) {
  const v = S.packValue(cards), cost = G.wholesale(set.id), d = v - cost;
  const best = cards.reduce((a, b) => (b.price > a.price ? b : a));
  const stock = G.state.stock[set.id] || 0;
  return `<div class="summary">
      <p>这包开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。最值钱：${esc(best.name)}。</p>
      <p class="rank">${rankText(set.id, v).text}。</p>
      ${bookLine(set.id)}
      <div class="btns">
        ${stock ? `<button type="button" class="primary" data-act="open1" data-id="${set.id}">再开一包（剩 ${stock}）</button>` : ''}
        ${shareBtn()}
        ${G.state.cash >= cost ? `<button type="button" data-act="buyopen" data-id="${set.id}">进 1 包马上开</button>` : ''}
      </div></div>`;
}

export function renderMat() {
  const el = $('mat');
  if (mat.mode === 'idle' ? !reduced() : mat.m3d && (mat.mode === 'pack' || mat.mode === 'batch')) {
    if (mat3D(el)) return;
    if (mat.mode === 'idle') waitFor3D(); else mat.m3d = false;
  }
  if (table) { table.dispose(); table = null; }
  el.classList.remove('m3d');
  if (mat.mode === 'idle') { el.innerHTML = `<div class="mat-head"><h2>今天拆哪包？</h2><span id="m3-line"></span>${sndBtn()}</div><div class="mat-idle" id="mat-idle"></div>`; renderIdle(); return; }
  const set = G.setById(mat.set);
  if (mat.mode === 'pack') {
    // the pack in hand is the 3D pack's printed front (table3d.js packFront), the same art as the idle stacks; the top crimp is the
    // art's own top strip (--art), so tearing it pulls off the printed edge. Logo + name on foil until the art has been drawn.
    const art = fronts[set.id];
    if (!(set.id in fronts)) { fronts[set.id] = ''; packFront(set.id).then((u: string | null) => { if (u) { fronts[set.id] = u; if (mat.mode === 'pack' && mat.set === set.id && !el.querySelector('.pack:is(.dragging, .torn)')) renderMat(); } }); }
    el.innerHTML = `<div class="mat-head"><h2>${set.name}</h2><span class="pack-hint">点击撕开</span>${sndBtn()}</div>
      <div class="mat-pack"><button type="button" class="pack${art ? ' art' : ''}" data-act="tear" aria-label="撕开这包${set.name}"${art ? ` style="--art: url(${art})"` : ''}>
        <span class="pack-crimp"></span>${art ? `<img class="pack-face" src="${art}" alt="">` : `<img src="${logoUrl(set.id)}" alt=""><span class="pack-name">${set.name}</span>`}<span class="pack-crimp bottom"></span></button></div>`;
    return;
  }
  if (mat.mode === 'cards') {
    const done = mat.up.size === mat.cards.length;
    el.innerHTML = `<div class="mat-head"><h2>${set.name}</h2><span id="mat-prog">${prog()}</span>${sndBtn()}
        ${done ? '' : '<button type="button" class="ghost" data-act="flipall">全部翻开</button>'}</div>
        <div class="deck"><div class="stage" id="stage">${cardHTML(mat.cards[mat.cur], mat.cur, mat.up.has(mat.cur), true)}</div>
        <div class="spread tray">${mat.cards.map((c, i) => cardHTML(c, i, mat.up.has(i))).join('')}</div></div>
        ${done ? packSummary(mat.cards, set) : ''}`;
    const st = $('stage').firstElementChild!; if (!mat.up.size) st.classList.add('deal');
    return;
  }
  // batch
  const cards = mat.packs.flat();
  const v = S.packValue(cards), cost = G.wholesale(set.id) * mat.packs.length, d = v - cost;
  el.innerHTML = `<div class="mat-head"><h2>${set.name} × ${mat.packs.length}</h2><span id="mat-prog">${run ? runProg() : `开出 ${money(v)} · 进货 ${money(cost)} ·
      <b class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</b>`}</span>${sndBtn()}${run && !run.end ? stopBtn() : ''}</div>
      ${haulHTML()}
      ${mat.finished ? batchSummary() : ''}`;
}

// Idle mat without the 3D table (reduced motion, no WebGL, three.js still loading): the same 今天拆哪包？ as the 3D table — each
// set's stack of warehouse packs in its printed foil (table3d.js packFront, the 3D pack's own art), labelled like the 3D labels
// (shelfItems), the locked sets as one line. One tap opens one (or buys one and opens it when the warehouse is empty).
// lit is safe here: #mat-idle is created fresh each time the mat goes idle, and innerHTML drops it (and lit's part) on the next pack.
const fronts: Record<string, string> = {}; // set → the pack front's data URL, '' while it's drawn or when it can't be
// The stack under the top pack: one crimp edge per 8 packs, at most 5, like the 3D stacks growing with the stock.
const stackShadow = (n: number) => Array.from({ length: Math.min(5, Math.ceil(n / 8)) }, (_, i) => `0 ${3 * i + 2}px 0 var(--back-2), 0 ${3 * i + 3}px 0 var(--foil-3)`)
  .concat('0 18px 26px rgba(0, 0, 0, .5)').join(', ');
function renderIdle() {
  const box = document.getElementById('mat-idle'); if (!box) return;
  const items = shelfItems(), line = document.getElementById('m3-line'); if (line) line.textContent = idleLine();
  for (const it of items) if (!(it.set in fronts)) { fronts[it.set] = ''; packFront(it.set).then((u: string | null) => { if (u) { fronts[it.set] = u; renderIdle(); } }); }
  render(html`<ul class="idle-packs">${items.map(it => html`<li>
      <button type="button" class="idle-pack${it.n ? '' : ' none'}" data-act="${it.n ? 'open1' : 'buyopen'}" data-id="${it.set}" ?disabled=${it.off}>
        <span class="ip-face${fronts[it.set] ? ' art' : ''}" style="box-shadow: ${stackShadow(it.n)}">${fronts[it.set] ? html`<img src="${fronts[it.set]}" alt="">`
          : html`<img src="${logoUrl(it.set)}" alt=""><span class="ip-name">${it.name}</span>`}</span>
        <span class="ip-tag"><b>${it.name}</b><small>${it.note}${it.price ? html`<span>${it.price}</span>` : ''}</small></span></button></li>`)}</ul>
    <p class="ip-next">${nextUnlock()}</p>`, box);
}
export const refreshIdle = () => { if (mat.mode === 'idle') { if (table) shelf3D(); else renderIdle(); } };

// ---------- 3D table (src/table3d.js) ----------
// The table only presents mat.cards; mat.up / mat.cur stay the truth, so a lost WebGL context hands the same pack to the 2D mat mid-reveal.
let table: ReturnType<typeof mountTable> = null;
const touch = () => matchMedia('(pointer: coarse)').matches;
// The idle table only lays out sets that can be opened; the locked ones are this one line (the next unlock and how far off it is).
const nextUnlock = () => {
  const locked = SETS.filter(x => !G.unlocked(x.id)).sort((a, b) => G.unlockAt(a.id) - G.unlockAt(b.id));
  return locked.length ? `下一个解锁：${locked[0].name} · 营收 ${money(G.revenue())} / $${G.unlockAt(locked[0].id).toLocaleString('en-US')}` : '';
};
const HINT = { shelf: nextUnlock, pack: () => touch() ? '按住封口往右拖，撕开。点一下也行' : '按住封口往右拖，撕开。点一下或按空格也行',
  cards: () => touch() ? '点一下，或把最前面这张往右滑开' : '点一下、按空格，或把最前面这张往右滑开', done: () => '点桌上的卡，拿起来细看',
  batch: () => touch() ? '点一下全部撕开，或按住从左往右划过这排包' : '点一下或按空格全部撕开，也可以按住从左往右划过这排包',
  batchCards: () => touch() ? '点一下，翻下一张' : '点一下或按空格，翻下一张',
  run: () => `${runProg()} · 出新卡就停` }; // the header line is cut short on phones: the run's progress is repeated here
const batch = () => mat.mode === 'batch';
const picked = () => mat.picks.map(([p, i]) => mat.packs[p][i]);
const head3D = () => {
  if (mat.mode === 'idle') { $('m3-head').innerHTML = `<h2>今天拆哪包？</h2><span id="m3-line">${idleLine()}</span>${sndBtn()}`; return; }
  const live = batch() ? mat.torn : mat.mode === 'cards';
  $('m3-head').innerHTML = `<h2>${G.setById(mat.set).name}${batch() ? ` × ${mat.packs.length}` : ''}</h2><span id="mat-prog">${run ? runProg() : live ? prog() : ''}</span>${sndBtn()}
      ${run && !run.end ? stopBtn() : live && !mat.finished ? '<button type="button" class="ghost" data-act="flipall">全部翻开</button>' : ''}`;
};
// An empty warehouse (a new shop): the head says the guide's first step too; the pack on the table is the other way in.
// A phone's head row has room for about ten characters beside 今天拆哪包？ and 音效: the short form, so the step isn't cut to 「先去…」.
const idleLine = () => Object.values(G.state.stock).some(n => n > 0) ? '点桌上的包，开一包'
  : matchMedia('(max-width: 779px)').matches ? '先去「货柜」进货' : '仓库还空着：先去货柜进货，或点桌上的包现进现开';
const hint3D = (k: keyof typeof HINT) => { const h = document.getElementById('s3-hint'); if (h) h.textContent = HINT[k](); };
const on3D = {
  onTear() {
    if (batch()) { if (mat.torn) return; mat.torn = true; } else if (mat.mode === 'pack') mat.mode = 'cards'; else return;
    FX.tear(); head3D(); hint3D(run ? 'run' : batch() ? 'batchCards' : 'cards');
    if (run) table!.flipAll(); // 连开: the picks turn over together as soon as they're out, no tap per card
  },
  onFlip(i: number, c: Pull, quiet = false) {
    mat.up.add(i); mat.cur = i;
    const pg = document.getElementById('mat-prog'); if (pg && !run) pg.textContent = prog();
    const none = batch() && !mat.picks.some(([p, k]) => S.HITS.includes(mat.packs[p][k].kind)); // a batch without a single hit flies its best card instead
    if (quiet) return; // turned in a sweep with others (table3d.js): the last of the sweep speaks for them
    if (!run) caption(c, none ? `${mat.packs.length} 包一张好卡都没有 · ` : '', batch() && mat.news.includes(i)); // 连开 turns them all at once: the new card gets its caption when it's held up (showNew)
    if (!mat.quiet) FX.flip(rar(c).t);
  },
  onPick(k: number) { document.querySelectorAll<HTMLButtonElement>('#s3-shelf button')[k]?.click(); }, // through events.ts, like the label itself
  onHold() { const cap = document.getElementById('s3-cap'); if (cap) cap.innerHTML = ''; },
  onDone() { on3D.onHold(); hint3D('done'); finish(); },
  onLost() {
    table = null; mat.m3d = false; renderMat();
    if (batch()) revealBatch(mat); else if (mat.cards && mat.up.size === mat.cards.length) finish();
  },
};
// Returns false when the 3D table can't run (no WebGL, three.js not loaded yet or at all, reduced motion): the caller draws the 2D mat.
function mat3D(el: HTMLElement) {
  if (!table) {
    if (reduced()) return false;
    el.innerHTML = `<div class="mat-head" id="m3-head"></div><div class="scene3d" id="scene3d"><p class="s3-cap" id="s3-cap"></p><p class="s3-hint" id="s3-hint"></p><div class="s3-tags"></div></div>`;
    table = mountTable($('scene3d'), { ...on3D, reducedMotion: reduced() });
    if (!table) return false;
    el.classList.add('m3d');
  }
  if (mat.mode === 'idle') { shelf3D(); return true; }
  document.getElementById('s3-shelf')?.remove();
  el.querySelector('.summary')?.remove(); $('s3-cap').innerHTML = '';
  head3D(); hint3D(run ? 'run' : batch() ? 'batch' : 'pack');
  if (batch()) { table.showBatch(mat.set, mat.packs, mat.picks, { news: mat.news, quick: !!run }); if (run) table.flip(0); } else table.showPack(mat.set, mat.cards);
  return true;
}

// The idle 3D table (今天拆哪包？): every set's stack of warehouse packs, labelled underneath by a button that opens one (or buys
// one and opens it). The stock / price / unlock reads for it all live in shelfItems().
function shelfItems() {
  const s = G.state;
  const narrow = matchMedia('(max-width: 779px), (orientation: landscape) and (max-height: 520px)').matches; // phones (and sideways ones): small stacks, a label gets two lines (name + one short line) or it covers the pack behind it
  return SETS.filter(x => G.unlocked(x.id)).map(x => {
    const n = s.stock[x.id] || 0, w = G.wholesale(x.id), poor = !n && s.cash < w;
    return { set: x.id, n, off: poor, name: x.name, note: n ? `仓库 ${n} 包` : poor ? (narrow ? '钱不够' : '现金不够进货') : narrow ? '' : '进 1 包就开', price: n || (poor && narrow) ? '' : money(w) };
  });
}
// Imperative like the rest of #scene3d (CLAUDE.md): the buttons are made once, then only their text / action / disabled change.
function shelf3D() {
  let box = document.getElementById('s3-shelf');
  if (!box) { box = document.createElement('div'); box.className = 's3-shelf'; box.id = 's3-shelf'; $('scene3d').append(box); head3D(); }
  const items = shelfItems(), ids = items.map(i => i.set).join();
  if (box.dataset.ids !== ids) { box.dataset.ids = ids; box.replaceChildren(); } // a set unlocked: the buttons' hover indexes are per position
  hint3D('shelf');
  const line = document.getElementById('m3-line'); if (line && line.textContent !== idleLine()) line.textContent = idleLine();
  items.forEach((it, k) => {
    let b = box.children[k] as HTMLButtonElement | undefined;
    if (!b) {
      b = box.appendChild(document.createElement('button')); b.type = 'button'; b.append(document.createElement('b'), document.createElement('small'));
      const hov = (on: boolean) => () => table?.hover(on ? k : -1);
      b.addEventListener('pointerenter', hov(true)); b.addEventListener('pointerleave', hov(false)); b.addEventListener('focus', hov(true)); b.addEventListener('blur', hov(false));
    }
    b.dataset.act = it.n ? 'open1' : 'buyopen'; b.dataset.id = it.set; b.disabled = it.off;
    b.children[0].textContent = it.name; b.children[1].textContent = it.note;
    if (it.price) { const p = b.children[1].appendChild(document.createElement('span')); p.textContent = it.price; } // phones: the price goes on its own line (style.css)
  });
  table!.showShelf(items.map(({ set, n, off }) => ({ set, n, off })));
}
let waited = false; // three.js still loading at boot: the 2D idle mat now, the 3D table as soon as it's in
function waitFor3D() { if (!waited) { waited = true; threeReady.then(ok => { if (ok && mat.mode === 'idle' && !table) renderMat(); }); } }

// ---------- reveal ----------
// While a pack is being revealed the side panels (luck, binder, log, singles) stay frozen, otherwise they show the pull early.
export let hold = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The 2D ten-pack, laid out as the 3D table's finished haul (table3d.js haulOf, DESIGN.md「十连翻完的那一眼」): the best few picks
// (RR and up, dearest first; the dearest pick alone when there's no hit) side by side in a front row, the dearest in the middle,
// a size up and lifted, each over a plate (name, rarity, market price); the other picks (plain new cards, lesser hits) shingled in
// one row behind under one tag. Phones: three in front, or the names don't fit. Indexes are into picked().
function haulOf() {
  const cs = picked(), byPrice = cs.map((_, k) => k).sort((a, b) => cs[b].price - cs[a].price), hits = byPrice.filter(k => rar(cs[k]).t >= 2);
  const top = hits.length ? hits.slice(0, matchMedia('(max-width: 779px)').matches ? 3 : 5) : byPrice.slice(0, 1);
  return { top, rest: cs.map((_, k) => k).filter(k => !top.includes(k)) };
}
function haulHTML() {
  const cs = picked(), { top, rest } = haulOf(), nu = (k: number) => (mat.news.includes(k) ? '<i class="hand-new">新</i>' : '');
  const row: number[] = []; top.forEach((k, r) => (r % 2 ? row.unshift(k) : row.push(k))); // centre out: the dearest in the middle
  const btn = (k: number, size: 'show' | 'thumb') => `<button type="button" class="card t${rar(cs[k]).t} k-${cs[k].kind}" tabindex="-1" data-i="${k}" aria-label="第 ${k + 1} 张（未翻）">
      <span class="card-in"><span class="back">${BACK()}</span><span class="face">${toHTML(face(cs[k], size))}</span></span></button>`;
  const m = rest.filter(k => mat.news.includes(k)).length, v = rest.reduce((a, k) => a + cs[k].price, 0);
  return `<div class="haul">${rest.length ? `<div class="haul-rest"><div class="haul-strip" style="--n: ${rest.length}">${rest.map(k => btn(k, 'thumb')).join('')}</div>
      <p class="haul-sum">另 ${rest.length} 张${m ? `，新卡 ${m}` : ''} · 合计 ${money(v)}</p></div>` : ''}
    <div class="haul-top">${row.map(k => `<figure class="slot${k === top[0] ? ' best' : ''}">${btn(k, 'show')}
      <figcaption class="s3-top${k === top[0] ? ' best' : ''}"><b class="s3-name">${nu(k)}${esc(cs[k].name)}</b>${toHTML(cap(cs[k], 'big'))}</figcaption></figure>`).join('')}</div></div>`;
}
const sndBtn = () => `<button type="button" class="ghost snd" data-act="mute">音效 ${FX.muted() ? '关' : '开'}</button>`;
const prog = () => {
  const cs = batch() ? picked() : mat.cards, label = !batch() ? '已翻' : mat.news.length ? '翻开' : S.HITS.includes(cs[0].kind) ? '好卡' : '没出好卡，最值钱的';
  return `${label} ${mat.up.size}/${cs.length} · ${money(cs.reduce((s, c, k) => s + (mat.up.has(k) ? c.price : 0), 0))}`;
};
const ready = (img: HTMLImageElement | null) => (!img || img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 1500); }));
const armThumb = (btn: HTMLElement, c: Pull, peek?: boolean) => { btn.classList.add('up'); btn.setAttribute('aria-label', c.name); if (peek) { btn.dataset.act = 'peek'; btn.removeAttribute('tabindex'); } };

// main.ts re-renders every panel on this event (then goals.ts, which listens after it).
function release() { if (hold) { hold = false; document.dispatchEvent(new Event('ptcg:release')); } }

// Flip time by rarity tier: bulk cards fly past, chase cards slow down. The last (rare) slot is always at least 1.2 s so a miss and a hit look the same until the flip lands.
const FLIP_MS = [140, 380, 600, 900, 1300, 1300];
// The card just seen slides off to the left as the next one comes up, like moving the top card to the back of the stack.
function slideAway(stage: HTMLElement) {
  const old = stage.firstElementChild; if (!old || reduced()) return;
  const g = old.cloneNode(true) as HTMLElement; g.classList.add('away'); g.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'));
  g.addEventListener('animationend', () => g.remove()); stage.append(g);
}

// One tap = next card slides out of the pack and flips. The last card (the rare slot) flips slowly for every pack, hit or not.
export function advance() {
  if (mat.m3d) return mat.mode === 'cards' && table!.flip(mat.up.size);
  if (mat.mode !== 'cards' || mat.busy || mat.up.size >= mat.cards.length) return false;
  const tok = mat, i = mat.up.size, stage = $('stage'), fresh = mat.cur !== i, bulk = rar(mat.cards[i]).t === 0;
  mat.busy = true;
  if (fresh) {
    slideAway(stage);
    mat.cur = i; stage.innerHTML = cardHTML(mat.cards[i], i, false, true); stage.firstElementChild!.classList.add('deal');
    if (bulk) stage.firstElementChild!.classList.add('quick');
  }
  const btn = stage.querySelector<HTMLElement>('.card')!;
  ready(btn.querySelector('img')).then(() => setTimeout(() => { if (mat === tok) reveal(tok, i, btn); }, fresh && !reduced() ? (bulk ? 60 : 240) : 0));
  return true;
}

function reveal(tok: Mat, i: number, btn: HTMLElement) {
  const c = tok.cards[i], t = rar(c).t, last = i === tok.cards.length - 1, ms = reduced() ? 0 : Math.max(FLIP_MS[t], last ? 1200 : 0);
  btn.style.setProperty('--flip', ms + 'ms');
  btn.style.setProperty('--ease', last ? 'cubic-bezier(.55, 0, .25, 1)' : 'cubic-bezier(.2, .7, .2, 1)');
  tok.up.add(i); btn.classList.add('up'); btn.setAttribute('aria-label', c.name);
  const th = document.querySelector<HTMLElement>(`.tray .card[data-i="${i}"]`); if (th) armThumb(th, c, true);
  const pg = document.getElementById('mat-prog'); if (pg) pg.textContent = prog();
  if (last) FX.swell(ms);
  if (t >= 4 && !reduced()) spotlight(ms + 1800);
  setTimeout(() => { FX.flip(t); FX.burst($('stage'), t); }, ms / 2); // the face turns toward the player halfway through
  setTimeout(() => { tok.busy = false; if (mat === tok && tok.up.size === tok.cards.length) finish(); }, ms + 80);
}

// UR-and-up pulls: dim the rest of the mat so the card stands alone.
let spotTimer = 0;
function spotlight(ms: number) { const m = $('mat'); m.classList.add('spot'); clearTimeout(spotTimer); spotTimer = setTimeout(() => m.classList.remove('spot'), ms); }

function finish() {
  if (mat.finished) return; mat.finished = true;
  const more = roundEnd(), el = $('mat'); el.querySelector('[data-act="flipall"]')?.remove();
  if (run) runHead();
  // Between 连开 rounds no summary: the head already has the run's progress and 停, and a summary coming and going every round
  // would resize the canvas (the table reframes) and throw the hint between the bottom and the top edge.
  if (more) return;
  if (!el.querySelector('.summary') || run) { el.querySelector('.summary')?.remove(); el.insertAdjacentHTML('beforeend', batch() ? batchSummary() : packSummary(mat.cards, G.setById(mat.set))); }
  if (run?.end === 'new') { const tok = mat; showNew().then(() => { if (mat === tok) release(); }); } // the story waits until the new card has been seen
  else release(); // after the summary is in: the guide anchors its share step on the summary's button
}
function batchSummary() {
  const set = G.setById(mat.set), sp = shareSpec(), stock = G.state.stock[set.id] || 0, r = run;
  const [n, v, cost] = r ? [r.packs, r.value, r.cost] : [mat.packs.length, S.packValue(mat.packs.flat()), G.wholesale(set.id) * mat.packs.length], d = v - cost;
  const again = hunt(set.id) && canGo(set.id) ? `<button type="button"${stock ? '' : ' class="primary"'} data-act="autorun" data-id="${set.id}">连开到出新卡</button>` : '';
  return `<div class="summary">
      <p>${r ? `连开 ${r.rounds} 轮 ${n} 包${r.bought ? `（其中现进 ${r.bought} 包）` : ''}` : `${n} 包`}开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。</p>
      ${r ? `<p class="run-end">${runEnd(r, set.id)}</p>` : ''}
      <p class="rank">${r ? '最后一轮' : ''}最好的一包 ${money(sp.bestPack)}，${sp.rank}。</p>
      ${bookLine(set.id, r?.end !== 'new')}
      <div class="btns">${stock ? `<button type="button" class="primary" data-act="${batchBtn(set.id).act}" data-id="${set.id}">${batchBtn(set.id, true).text}</button>` : ''}${again}${shareBtn()}</div></div>`;
}

// ---------- 连开 ----------
// 连开到出新卡: rounds of up to ten packs, revealed without a tap per card (the 3D table runs a little faster), until a card
// never pulled by hand in this set comes up, the player stops it, RUN_MAX rounds pass, or the warehouse is empty and the cash
// can't restock it. When the warehouse has fewer than ten it tops up at the wholesale price, the same buy as 补 N 包，开十连.
// One hold for the whole run: the side panels, achievements and story wait until it ends, as they wait for any pack.
const RUN_MAX = 50, RUN_GAP = 600;
interface Run { id: string; rounds: number; packs: number; value: number; cost: number; bought: number; fresh: Pull[]; end: '' | 'new' | 'stop' | 'max' | 'empty'; stop?: boolean }
let run: Run | null = null;
// Offered once ten packs would most likely not bring a new card (the easiest missing one takes more than ten packs on
// average); before that every 十连 stops on new cards anyway.
export const huntable = (id: string) => hunt(id) && canGo(id); // the 图鉴 row offers 连开 too (goals.ts)
const hunt = (id: string) => { const m = G.handMissing(id); return m.length > 0 && m[m.length - 1].packs > 10; };
// Top-ups never spend the cash this week's bill needs: a hands-off run must not be what makes the bill go to a loan.
const spare = () => G.state.cash - (bill(G)?.amount ?? 0);
const canGo = (id: string) => (G.state.stock[id] || 0) > 0 || spare() >= G.wholesale(id);
const stopBtn = () => `<button type="button" class="ghost" data-act="runstop"${run?.stop ? ' disabled' : ''}>${run?.stop ? '这轮开完就停' : '停'}</button>`;
const runProg = () => { const r = run!; return `连开第 ${r.rounds + (mat.finished ? 0 : 1)} 轮 · 已开 ${r.packs + (mat.finished ? 0 : mat.packs.length)} 包 · 亲手开出 ${G.handCount(r.id) - (mat.finished ? 0 : mat.news.length)}/${G.dexTotal(r.id)}${r.bought ? ` · 现进 ${r.bought} 包` : ''}`; }; // the round's new cards count once they're shown
function runEnd(r: Run, id: string) {
  const h = G.handCount(id), tot = G.dexTotal(id);
  if (r.end === 'new') return `亲手开出新卡：${r.fresh.map(c => esc(c.name)).join('、')}。${G.setById(id).name}亲手开出 ${h}/${tot}。`;
  const miss = G.handMissing(id), last = miss.length ? `，${miss.length > 1 ? '最难的一张' : '这张'}平均约 ${Math.round(miss[0].packs).toLocaleString('en-US')} 包出一张` : '';
  const why = r.end === 'max' ? `连开 ${RUN_MAX} 轮还没出新卡` : r.end === 'empty' ? '仓库空了，现金留着付这周的账单，不够再进' : '停下了';
  return `${why}。${G.setById(id).name}亲手开出 ${h}/${tot}，还差 ${tot - h} 张${last}。`;
}
export function startRun(id: string) { if (hold) return; run = { id, rounds: 0, packs: 0, value: 0, cost: 0, bought: 0, fresh: [], end: '' }; nextRound(run); }
function nextRound(r: Run) {
  const n = G.state.stock[r.id] || 0, top = n >= 10 ? 0 : Math.max(0, Math.min(10 - n, Math.floor(spare() / G.wholesale(r.id))));
  if (top) { const n0 = n; if (G.buy(r.id, top)) r.bought += (G.state.stock[r.id] || 0) - n0; }
  openBatch(r.id, true);
}
// A round's reveal is done (finish): tally it, then either queue the next round (true: keep holding) or end the run here.
function roundEnd() {
  const r = run; if (!r || !batch()) return false;
  r.rounds++; r.packs += mat.packs.length; r.value += S.packValue(mat.packs.flat()); r.cost += G.wholesale(r.id) * mat.packs.length;
  r.fresh.push(...mat.news.map(k => picked()[k]));
  r.end = r.fresh.length ? 'new' : r.stop ? 'stop' : r.rounds >= RUN_MAX ? 'max' : !canGo(r.id) ? 'empty' : '';
  if (r.end) return false;
  const tok = mat;
  setTimeout(() => {
    if (mat !== tok || run !== r) return;
    if (r.stop) { r.end = 'stop'; $('mat').querySelector('.summary')?.remove(); $('mat').insertAdjacentHTML('beforeend', batchSummary()); runHead(); release(); }
    else nextRound(r);
  }, RUN_GAP);
  return true;
}
function runHead() {
  if (table) return head3D();
  const pg = document.getElementById('mat-prog'); if (pg) pg.textContent = runProg();
  if (run?.end) $('mat').querySelector('.mat-head [data-act="runstop"]')?.remove();
}
export function stopRun() {
  const r = run; if (!r || r.end) return; r.stop = true;
  document.querySelectorAll<HTMLButtonElement>('#mat [data-act="runstop"]').forEach(b => { b.disabled = true; b.textContent = '这轮开完就停'; });
}
// The run stopped on a new card: the dearest new one is picked up and held to the camera (3D), with its caption.
function showNew() {
  const k = mat.news.reduce((a, b) => (picked()[b].price > picked()[a].price ? b : a)), c = picked()[k];
  FX.flip(rar(c).t);
  if (!table) return Promise.resolve();
  return table.lookAt(k).then(() => { if (run?.end === 'new') caption(c, '', true); return new Promise(r => setTimeout(r, 1800)); });
}
function caption(c: Pull, pre: string, fresh: boolean) {
  const cap = document.getElementById('s3-cap'); if (!cap) return;
  cap.className = `s3-cap t${rar(c).t}`; cap.innerHTML = `<b class="s3-name">${fresh ? '<i class="hand-new">新 · 亲手开出</i>' : ''}${pre}${esc(c.name)}</b>${capHTML(c)}`;
}

// Ten packs at once on the 2D mat: the row behind turns over in one sweep, then the front row one card at a time, cheapest first,
// the dearest last. A batch without a single hit turns its one card quietly after the miss sound.
function revealBatch(tok: Mat) {
  const cs = picked(), { top } = haulOf(), el = (k: number) => document.querySelector<HTMLElement>(`#mat .haul .card[data-i="${k}"]`)!;
  const rest = [...document.querySelectorAll<HTMLElement>('#mat .haul-rest .card')], front = [...top].reverse(), none = rar(cs[top[0]]).t < 2;
  const at = reduced() ? () => 0 : (k: number) => 350 + (rest.length ? 450 : 0) + k * Math.min(420, 2000 / front.length) + (k === front.length - 1 ? 400 : 0);
  if (none) FX.miss();
  if (rest.length) setTimeout(() => { if (mat !== tok) return; rest.forEach(b => armThumb(b, cs[+b.dataset.i!], true)); FX.flip(0); }, reduced() ? 0 : 350);
  front.forEach((k, j) => setTimeout(() => {
    if (mat !== tok) return;
    const t = rar(cs[k]).t, b = el(k); armThumb(b, cs[k], true);
    if (none) return;
    if (t >= 4 && j === front.length - 1 && !reduced()) spotlight(2200);
    FX.flip(t); FX.burst(b.closest('.slot'), t);
  }, at(j)));
  setTimeout(() => { if (mat === tok) finish(); }, at(front.length - 1) + (reduced() ? 0 : 1200));
}

// ---------- actions (called from events.ts) ----------
// Warm the cache before the flips (CORS mode, so the share poster can reuse it).
const warm = (cards: Pull[]) => cards.forEach(c => { if (c.r !== 'E') for (const size of ['low', 'high']) { const i = new Image(); i.crossOrigin = 'anonymous'; i.src = imgUrl(c, size); } });
// A pack started from lower down the page (the rail's 进 1 包就开 reached with the keys, which scroll it into view) left the
// table's head under the sticky top bar: bring the whole table back into view, under the bar.
function frameMat() {
  const r = $('mat').getBoundingClientRect(), bar = document.querySelector('.top')?.getBoundingClientRect().bottom ?? 0;
  if (r.height && r.top < bar) scrollBy({ top: r.top - bar - 8, behavior: reduced() ? 'auto' : 'smooth' });
}
export function startPack(id: string) {
  run = null; hold = true;
  const [cards] = G.open(id, 1); if (!cards) { hold = false; return; }
  warm(cards);
  mat = { mode: 'pack', set: id, cards, up: new Set(), cur: 0, m3d: true } as Mat;
  renderMat(); frameMat();
}
// What flies to the front of the 3D table: every hit and every card new to 亲手开出; a batch with neither shows its best
// card. Plain ones (below RR) first, then the hits, each cheapest first (best last): the table turns the plain ones in one sweep. fresh: the new cards (first copy of each), from handNew() before the packs were opened.
function pickOrder(packs: Pull[][], fresh: Set<Pull>) {
  const all = packs.flatMap((p, pi) => p.map((c, ci) => ({ c, at: [pi, ci] as [number, number] })));
  const hits = all.filter(x => S.HITS.includes(x.c.kind) || fresh.has(x.c));
  const plain = (c: Pull) => (rar(c).t < 2 ? 0 : 1);
  return (hits.length ? hits : [all.reduce((a, b) => (b.c.price > a.c.price ? b : a))]).sort((a, b) => plain(a.c) - plain(b.c) || a.c.price - b.c.price).map(x => x.at);
}
// The card numbers of a set already pulled by hand (state.dex keys are set|n|kind; energy isn't a card of the set).
const handHave = (id: string) => new Set(Object.keys(G.state.dex).filter(k => k.startsWith(id + '|')).map(k => k.split('|')[1]));
function handNew(packs: Pull[][], have: Set<string>) {
  const fresh = new Set<Pull>();
  for (const c of packs.flat()) if (c.r !== 'E' && !have.has(c.n)) { have.add(c.n); fresh.add(c); }
  return fresh;
}
// keep: the next round of a 连开 run; any other open ends the run.
export function openBatch(id: string, keep = false) {
  if (!keep) run = null;
  hold = true; const have = handHave(id), packs = G.open(id, 10); if (!packs.length) { run = null; release(); return; }
  const fresh = handNew(packs, have), picks = pickOrder(packs, fresh);
  mat = { mode: 'batch', set: id, packs, picks, news: picks.flatMap(([p, i], k) => (fresh.has(packs[p][i]) ? [k] : [])), up: new Set(), cur: 0, m3d: true, quiet: !!run } as Mat;
  warm(picked());
  renderMat(); if (!keep) frameMat();
  if (!mat.m3d) revealBatch(mat);
}
export function tear(b: HTMLElement) { const tok = mat; FX.tear(); b.classList.add('torn'); setTimeout(() => { if (mat !== tok) return; mat.mode = 'cards'; mat.cur = 0; renderMat(); }, reduced() ? 0 : 380); }
export function peek(i: number) {
  if (batch()) return peekBig(picked()[i]);
  if (!mat.busy) { mat.cur = i; $('stage').innerHTML = cardHTML(mat.cards[mat.cur], mat.cur, true, true); }
}
// A card on the 2D ten-pack mat, picked up to look at (the 3D table lifts it to the eye): a native popover, the card in hand with
// its caption; a tap anywhere or Esc puts it back.
function peekBig(c: Pull) {
  let p = document.getElementById('mat-peek');
  if (!p) { p = document.body.appendChild(document.createElement('div')); p.id = 'mat-peek'; p.className = 'mat-peek'; p.setAttribute('popover', ''); p.addEventListener('click', () => p!.hidePopover()); }
  p.innerHTML = `<figure class="slot">${toHTML(face(c, 'big'))}<figcaption class="s3-top best"><b class="s3-name">${esc(c.name)}</b>${toHTML(cap(c, 'big'))}</figcaption></figure>`;
  p.showPopover();
}
export function flipAll() { if (mat.m3d) { table!.flipAll(); return; } mat.cards.forEach((_, i) => mat.up.add(i)); mat.cur = mat.cards.length - 1; renderMat(); finish(); }
export function toggleMute() { FX.setMuted(!FX.muted()); }
document.addEventListener('ptcg:sound', () => document.querySelectorAll('.snd').forEach(x => { x.textContent = `音效 ${FX.muted() ? '关' : '开'}`; })); // also muted from the 声音 panel
export function shareMat() { showPack(shareSpec()); }
export function resetMat() { run = null; hold = false; G.reset(); mat = { mode: 'idle' } as Mat; renderMat(); }

// ---------- input ----------
export function bindMatInput() {
  // Swipe the card on the stage sideways to send it to the back (same as a tap). Taps right after a swipe are ignored.
  let swipe: { x: number; y: number } | null = null, swiped = 0;
  document.addEventListener('pointerdown', e => { swipe = (e.target as Element).closest('.stage .card') ? { x: e.clientX, y: e.clientY } : null; });
  document.addEventListener('pointerup', e => {
    if (!swipe) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) { swiped = Date.now(); FX.unlock(); advance(); }
  });
  document.addEventListener('click', e => { if (Date.now() - swiped < 120) e.stopPropagation(); }, true);

  // Drag the top of the sealed pack to the right to rip it; a plain tap or Space still works.
  const TEAR_PX = 150; let rip: { p: HTMLElement; x: number } | null = null, ripMoved = false;
  document.addEventListener('pointerdown', e => {
    const p = (e.target as Element).closest<HTMLElement>('.pack'); if (!p || p.classList.contains('torn')) return;
    rip = { p, x: e.clientX }; ripMoved = false; p.setPointerCapture?.(e.pointerId); p.classList.add('dragging');
  });
  document.addEventListener('pointermove', e => {
    if (!rip) return; const d = Math.max(0, e.clientX - rip.x);
    if (d > 6) ripMoved = true;
    rip.p.style.setProperty('--tear', Math.min(1, d / TEAR_PX).toFixed(2));
  });
  document.addEventListener('pointerup', e => {
    if (!rip) return; const { p } = rip, done = e.clientX - rip.x >= TEAR_PX * .7; rip = null;
    p.classList.remove('dragging'); if (!done) { p.style.removeProperty('--tear'); return; }
    p.style.removeProperty('--tear'); ripMoved = true; ripGo = true; p.click();
  });
  // A drag ends in a native click on the pack; swallow it (ripGo lets our own click through once).
  let ripGo = false;
  document.addEventListener('click', e => { if (!ripMoved || !(e.target as Element).closest('.pack')) return; if (ripGo) { ripGo = false; return; } e.stopPropagation(); }, true);

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || (e.target as Element).closest('input, textarea') || $('mat').closest('[hidden]')) return; // not while another page is showing
    FX.unlock();
    if (mat.mode === 'pack') { e.preventDefault(); if (mat.m3d) table!.flip(0); else document.querySelector<HTMLElement>('.pack')?.click(); }
    else if (mat.mode === 'cards' && (mat.m3d ? !mat.finished : mat.up.size < mat.cards.length)) { e.preventDefault(); advance(); }
    else if (batch() && mat.m3d && !mat.finished) { e.preventDefault(); if (!run) table!.flip(mat.up.size); }
    else if (table && !(e.target as Element).closest('button, a')) e.preventDefault(); // a finished or idle 3D table: Space doesn't scroll the page away
  });
}
