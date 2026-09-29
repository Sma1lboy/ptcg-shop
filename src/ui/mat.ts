// 开包台: tear, flip, reveal — on the three.js table (src/table3d.js) when it can run, else the 2D mat. Deliberately NOT lit-html:
// #mat (and the #stage / #scene3d inside it) is rebuilt only on player actions and then driven by direct DOM work
// (cloneNode slide-outs, class toggles, timed flips, the WebGL canvas) that would corrupt lit's markers.
import type { Pull } from '../sim.ts';
import * as S from '../sim.ts';
import * as FX from '../fx.ts';
import { G, $, money, imgUrl, logoUrl, rar, rarLabel } from './common.ts';
import { showPack } from './share.ts';
import { mountTable, ENERGY } from '../table3d.js';

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// m3d: this pack is on the 3D table; quiet: 全部翻开 on the 3D table, no flip sound per card.
// Batch on the 3D table: picks = [pack, card] of the cards that fly to the front (cheapest first), up = which picks are face up, torn = packs ripped.
interface Mat { mode: 'idle' | 'pack' | 'cards' | 'batch'; set: string; cards: Pull[]; packs: Pull[][]; picks: [number, number][]; up: Set<number>; cur: number; busy?: boolean; finished?: boolean; m3d?: boolean; quiet?: boolean; torn?: boolean }
let mat = { mode: 'idle' } as Mat;

const capHTML = (c: Pull) => { const r = rar(c); return `<span class="glyph">${r.g}</span>${rarLabel(c.kind === 'REV' ? 'REV' : c.kind)}<b>${money(c.price)}</b>`; };
// Basic energy: the type mark the 3D table paints (src/table3d.js ENERGY), as inline SVG.
function energyHTML(c: Pull) {
  const e: { col: string; d: string; cut?: string; rot?: number; dot?: number[] } = ENERGY[c.name.slice(2, 3) as keyof typeof ENERGY] ?? ENERGY.钢;
  return `<span class="energy"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="${e.col}"/><g${e.rot ? ` transform="rotate(${e.rot} 50 50)"` : ''}>
    <path d="${e.d}" fill="#fff"/>${e.cut ? `<path d="${e.cut}" fill="${e.col}"/>` : ''}${e.dot ? `<circle cx="${e.dot[0]}" cy="${e.dot[1]}" r="${e.dot[2]}" fill="#fff"/>` : ''}</g></svg>${esc(c.name)}</span>`;
}
// big = the enlarged card on the stage (hi-res, tap to advance); otherwise a tray/grid thumbnail (tap to inspect once face-up).
function cardHTML(c: Pull, i: number, up: boolean, big?: boolean) {
  const r = rar(c);
  const face = c.r === 'E'
    ? energyHTML(c)
    : `<img src="${imgUrl(c, big ? 'high' : 'low')}" crossorigin="anonymous" alt="${esc(c.name)}" loading="eager" decoding="async">`;
  const act = big ? 'advance' : up ? 'peek' : '';
  return `<figure class="slot">
      <button type="button" class="card t${r.t} k-${c.kind}${up ? ' up' : ''}" ${act ? `data-act="${act}"` : 'tabindex="-1"'} data-i="${i}" aria-label="${up ? esc(c.name) : big ? '翻开这张' : `第 ${i + 1} 张（未翻）`}">
        <span class="card-in"><span class="back"></span><span class="face">${face}</span></span>
      </button>
      <figcaption>${capHTML(c)}</figcaption>
    </figure>`;
}

// Where one pack ranks among simulated packs of the same set, in words a player can quote.
function rankText(setId: string, v: number) {
  const p = S.packPercentile(S.rateKey(setId, G.luckMult()), v), pc = p >= .995 ? '99.5+' : (p * 100).toFixed(0);
  return { p, text: `比 ${pc}% 的${G.setById(setId).name}包值钱${p >= .9 ? `，约 ${Math.min(1000, Math.round(1 / (1 - p)))} 包才出一包这样的` : ''}` };
}
const shareBtn = () => '<button type="button" data-act="sharemat">分享这次开包</button>';
function shareSpec() {
  const set = G.setById(mat.set), packs = mat.mode === 'batch' ? mat.packs : [mat.cards];
  const vals = packs.map(S.packValue), bi = vals.indexOf(Math.max(...vals)), cards = packs.flat();
  const best = cards.reduce((a, b) => (b.price > a.price ? b : a)), rk = rankText(set.id, vals[bi]);
  return { set: set.name, en: set.en, n: packs.length, value: vals.reduce((a, b) => a + b, 0), cost: G.wholesale(set.id) * packs.length,
    bestPack: vals[bi], rank: rk.text, pct: rk.p, best, hits: cards.filter(c => S.HITS.includes(c.kind)).length, img: imgUrl(best, 'high') };
}
export type ShareSpec = ReturnType<typeof shareSpec>;

