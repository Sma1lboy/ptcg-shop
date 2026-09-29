// 卡本 (单卡库存): hits on hand, for sale to seekers at the 单卡标价 as they are (GAMEPLAY §14); list in the case, make trophy,
// sell to peers; and the bulk dump.
import { html, render } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money, rarLabel } from './common.ts';
import { face, mark } from './card.ts';

export function renderSingles() {
  const list = Object.entries(G.state.singles).filter(([, c]) => S.HITS.includes(c.kind)).sort((a, b) => b[1].price - a[1].price);
  const bulk = G.bulkValue();
  const n = G.binderN();
  render(html`<h2>卡本 · 闪卡 ${n}/${G.BINDER} <small class="muted">找卡的直接翻，按单卡标价 ${Math.round(G.casePct() * 100)}%；卖同行 ${Math.round(G.BUYLIST * 100)}%</small></h2>
      <div class="bulk"><span>散卡 ${bulk.n} 张 · 可卖 ${money(bulk.v)}</span>
        <button type="button" data-act="bulk" ?disabled=${!bulk.n}>一键卖散卡</button></div>
      <ul class="singles">${list.map(([k, c]) => html`<li>
        ${face(c, 'list')}
        <span class="s-name">${c.name}<small>${G.setById(c.set).name} #${c.n} · ${mark(c, false)}${rarLabel(c.kind)}</small></span>
        <span class="s-count">×${c.count}</span>
        <span class="s-btns"><button type="button" data-act="list" data-key="${k}" ?disabled=${G.state.shown.length >= G.slots()} title="挂进展示柜：收藏党只看柜里的卡">上柜</button>
        <button type="button" data-act="trophy" data-key="${k}" title="当镇店之宝，吸引客流，但不再出售">镇店</button>
        <button type="button" data-act="sell" data-key="${k}" title="立刻卖给同行">卖 ${money(c.price * G.BUYLIST)}</button></span></li>`)}</ul>`, $('singles'));
}
