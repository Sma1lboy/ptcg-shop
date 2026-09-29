// 卡本 (单卡库存): hits on hand, for sale to seekers at the 单卡标价 as they are (GAMEPLAY §14); list in the case, make trophy,
// sell to peers; and the bulk dump. Drawn as a page of the 卡册 (binder.ts): the same navy cover and pockets, priciest first,
// each pocket the card, its mark and market price, how many copies, and its three moves.
// 卖出落在卡本里: a copy gone since the last render while a seeker bought that card (state.recent) was sold off the counter: for
// LIVE its pocket shows the card lifting out and the till chip of the walls (「售出 +$3.20」); a card whose last copy sold keeps its
// pocket, emptied, until then, so the page doesn't close up under the player's pointer. Listing, 镇店 and selling to peers are silent.
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { repeat } from 'lit-html/directives/repeat.js';
import type { Single } from '../game.ts';
import * as S from '../sim.ts';
import { G, $, money } from './common.ts';
import { face, cap } from './card.ts';
import { spotted } from './case.ts';

const LIVE = 2400;
let had: Record<string, { c: Single; n: number }> | null = null, lastAt = 0, soldN = 0;
const sold: Record<string, { k: number; at: number; c: Single; n: number; gain: number }> = {};
function listen(list: [string, Single][]) {
  const s = G.state, now = Date.now();
  const fresh = s.recent.filter(v => v.at > lastAt && v.t === 'seeker' && v.r === 'sold' && now - v.at < LIVE);
  lastAt = s.recent[0]?.at ?? lastAt;
  if (had) for (const [k, { c, n }] of Object.entries(had)) {
    const left = s.singles[k]?.count ?? 0;
    if (left >= n || !fresh.some(v => v.card === c.name || v.n! > 1)) continue;
    sold[k] = { k: ++soldN, at: now, c, n: n - left, gain: (n - left) * Math.round(c.price * G.casePct() * 100) / 100 };
  }
  had = Object.fromEntries(list.map(([k, c]) => [k, { c: { ...c }, n: c.count }]));
  for (const k in sold) if (now - sold[k].at >= LIVE) delete sold[k];
}

export function renderSingles() {
  const s = G.state, list = Object.entries(s.singles).filter(([, c]) => S.HITS.includes(c.kind));
  listen(list);
  // the emptied pockets of cards sold out just now stand where they were, by price like the rest
  const pockets = [...list, ...Object.entries(sold).filter(([k]) => !s.singles[k]).map(([k, t]) => [k, t.c] as [string, Single])].sort((a, b) => b[1].price - a[1].price);
  const bulk = G.bulkValue(), n = G.binderN(), full = s.shown.length >= G.slots();
  const chip = (k: string) => { const t = sold[k]; return t ? keyed(t.k, html`<span class="v-gone" aria-hidden="true">${face(t.c, 'show')}</span>
      <span class="r-beat v-beat">售出${t.n > 1 ? ` ${t.n} 张` : ''} <em>+${money(t.gain)}</em></span>`) : nothing; };
  render(html`<h2>卡本 · 闪卡 ${n}/${G.BINDER} <small class="muted">找卡的直接翻，按单卡标价 ${Math.round(G.casePct() * 100)}%；卖同行 ${Math.round(G.BUYLIST * 100)}%</small></h2>
      <div class="bulk"><span>散卡 ${bulk.n} 张 · 可卖 ${money(bulk.v)}</span>
        <button type="button" data-act="bulk" ?disabled=${!bulk.n}>一键卖散卡</button></div>
      ${pockets.length ? html`<div class="bk-book sb-book"><ol class="bk-page sb-page">${repeat(pockets, ([k]) => k, ([k, c]) => { // keyed: a pocket stays its card's while others sell around it (a lit or flashed pocket too)
        const gone = !s.singles[k];
        return html`<li class="pk sb-pk ${gone ? 'gone' : ''} ${!gone && spotted(c) ? 'spot' : ''}" data-spot="card:${c.name}">
          <div class="sb-card">${gone ? html`<span class="sb-empty"></span>` : face(c, 'show', true)}${c.count > 1 && !gone ? html`<b class="sb-n">×${c.count}</b>` : nothing}${chip(k)}</div>
          ${cap(c, 'show')}<span class="sb-name" title="${G.setById(c.set).name} #${c.n}">${c.name}</span>
          <span class="sb-btns">${gone ? nothing : html`<button type="button" data-act="list" data-key="${k}" ?disabled=${full} title="挂进展示柜：收藏党只看柜里的卡">上柜</button>
            <button type="button" data-act="trophy" data-key="${k}" title="当镇店之宝，吸引客流，但不再出售">镇店</button>
            <button type="button" data-act="sell" data-key="${k}" title="立刻卖给同行">卖 ${money(c.price * G.BUYLIST)}</button>`}</span></li>`;
      })}</ol></div>` : html`<p class="muted">卡本里没有闪卡：拆包玩家当场拆出的闪卡按收卡价卖给你，自己开出的也放这里。</p>`}`, $('singles'));
}
