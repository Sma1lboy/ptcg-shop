// The "while you were closed" report after an absence, laid out as the register's end-of-day receipt. The torn paper is its own
// box (.paper) so the printer slot on #notice (style.css) isn't cut by the paper's torn-edge mask.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

export function renderNotice() {
  const o = G.state.offline, el = $('notice');
  if (!o) { el.hidden = true; return; }
  const h = o.secs >= 3600 ? `${(o.secs / 3600).toFixed(1)} 小时` : `${Math.round(o.secs / 60)} 分钟`;
  el.hidden = false;
  render(html`<div class="paper"><h2>打烊小票</h2>
      <dl><dt>关店</dt><dd>${h}</dd><dt>卖出</dt><dd>${o.sales} 件</dd><dt>入账</dt><dd class="gain">+${money(o.revenue)}</dd>
        ${o.lost ? html`<dt>货架空了，错过</dt><dd>${o.lost} 位顾客</dd>` : ''}</dl>
      <button type="button" data-act="ack">收起小票</button></div>`, el);
}
