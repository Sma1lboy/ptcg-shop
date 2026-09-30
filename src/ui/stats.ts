// Top bar: cash is the one big number (and flashes what just came in or went out); stock, walk-ins, sales, singles value sit a step below.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money } from './common.ts';

let lastCash: number | null = null, delta = 0, stamp = 0, lastHeld = 0, seenAt = Date.now(), why = '';

// What the till's change was made of, when it all came from the counter: packs sold stay a bare 「+$」 (the 第一笔生意 note says what
// it is), a case card sold reads 「卖卡 +$」, hits bought off a customer 「收卡 −$」 — a net −$136 with packs sold and cards bought in the
// same second read as money gone for nothing. Anything else in the change (the player's own buys) leaves the bare number.
function sources(d: number) {
  const vs = G.state.recent.filter(v => v.at > seenAt);
  seenAt = Math.max(seenAt, ...vs.map(v => v.at));
  const sum = (f: (v: (typeof vs)[number]) => number) => vs.reduce((a, v) => a + f(v), 0);
  const packs = sum(v => (v.r === 'sold' && !v.card ? v.gain || 0 : 0)), cards = sum(v => (v.r === 'sold' && v.card ? v.gain || 0 : 0)), paid = sum(v => v.paid || 0);
  if ((!cards && !paid) || Math.abs(packs + cards - paid - d) >= .01) return '';
  return [packs >= .005 ? `+${money(packs)}` : '', cards >= .005 ? `卖卡 +${money(cards)}` : '', paid >= .005 ? `收卡 −${money(paid)}` : ''].filter(Boolean).join(' · ');
}

// reveal: a pack is being revealed — the till and the shelf keep moving (sales go on), but the singles' worth stays where it was, or it
// would give away the pull before its card is flipped
export function renderStats(reveal = false) {
  const s = G.state, stock = Object.values(s.stock).reduce((a, b) => a + b, 0), shelf = G.shelves().reduce((a, o) => a + o.qty, 0);
  const held = reveal ? lastHeld : Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0);
  lastHeld = held;
  if (lastCash != null && Math.abs(s.cash - lastCash) >= .005) { delta = s.cash - lastCash; why = sources(delta); stamp++; }
  else if (lastCash == null) seenAt = Math.max(seenAt, ...s.recent.map(v => v.at)); // what happened before this page opened isn't news
  lastCash = s.cash;
  render(html`<p class="cash"><span class="k">现金</span><b>${money(s.cash)}</b>${stamp ? keyed(stamp, html`<span class="delta ${delta >= 0 ? 'gain' : 'loss'}" aria-hidden="true">${why || `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}`}</span>`) : ''}</p>
    <dl class="sub">${([
      ['shelf', '货架', `${shelf} 包`], ['stock', '仓库', `${stock} 包`], ['rate', '到店', `${(G.rate() * 60).toFixed(1)}/分`], ['sales', '成交', s.customers], ['held', '单卡市值', money(held)],
    ] as const).map(([k, n, v]) => html`<div data-k=${k} title=${n}><dt>${n}</dt><dd>${v}</dd></div>`)}</dl>`, $('stats'));
}
