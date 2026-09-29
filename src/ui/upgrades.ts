// 成长 page, part 1: the shop's overall level and what growth has bought so far, then 店铺升级 as pockets on a binder page.
// Each pocket shows its level, and until it is affordable a bar filling toward the next price (the incremental "saving up").
import { html, render } from 'lit-html';
import { G, $, money, pips } from './common.ts';

// One upgrade or skill pocket. fx = what the current / next level does, when the item can say it.
export function tile(o: { name: string; tag?: string; desc: string; lv: number; max: number; cost: number | null | undefined; fx?: [string, string]; act: string; k: string; blocked?: string }) {
  const cash = G.state.cash, done = o.cost == null, can = !done && !o.blocked && cash >= o.cost!;
  return html`<li class="gtile ${done ? 'max' : can ? 'can' : ''}">
      <p class="gt-top"><b>${o.name}</b>${o.tag ? html`<small>${o.tag}</small>` : ''}<span class="gt-lv">Lv ${o.lv}<small>/${o.max}</small></span></p>
      ${pips(o.lv, o.max)}
      <p class="gt-desc">${o.desc}</p>
      ${o.fx ? html`<p class="gt-fx">${done ? o.fx[0] : html`${o.fx[0]} <span aria-hidden="true">→</span> <b>${o.fx[1]}</b>`}</p>` : ''}
      ${done ? html`<p class="gt-done">满级</p>` : o.blocked ? html`<p class="gt-done">${o.blocked}</p>`
        : html`<div class="gt-buy"><button type="button" class="${can ? 'primary' : ''}" data-act="${o.act}" data-k="${o.k}" ?disabled=${!can}>升到 Lv ${o.lv + 1} · ${money(o.cost!)}</button>
          ${can ? '' : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / o.cost! * 100)}%"><i style="width:${Math.min(100, cash / o.cost! * 100)}%"></i></span><small>还差 ${money(o.cost! - cash)}</small>`}</div>`}
    </li>`;
}

export function renderUpgrades() {
  const ups = Object.entries(G.UPGRADES), sks = Object.entries(G.SKILLS);
  const lv = ups.reduce((a, [k]) => a + G.lvl(k), 0) + sks.reduce((a, [k]) => a + G.skill(k), 0);
  const max = ups.reduce((a, [, u]) => a + u.costs.length, 0) + sks.reduce((a, [, s]) => a + s.max, 0);
  render(html`<header class="grow-head">
      <p class="gh-lv"><span>店铺等级</span><b>Lv ${lv}</b><small>/ ${max}</small></p>
      <span class="gh-bar" role="img" aria-label="${lv}/${max}"><i style="width:${lv / max * 100}%"></i></span>
      <dl class="gh-now">
        <div><dt>进店</dt><dd>${(G.rate() * 60).toFixed(1)} 人/分</dd></div>
        <div><dt>进货价</dt><dd>市价 ${Math.round(G.wholesaleRate() * 100)}%</dd></div>
        <div><dt>展示柜</dt><dd>${G.slots()} 格</dd></div>
        <div><dt>手气</dt><dd>×${G.luckMult().toFixed(2)}</dd></div>
        <div><dt>打烊结算</dt><dd>${G.offlineCap() / 3600} 小时</dd></div>
      </dl>
    </header>
    <h2>店铺升级 <small>改柜台、货架和进货</small></h2>
    <ul class="grow-grid">${ups.map(([k, u]) => tile({ name: u.name, desc: u.desc, lv: G.lvl(k), max: u.costs.length, cost: G.upgradeCost(k), act: 'up', k }))}</ul>`, $('upgrades'));
}
