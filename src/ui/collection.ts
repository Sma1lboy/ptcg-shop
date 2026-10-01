// 收藏室: the shop's gallery, a standalone page (#collection) of five fixed slots. Two modes, never mixed:
//  · display (the default, and what the page is on arrival): the five cells, each a card with its name and rarity. No asking price, no
//    pull-down, no per-card price: the only numbers are the room's own, 门票 (G.ticketPrice) and 藏品总值 (G.galleryValue).
//  · 布置 (arrange, entered by 布置, left by 完成布置): pick an empty cell and a card from the binder or the 镇店之宝 to put in it,
//    pick a card then an empty cell, pick one placed card then another cell to swap (or to move it into an empty one), or send a
//    placed card back to the binder. Every move is one call on G; nothing here mutates state.
// Cards in the room are owned copies out of the binder: never for sale, never offered to customers. No card that is not flipped yet
// can be put in (mat.ts `hold`: its cards are in singles already, but the player has not seen them). 欣赏 opens inspect.ts.
import { html, render, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import type { Trophy, Single } from '../game.ts';
import { G, $, money, rarLabel } from './common.ts';
import { face, mark } from './card.ts';
import { hold } from './mat.ts';
import { inspectCard } from './inspect.ts';

type Pick = { t: 'slot'; i: number; card: Trophy | null } | { t: 'single'; key: string } | { t: 'trophy' };
let arranging = false, pick: Pick | null = null, msg: { ok: boolean; text: string } | null = null;

const room = () => G.state.gallery;
// The first empty slot, or -1 when the room is full. singles.ts: its 收藏 button exists only when this is >= 0.
export const galleryFree = () => room().findIndex(c => !c);
// A placed card may not be taken while packs are being revealed: the unflipped cards are already in singles (mat.ts hold).
export const canCollect = () => !hold && galleryFree() >= 0;

const stand = html`<i class="v-stand" aria-hidden="true"></i>`;
const inventory = () => Object.entries(G.state.singles).filter(([, c]) => c.count > 0).sort((a, b) => b[1].price - a[1].price);
const note = (ok: boolean, text: string) => { msg = { ok, text }; };

// What the cursor holds is dropped when it is gone from under it (a sale, a branch, a swap that moved it).
function settle() {
  const p = pick, g = room();
  if (!p) return;
  if (p.t === 'slot' ? p.i >= g.length || (g[p.i]?.key ?? null) !== (p.card?.key ?? null)
    : p.t === 'single' ? !(G.state.singles[p.key]?.count > 0) : !G.state.trophy) pick = null;
}

function hint(g: (Trophy | null)[], free: number, sources: boolean) {
  const p = pick, at = (i: number) => `第 ${i + 1} 格`;
  if (hold) return '开包的卡还没翻完，翻完再布置。';
  if (p?.t === 'slot') return p.card ? `已选中${at(p.i)}的 ${p.card.name}。选择另一展位交换位置，或按「放回卡本」取回。` : `已选中${at(p.i)}。选择下方的库存卡或镇店之宝放入。`;
  if (p?.t === 'single') return `已选中 ${G.state.singles[p.key].name}。选择一个空展位放入。`;
  if (p?.t === 'trophy') return '已选中镇店之宝。选择一个空展位放入。';
  if (free < 0) return `${G.GALLERY_SLOTS} 个展位已满。可交换两张展品的位置，或将一张放回卡本后换入其他卡。`;
  return sources ? '选一张卡，再选空展位放入；选中展品后再点另一格可交换位置。' : '卡本中暂无库存。开包获得的卡和向顾客收购的卡都可以收藏。';
}

function cell(c: Trophy | null, i: number, free: number) {
  const p = pick, mine = p?.t === 'slot' && p.i === i;
  const carry = p && p.t !== 'slot'; // a card from the binder / trophy is in hand: only an empty cell takes it
  const label = c ? `第 ${i + 1} 格：${c.name}，${rarLabel(c.kind)}` : `第 ${i + 1} 格：空`;
  if (!arranging) return html`<li class="v-slot col-slot ${c ? '' : 'empty'}">
      <div class="v-cube" role="img" aria-label=${label}>${c ? face(c, 'show') : html`<span class="v-empty">空格</span>`}${stand}</div>
      <p class="v-lip col-lip"><span class="col-no">第 ${i + 1} 格</span></p>
      <div class="v-ctl v-info">${c ? html`<span class="v-name">${c.name}</span>
          <small>${mark(c)}${rarLabel(c.kind)}</small>
          <button type="button" data-act="col-look" data-slot="${i}" aria-label="欣赏${c.name}">欣赏</button>`
        : html`<small>未放入卡片</small>`}</div>
    </li>`;
  const blocked = hold || (carry && !!c);
  return html`<li class="v-slot col-slot ${c ? '' : 'empty'} ${mine ? 'picked' : ''}">
      <button type="button" class="v-cube col-cube" data-act="col-slot" data-slot="${i}" aria-pressed=${mine ? 'true' : 'false'} aria-label=${label}
        ?disabled=${blocked} title=${c ? (carry ? '这格有卡：选一个空格，或先把它放回卡本' : '拿起这张，再点另一格互换') : free < 0 ? '' : '选这个空格作放置位置'}>
        ${c ? face(c, 'show') : html`<span class="v-empty">${carry ? '放这里' : '空格'}</span>`}${stand}</button>
      <p class="v-lip col-lip"><span class="col-no">第 ${i + 1} 格</span></p>
      <div class="v-ctl v-info">${c ? html`<span class="v-name">${c.name}</span>
          <small>${mark(c)}${rarLabel(c.kind)}</small>
          <button type="button" data-act="col-return" data-slot="${i}" aria-label="把第 ${i + 1} 格的 ${c.name} 放回卡本" ?disabled=${hold}>放回卡本</button>`
        : html`<small>${carry || mine ? '点这里放进来。' : '空着。'}</small>`}</div>
    </li>`;
}

// One pocket of the binder page (singles.ts shares its classes): the card, its mark and name, and a button that picks it up.
function source(key: string, c: Single | Trophy, on: boolean, off: boolean, trophy: boolean) {
  return html`<li class="pk sb-pk col-src ${on ? 'picked' : ''}">
      <div class="sb-card">${face(c, 'show', true)}${!trophy && 'count' in c && c.count > 1 ? html`<b class="sb-n">×${c.count}</b>` : nothing}</div>
      <span class="sb-name" title="${G.setById(c.set).name} #${c.n}">${trophy ? '镇店之宝 · ' : ''}${c.name}</span>
      <small class="col-rar">${mark(c)}${rarLabel(c.kind)}</small>
      ${trophy ? html`<small class="muted">移入后不再提供镇店之宝的收藏党加成。</small>` : nothing}
      <span class="sb-btns"><button type="button" data-act=${trophy ? 'col-trophy' : 'col-src'} data-key=${trophy ? nothing : key} aria-pressed=${on ? 'true' : 'false'} ?disabled=${off}
        aria-label="${on ? '放下' : '选'} ${c.name}${trophy ? '（镇店之宝）' : ''}">${on ? '放下' : '选这张'}</button></span></li>`;
}

export function renderCollection() {
  settle();
  const s = G.state, g = room(), n = g.filter(Boolean).length, free = g.findIndex(c => !c), singles = arranging && !hold ? inventory() : [];
  const p = pick, emptyPick = p?.t === 'slot' && !p.card;
  const open = !hold && free >= 0 && !(p?.t === 'slot' && !emptyPick); // a card in hand or an empty cell chosen: sources may be picked
  const ticket = G.ticketPrice(), t = s.trophy;
  render(html`<h2>收藏室 ${n}/${G.GALLERY_SLOTS} <small class="muted">只看不卖，不标价</small></h2>
      <div class="case-bar col-bar"><span class="cb-k">门票 <b>${n ? money(ticket) : '—'}</b></span>
        <span class="cb-k">藏品总值 <b>${money(G.galleryValue())}</b></span>
        <span class="cb-k">本店门票收入 <b class="gain">${money(s.extra.tickets)}</b></span>
        <a class="case-link" href="#case">展示柜（卖货）</a>
        <button type="button" class="${arranging ? 'primary' : ''}" data-act="col-arrange" aria-pressed=${arranging ? 'true' : 'false'}>${arranging ? '完成布置' : '布置'}</button></div>
      <p class="case-note">${n ? `展品不会被顾客购买。有展品时每分钟接待 ${G.GALLERY_RATE * 60} 位参观者；门票按藏品总市价计算，每人 $1–20，收入不计入卖货营业额。` : '收藏室暂无展品。进入「布置」，从卡本或镇店之宝移入卡片。空馆不收门票。'}</p>
      <ol class="v-slots col-slots" aria-label="收藏室的 ${G.GALLERY_SLOTS} 个展位">${g.map((c, i) => cell(c, i, free))}</ol>
      ${arranging ? html`<div class="col-arrange">
          <p class="col-hint" role="status">${hint(g, free, !!(singles.length || t))}</p>
          ${singles.length || t ? html`<h3>卡本里能放的卡</h3>
            <div class="bk-book sb-book"><ol class="bk-page sb-page">${t ? source('', t, p?.t === 'trophy', !open && p?.t !== 'trophy', true) : nothing}${repeat(singles, ([k]) => k,
              ([k, c]) => source(k, c, p?.t === 'single' && p.key === k, !open && !(p?.t === 'single' && p.key === k), false))}</ol></div>`
            : html`<p class="muted">${hold ? '翻完手里的卡后，再选择要收藏的卡。' : '暂无可移入的库存卡或镇店之宝。'}</p>`}</div>` : nothing}
      <p class="col-msg ${msg && !msg.ok ? 'bad' : ''}" role="${msg && !msg.ok ? 'alert' : 'status'}">${msg?.text ?? ''}</p>`, $('gallery'));
}

function refuse() { note(false, hold ? '开包的卡还没翻完，翻完再布置。' : '无法放入：展位已有卡，或所选卡已不在原处。请重新选择。'); }
function done(text: string) { pick = null; note(true, text); }

function click(a: string, b: HTMLElement) {
  const i = +b.dataset.slot!, key = b.dataset.key ?? '', g = room();
  if (a === 'col-arrange') { arranging = !arranging; pick = null; note(true, arranging ? '' : '布置好了。'); if (arranging) msg = null; return; }
  if (a === 'col-look') { const c = g[i]; if (c) inspectCard(c); return; }
  if (a === 'col-take') { // singles.ts 收藏: a copy into the first empty slot, the room's page stays where it is
    const at = galleryFree(), c = G.state.singles[key];
    if (hold || at < 0 || !c) return;
    if (G.collectToGallery(key, at)) note(true, `${c.name} 放进了收藏室第 ${at + 1} 格。`); else refuse();
    return;
  }
  if (hold) return refuse();
  if (a === 'col-return') {
    const c = g[i]; if (!c) return;
    if (G.uncollect(i)) done(`${c.name} 放回了卡本。`); else refuse();
    return;
  }
  const p = pick;
  if (a === 'col-slot') {
    const c = g[i];
    if (!p) { pick = { t: 'slot', i, card: c }; msg = null; return; }
    if (p.t === 'slot') {
      if (p.i === i) { pick = null; return; } // the same cell again puts it down
      if (!p.card && !c) { pick = { t: 'slot', i, card: c }; return; } // two empties: the choice just moves
      if (G.moveCollect(p.i, i)) done(p.card && c ? `${p.card.name} 和 ${c.name} 互换了位置。` : `${(p.card || c)!.name} 挪到了第 ${(p.card ? i : p.i) + 1} 格。`); else refuse();
      return;
    }
    if (c) return; // a card in hand goes only into an empty cell
    if (p.t === 'single') { const sc = G.state.singles[p.key]; if (sc && G.collectToGallery(p.key, i)) done(`${sc.name} 放进了第 ${i + 1} 格。`); else refuse(); }
    else { const tc = G.state.trophy; if (tc && G.collectTrophy(i)) done(`镇店之宝 ${tc.name} 搬进了第 ${i + 1} 格。`); else refuse(); }
    return;
  }
  // a card from the binder or the trophy: into the empty cell already chosen, or picked up to wait for one
  const same = a === 'col-trophy' ? p?.t === 'trophy' : p?.t === 'single' && p.key === key;
  if (same) { pick = null; return; }
  if (p?.t === 'slot' && !p.card) {
    const at = p.i, name = a === 'col-trophy' ? G.state.trophy?.name : G.state.singles[key]?.name;
    if (a === 'col-trophy' ? G.collectTrophy(at) : G.collectToGallery(key, at)) done(`${a === 'col-trophy' ? '镇店之宝 ' : ''}${name} 放进了第 ${at + 1} 格。`); else refuse();
    return;
  }
  if (p?.t === 'slot') return; // a placed card is in hand: sources are disabled then
  pick = a === 'col-trophy' ? { t: 'trophy' } : { t: 'single', key }; msg = null;
}

// Parent calls this once with the other binders (main.ts). The acts are col-*: events.ts's switch ignores them.
export function initCollection() {
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-act^="col-"]'); if (!b || b.disabled) return;
    click(b.dataset.act!, b);
    renderCollection();
  });
  // Coming back to the room is the display again: 布置 does not wait behind another page.
  addEventListener('hashchange', () => { if (location.hash !== '#collection' && (arranging || pick || msg)) { arranging = false; pick = null; msg = null; renderCollection(); } });
}
