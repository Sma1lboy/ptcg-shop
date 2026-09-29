// 店铺升级 (成长 tab): one row per upgrade, level pips, next cost.
import { html, render } from 'lit-html';
import { G, $, money, pips } from './common.ts';

export function renderUpgrades() {
  render(html`<h2>店铺升级</h2><ul class="ups">${Object.entries(G.UPGRADES).map(([k, u]) => {
    const lv = G.lvl(k), cost = G.upgradeCost(k);
    return html`<li><span class="u-name">${u.name}<small>${u.desc}</small></span>${pips(lv, u.costs.length)}
        ${cost == null ? html`<span class="u-max">满级</span>` : html`<button type="button" data-act="up" data-k="${k}" ?disabled=${!(G.state.cash >= cost)}>${money(cost)}</button>`}</li>`;
  })}</ul>`, $('upgrades'));
}
