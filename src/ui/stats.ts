// Header numbers: cash, stock, walk-in rate, sales, value of singles on hand.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

export function renderStats() {
  const s = G.state, stock = Object.values(s.stock).reduce((a, b) => a + b, 0), shelf = G.shelves().reduce((a, o) => a + o.qty, 0);
  const held = Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0);
  render(([
    ['现金', money(s.cash)], ['货架', `${shelf} 包`], ['仓库', `${stock} 包`], ['到店', `${(G.rate() * 60).toFixed(1)}/分`], ['成交', s.customers], ['手上单卡市值', money(held)],
  ] as const).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`), $('stats'));
}