function packSummary(cards: Pull[], set: { id: string }) {
  const v = S.packValue(cards), cost = G.wholesale(set.id), d = v - cost;
  const best = cards.reduce((a, b) => (b.price > a.price ? b : a));
  const stock = G.state.stock[set.id] || 0;
  return `<div class="summary">
      <p>这包开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。最值钱：${esc(best.name)}。</p>
      <p class="rank">${rankText(set.id, v).text}。</p>
      <div class="btns">
        ${stock ? `<button type="button" class="primary" data-act="open1" data-id="${set.id}">再开一包（剩 ${stock}）</button>` : ''}
        ${shareBtn()}
        ${G.state.cash >= cost ? `<button type="button" data-act="buyopen" data-id="${set.id}">进 1 包马上开</button>` : ''}
      </div></div>`;
}

export function renderMat() {
  const el = $('mat');
  if (mat.m3d && (mat.mode === 'pack' || mat.mode === 'batch')) { if (mat3D(el)) return; mat.m3d = false; }
  if (table) { table.dispose(); table = null; }
  el.classList.remove('m3d');
  if (mat.mode === 'idle') {
    el.innerHTML = `<div class="mat-empty"><p class="mat-big">开包台</p><p>左边货架先进货，再点「开 1 包」。<br>单包可以一张张翻，按空格翻下一张。</p></div>`;
    return;
  }
  const set = G.setById(mat.set);
  if (mat.mode === 'pack') {
    el.innerHTML = `<div class="mat-pack"><button type="button" class="pack" data-act="tear" aria-label="撕开这包${set.name}">
        <span class="pack-crimp"></span><img src="${logoUrl(set.id)}" alt=""><span class="pack-name">${set.name}</span><span class="pack-hint">点击撕开</span><span class="pack-crimp bottom"></span></button>${sndBtn()}</div>`;
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
  const cards = mat.packs.flat(), hits = batchHits();
  const v = S.packValue(cards), cost = G.wholesale(set.id) * mat.packs.length, d = v - cost;
  el.innerHTML = `<div class="mat-head"><h2>${set.name} × ${mat.packs.length}</h2><span>开出 ${money(v)} · 进货 ${money(cost)} ·
      <b class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</b></span>${sndBtn()}</div>
      ${hits.length ? `<div class="spread">${hits.map((c, i) => cardHTML(c, i, false)).join('')}</div>`
        : `<div class="mat-empty"><p class="mat-big">全空</p><p>${mat.packs.length} 包一张好卡都没有。欧气检测那边会记住的。</p></div>`}
      <div class="summary"><p class="rank">最好的一包 ${money(shareSpec().bestPack)}，${shareSpec().rank}。</p><div class="btns">${shareBtn()}${G.state.stock[set.id] ? `<button type="button" class="primary" data-act="open10" data-id="${set.id}">再开 ${Math.min(10, G.state.stock[set.id])} 包</button>` : ''}</div></div>`;
}

// ---------- 3D table (src/table3d.js) ----------
// The table only presents mat.cards; mat.up / mat.cur stay the truth, so a lost WebGL context hands the same pack to the 2D mat mid-reveal.
let table: ReturnType<typeof mountTable> = null;
const touch = () => matchMedia('(pointer: coarse)').matches;
const HINT = { pack: () => touch() ? '按住封口往右拖，撕开。点一下也行' : '按住封口往右拖，撕开。点一下或按空格也行',
  cards: () => touch() ? '点一下，或把最前面这张往右滑开' : '点一下、按空格，或把最前面这张往右滑开', done: () => '点桌上的卡，拿起来细看',
  batch: () => touch() ? '点一下全部撕开，或按住从左往右划过这排包' : '点一下或按空格全部撕开，也可以按住从左往右划过这排包',
  batchCards: () => touch() ? '点一下，翻下一张' : '点一下或按空格，翻下一张' };
const batch = () => mat.mode === 'batch';
const picked = () => mat.picks.map(([p, i]) => mat.packs[p][i]);
const head3D = () => {
  const live = batch() ? mat.torn : mat.mode === 'cards';
  $('m3-head').innerHTML = `<h2>${G.setById(mat.set).name}${batch() ? ` × ${mat.packs.length}` : ''}</h2><span id="mat-prog">${live ? prog() : ''}</span>${sndBtn()}
      ${live && !mat.finished ? '<button type="button" class="ghost" data-act="flipall">全部翻开</button>' : ''}`;
};
const hint3D = (k: keyof typeof HINT) => { const h = document.getElementById('s3-hint'); if (h) h.textContent = HINT[k](); };
const on3D = {
  onTear() {
    if (batch()) { if (mat.torn) return; mat.torn = true; } else if (mat.mode === 'pack') mat.mode = 'cards'; else return;
    FX.tear(); head3D(); hint3D(batch() ? 'batchCards' : 'cards');
  },
  onFlip(i: number, c: Pull) {
    mat.up.add(i); mat.cur = i;
    const pg = document.getElementById('mat-prog'); if (pg) pg.textContent = prog();
    const none = batch() && !S.HITS.includes(c.kind); // a batch without a single hit flies its best card instead
    const cap = document.getElementById('s3-cap'); if (cap) { cap.className = `s3-cap t${rar(c).t}`; cap.innerHTML = `<b class="s3-name">${none ? `${mat.packs.length} 包一张好卡都没有 · ` : ''}${esc(c.name)}</b>${capHTML(c)}`; }
    if (!mat.quiet) FX.flip(rar(c).t);
  },
  onDone() { hint3D('done'); const cap = document.getElementById('s3-cap'); if (cap) cap.innerHTML = ''; finish(); },
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
  el.querySelector('.summary')?.remove(); $('s3-cap').innerHTML = '';
  head3D(); hint3D(batch() ? 'batch' : 'pack');
  if (batch()) table.showBatch(mat.set, mat.packs, mat.picks); else table.showPack(mat.set, mat.cards);
  return true;
}

// ---------- reveal ----------
// While a pack is being revealed the side panels (luck, binder, log, singles) stay frozen, otherwise they show the pull early.
export let hold = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const batchHits = () => mat.packs.flat().filter(c => S.HITS.includes(c.kind)).sort((a, b) => b.price - a.price);
const sndBtn = () => `<button type="button" class="ghost snd" data-act="mute">音效 ${FX.muted() ? '关' : '开'}</button>`;
const prog = () => {
  const cs = batch() ? picked() : mat.cards, label = !batch() ? '已翻' : S.HITS.includes(cs[0].kind) ? '好卡' : '没出好卡，最值钱的';
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
  if (mat.finished) return; mat.finished = true; release();
  const el = $('mat'); el.querySelector('[data-act="flipall"]')?.remove();
  if (!el.querySelector('.summary')) el.insertAdjacentHTML('beforeend', batch() ? batchSummary() : packSummary(mat.cards, G.setById(mat.set)));
}
function batchSummary() {
  const set = G.setById(mat.set), v = S.packValue(mat.packs.flat()), cost = G.wholesale(set.id) * mat.packs.length, d = v - cost, sp = shareSpec(), stock = G.state.stock[set.id] || 0;
  return `<div class="summary">
      <p>${mat.packs.length} 包开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。</p>
      <p class="rank">最好的一包 ${money(sp.bestPack)}，${sp.rank}。</p>
      <div class="btns">${stock ? `<button type="button" class="primary" data-act="open10" data-id="${set.id}">再开 ${Math.min(10, stock)} 包</button>` : ''}${shareBtn()}</div></div>`;
}

// Ten packs at once: the hits flip one after another, cheapest first, best last.
function revealBatch(tok: Mat) {
  const hits = batchHits(), n = hits.length;
  if (!n) { FX.miss(); release(); return; }
  const btns = [...document.querySelectorAll<HTMLElement>('.mat .spread .card')], step = reduced() ? 0 : Math.min(240, 2400 / n);
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k, delay = reduced() ? 0 : 350 + k * step + (k === n - 1 ? 400 : 0);
    setTimeout(() => {
      if (mat !== tok) return;
      const t = rar(hits[i]).t; if (t >= 4 && k === n - 1 && !reduced()) spotlight(2200); armThumb(btns[i], hits[i]); FX.flip(t); FX.burst(btns[i].closest('.slot'), t);
    }, delay);
  }
  setTimeout(() => { if (mat === tok) release(); }, (reduced() ? 0 : 350 + n * step + 1200));
}

