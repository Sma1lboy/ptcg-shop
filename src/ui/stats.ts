// Top bar: cash is the one big number (and flashes what just came in or went out); stock, walk-ins, sales, singles value sit a step below.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money } from './common.ts';

let lastCash: number | null = null, delta = 0, stamp = 0;

export function renderStats() {
  const s = G.state, stock = Object.values(s.stock).reduce((a, b) => a + b, 0), shelf = Object.values(s.shelf).reduce((a, o) => a + o.qty, 0);
  const held = Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0);
  if (lastCash != null && Math.abs(s.cash - lastCash) >= .005) { delta = s.cash - lastCash; stamp++; }
  lastCash = s.cash;
  render(html`<p class="cash"><span class="k">现金</span><b>${money(s.cash)}</b>${stamp ? keyed(stamp, html`<span class="delta ${delta >= 0 ? 'gain' : 'loss'}" aria-hidden="true">${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}</span>`) : ''}</p>
    <dl class="sub">${([
      ['货架', `${shelf} 包`], ['仓库', `${stock} 包`], ['到店', `${(G.rate() * 60).toFixed(1)}/分`], ['成交', s.customers], ['单卡市值', money(held)],
    ] as const).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`, $('stats'));
}
