// 店铺升级: one row per upgrade with its next cost.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

export function renderUpgrades() {
  render(html`<h2 class="eyebrow">店铺升级</h2><ul class="ups">${Object.entries(G.UPGRADES).map(([k, u]) => {
    const lv = G.lvl(k), cost = G.upgradeCost(k);
    return html`<li><span class="u-name">${u.name}<small>${u.desc}</small></span><span class="u-lv">Lv${lv}/${u.costs.length}</span>
        ${cost == null ? html`<span class="muted">已满级</span>` : html`<button type="button" data-act="up" data-k="${k}" ?disabled=${!(G.state.cash >= cost)}>${money(cost)}</button>`}</li>`;
  })}</ul>`, $('upgrades'));
}
