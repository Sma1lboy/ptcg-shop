// The "while you were closed" report after an absence, laid out as the register's end-of-day receipt. The torn paper is its own
// box (.paper) so the printer slot on #notice (style.css) isn't cut by the paper's torn-edge mask.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

// On a phone the receipt first shows only its tear-off stub (style.css): one line under the top bar with the hours and the net,
// so it doesn't cover or push down what the player came back to press; tapping the stub prints the whole receipt.
let unrolled = false;

// o.sales counts paying visits, not packs: a scalper who clears a shelf is one 成交
export function renderNotice() {
  const o = G.state.offline, el = $('notice');
  if (!o) { el.hidden = true; unrolled = false; return; }
  const h = o.secs >= 3600 ? `${(o.secs / 3600).toFixed(1)} 小时` : `${Math.round(o.secs / 60)} 分钟`;
  el.hidden = false;
  el.classList.toggle('unrolled', unrolled);
  const net = o.revenue - (o.bills || 0);
  render(html`<button type="button" class="stub" aria-label="展开打烊小票" @click=${() => { unrolled = true; renderNotice(); }}>
      <b>打烊小票</b><span>关店 ${h}</span><span class="${net >= 0 ? 'gain' : 'loss'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></button>
    <div class="paper"><h2>打烊小票</h2>
      <dl><dt>关店</dt><dd>${h}</dd><dt>成交</dt><dd>${o.sales} 位顾客</dd><dt>入账</dt><dd class="gain">+${money(o.revenue)}</dd>
        ${o.lost ? html`<dt>货架空了，错过</dt><dd>${o.lost} 位顾客</dd>` : ''}
        ${o.bills ? html`<dt>九姐来收账</dt><dd>−${money(o.bills)}</dd>` : ''}${o.borrowed ? html`<dt>钱不够，记成借款</dt><dd>${money(o.borrowed)}</dd>` : ''}</dl>
      <button type="button" data-act="ack">收起小票</button></div>`, el);
}
