// 怎么玩: three steps, current one highlighted, gone after 3 packs.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

export const opened = () => Object.values(G.state.opened).reduce((a, b) => a + b, 0);

export function renderGuide() {
  const s = G.state, n = opened(), stock = Object.values(s.stock).reduce((a, b) => a + b, 0);
  const el = $('guide');
  if (n >= 3) { el.hidden = true; return; }
  const cur = n ? 2 : stock ? 1 : 0;
  const steps = [
    ['进货', `你有 ${money(s.cash)}。点「进 10 包」，再点「摆上空货架」，顾客才买得到。`],
    ['开包', '点「开 1 包」撕开，一张张翻，或按空格。'],
    ['测欧气', '开完看「欧气检测」：你的运气在几千个模拟玩家里排第几。可以生成分享图。'],
  ];
  el.hidden = false;
  render(html`<h2 class="eyebrow">怎么玩</h2><ol>${steps.map(([h, p], i) =>
    html`<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}"><b>${i + 1} ${h}</b><span>${p}</span></li>`)}</ol>
      <p class="muted">卡价和开包概率都是真实统计；每位顾客有自己的来意和预算，嫌贵就走：上架的整包和展示柜里的卡自己定价。</p>`, el);
}
