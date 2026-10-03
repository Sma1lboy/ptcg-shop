// 卡本 (单卡库存): hits for seekers at 单卡标价; list in the case, make trophy, collect or sell to peers.
// Each pocket holds the card, its mark and market price, copy count, and its moves.
// While viewing the case, emptied pockets stay put and new cards append: another card's sell button must not move under a tap.
// Re-entering the page sorts and closes the gaps. Only seeker sales show the LIVE receipt animation; manual transfers do not.
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { repeat } from 'lit-html/directives/repeat.js';
import type { Single } from '../game.ts';
import * as S from '../sim.ts';
import { G, $, money } from './common.ts';
import { face, cap } from './card.ts';
import { spotted } from './case.ts';
import { canCollect } from './collection.ts';
import { inspectCard } from './inspect.ts';
import { hold } from './mat.ts';

const LIVE = 2400;
let had: Record<string, { c: Single; n: number }> | null = null, lastAt = 0, soldN = 0;
const sold: Record<string, { k: number; at: number; c: Single; n: number; gain: number }> = {};
const positions = new Map<string, Single>();
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
  if (location.hash !== '#case') positions.clear();
  for (const [k, c] of list.sort((a, b) => b[1].price - a[1].price)) positions.set(k, c);
  const pockets = [...positions];
  const bulk = G.bulkValue(), n = G.binderN(), full = s.shown.length >= G.slots();
  const chip = (k: string) => { const t = sold[k]; return t ? keyed(t.k, html`<span class="v-gone" aria-hidden="true">${face(t.c, 'show')}</span>
      <span class="r-beat v-beat">售出${t.n > 1 ? ` ${t.n} 张` : ''} <em>+${money(t.gain)}</em></span>`) : nothing; };
  render(html`<h2>卡本 · 闪卡 ${n}/${G.BINDER} <small class="muted">找卡的按单卡标价（市价 ${Math.round(G.casePct() * 100)}%）买；卖同行得市价 ${Math.round(G.BUYLIST * 100)}%</small></h2>
      <div class="bulk"><span>散卡 ${bulk.n} 张 · 卖同行可得 ${money(bulk.v)}</span>
        <button type="button" data-act="bulk" ?disabled=${!bulk.n}>一键卖散卡</button></div>
      ${pockets.length ? html`<div class="bk-book sb-book"><ol class="bk-page sb-page">${repeat(pockets, ([k]) => k, ([k, c]) => { // keyed: a pocket stays its card's while others sell around it (a lit or flashed pocket too)
        const gone = !s.singles[k];
        return html`<li class="pk sb-pk ${gone ? 'gone' : ''} ${!gone && spotted(c) ? 'spot' : ''}" data-spot="card:${c.name}">
          <button type="button" class="sb-card inspect-trigger" aria-label="欣赏${c.name}" ?disabled=${gone} @click=${() => inspectCard(c)}>${gone ? html`<span class="sb-empty"></span>` : face(c, 'show', true)}${c.count > 1 && !gone ? html`<b class="sb-n">×${c.count}</b>` : nothing}${chip(k)}</button>
          ${cap(c, 'show')}<span class="sb-name" title="${G.setById(c.set).name} #${c.n}">${c.name}</span>
          <span class="sb-btns"><button type="button" data-act="col-take" data-key="${k}" ?disabled=${gone || !canCollect()} title="放进收藏室：只看不卖，不标价">收藏</button><button type="button" data-act="list" data-key="${k}" ?disabled=${gone || full} title="挂进展示柜：收藏党只看柜里的卡">上柜</button>
            <button type="button" data-act="trophy" data-key="${k}" ?disabled=${gone} title="当镇店之宝，吸引收藏党，但不再出售">镇店</button>
            <button type="button" data-act="sell" data-key="${k}" data-n="${c.count}" ?disabled=${gone} title="一次卖出这 ${c.count} 张给同行">卖 ${c.count} 张 ${money(c.price * G.BUYLIST * c.count, 'exact')}</button></span></li>`;
      })}</ol></div>` : html`<p class="muted">卡本里没有闪卡：拆包玩家当场拆出的闪卡可能按收卡价卖给你，自己开出的闪卡也放这里。</p>`}`, $('singles'));
}
addEventListener('hashchange', () => { if (!hold) { positions.clear(); renderSingles(); } });
