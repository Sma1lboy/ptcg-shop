// The "while you were closed" report after an absence.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

export function renderNotice() {
  const o = G.state.offline, el = $('notice');
  if (!o) { el.hidden = true; return; }
  const h = o.secs >= 3600 ? `${(o.secs / 3600).toFixed(1)} 小时` : `${Math.round(o.secs / 60)} 分钟`;
  el.hidden = false;
  render(html`<p>打烊 ${h}：卖出 <b>${o.sales}</b> 件，入账 <b class="gain">${money(o.revenue)}</b>${o.lost ? html`，货架空了，错过 <b class="loss">${o.lost}</b> 位顾客` : ''}。</p>
      <button type="button" class="ghost" data-act="ack">知道了</button>`, el);
}