// ---------- actions (called from events.ts) ----------
// Warm the cache before the flips (CORS mode, so the share poster can reuse it).
const warm = (cards: Pull[]) => cards.forEach(c => { if (c.r !== 'E') for (const size of ['low', 'high']) { const i = new Image(); i.crossOrigin = 'anonymous'; i.src = imgUrl(c, size); } });
export function startPack(id: string) {
  hold = true;
  const [cards] = G.open(id, 1); if (!cards) { hold = false; return; }
  warm(cards);
  mat = { mode: 'pack', set: id, cards, up: new Set(), cur: 0, m3d: true } as Mat;
  renderMat();
}
// What flies to the front of the 3D table: every hit, cheapest first (best last); a batch without one shows its best card.
function pickOrder(packs: Pull[][]) {
  const all = packs.flatMap((p, pi) => p.map((c, ci) => ({ c, at: [pi, ci] as [number, number] })));
  const hits = all.filter(x => S.HITS.includes(x.c.kind));
  return (hits.length ? hits : [all.reduce((a, b) => (b.c.price > a.c.price ? b : a))]).sort((a, b) => a.c.price - b.c.price).map(x => x.at);
}
export function openBatch(id: string) {
  hold = true; const packs = G.open(id, 10); if (!packs.length) { release(); return; }
  mat = { mode: 'batch', set: id, packs, picks: pickOrder(packs), up: new Set(), cur: 0, m3d: true } as Mat;
  warm(picked());
  renderMat();
  if (!mat.m3d) revealBatch(mat);
}
export function tear(b: HTMLElement) { const tok = mat; FX.tear(); b.classList.add('torn'); setTimeout(() => { if (mat !== tok) return; mat.mode = 'cards'; mat.cur = 0; renderMat(); }, reduced() ? 0 : 380); }
export function peek(i: number) { if (!mat.busy) { mat.cur = i; $('stage').innerHTML = cardHTML(mat.cards[mat.cur], mat.cur, true, true); } }
export function flipAll() { if (mat.m3d) { mat.quiet = true; table!.flipAll(); return; } mat.cards.forEach((_, i) => mat.up.add(i)); mat.cur = mat.cards.length - 1; renderMat(); finish(); }
export function toggleMute() { FX.setMuted(!FX.muted()); document.querySelectorAll('.snd').forEach(x => { x.textContent = `音效 ${FX.muted() ? '关' : '开'}`; }); }
export function shareMat() { showPack(shareSpec()); }
export function resetMat() { hold = false; G.reset(); mat = { mode: 'idle' } as Mat; renderMat(); }

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
    if (e.code !== 'Space' || (e.target as Element).closest('input, textarea')) return;
    FX.unlock();
    if (mat.mode === 'pack') { e.preventDefault(); if (mat.m3d) table!.flip(0); else document.querySelector<HTMLElement>('.pack')?.click(); }
    else if (mat.mode === 'cards' && (mat.m3d ? !mat.finished : mat.up.size < mat.cards.length)) { e.preventDefault(); advance(); }
    else if (batch() && mat.m3d && !mat.finished) { e.preventDefault(); table!.flip(mat.up.size); }
  });
}

// Phones stack the shelf above the mat: bring the mat into view when a pack opens. Registered after events.ts's click handler, as before.
export function bindMatScroll() {
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (b && /^(open1|open10|buyopen)$/.test(b.dataset.act!) && matchMedia('(max-width: 779px)').matches)
      $('mat').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
