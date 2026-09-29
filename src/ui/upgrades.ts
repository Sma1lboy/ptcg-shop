// 成长 page, part 1: the incremental loop at a glance — shop level, the next thing cash can buy, what growth has bought so far,
// and the next set that lifetime revenue unlocks — then 店铺升级 as pockets on a binder page.
// Each pocket shows its level, current → next effect, and until it is affordable a bar filling toward the next price.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, pips, logoUrl } from './common.ts';

// What each upgrade level does, in the same words as the skills' fx (display only; the numbers are game.ts's).
const UFX: Record<string, (lv: number) => string> = {
  signage: lv => `肯多付 +${Math.round(G.SIGN_STEP * 100 * lv)}%`,
  racks: lv => `${G.RACK_BASE + lv} 个货架`,
  depth: lv => `每架 ${G.DEPTH_BASE + G.DEPTH_STEP * lv} 包`,
  case: lv => `${G.CASE_BASE + G.CASE_STEP * lv} 个柜位`,
  supplier: lv => `进货打 ${+((G.WHOLESALE - G.WHOLESALE_STEP * lv) * 10).toFixed(1)} 折`,
  clerk: lv => ['没有店员', '巡货架，补到半满', '补满，卖散卡'][lv],
};

// One upgrade or skill pocket. fx = what the current / next level does.
export function tile(o: { name: string; tag?: string; desc: string; lv: number; max: number; cost: number | null | undefined; fx?: [string, string]; act: string; k: string; blocked?: string }) {
  const cash = G.state.cash, done = o.cost == null, can = !done && !o.blocked && cash >= o.cost!;
  return html`<li class="gtile ${done ? 'max' : can ? 'can' : ''}">
      <p class="gt-top"><b>${o.name}</b>${o.tag ? html`<small>${o.tag}</small>` : ''}<span class="gt-lv">Lv ${o.lv}<small>/${o.max}</small></span></p>
      ${pips(o.lv, o.max)}
      ${o.fx ? html`<p class="gt-fx">${done ? o.fx[0] : html`${o.fx[0]} <span aria-hidden="true">→</span> <b>${o.fx[1]}</b>`}</p>` : ''}
      <p class="gt-desc">${o.desc}</p>
      ${done ? html`<p class="gt-done">满级</p>` : o.blocked ? html`<p class="gt-done">${o.blocked}</p>`
        : html`<div class="gt-buy"><button type="button" data-act="${o.act}" data-k="${o.k}" ?disabled=${!can}><span class="gb-lv">升到 Lv ${o.lv + 1} · </span>${money(o.cost!)}</button>
          ${can ? '' : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / o.cost! * 100)}%"><i style="width:${Math.min(100, cash / o.cost! * 100)}%"></i></span><small>还差 ${money(o.cost! - cash)}</small>`}</div>`}
    </li>`;
}

// An empty pocket to finish the last row of a two-column binder page (hidden when pockets are rows, on phones).
export const pad = (n: number) => n % 2 ? html`<li class="gtile empty" aria-hidden="true"></li>` : '';

// Everything cash can level, as one list: the goal the header points at is the cheapest of these.
function buyables() {
  return [
    ...Object.entries(G.UPGRADES).map(([k, u]) => ({ k, act: 'up', name: u.name, lv: G.lvl(k), cost: G.upgradeCost(k), fx: UFX[k] })),
    ...Object.entries(G.SKILLS).filter(([k]) => G.canLearn(k)).map(([k, s]) => ({ k, act: 'learn', name: s.name, lv: G.skill(k), cost: G.skillCost(k), fx: s.fx })),
  ].filter(b => b.cost != null) as { k: string; act: string; name: string; lv: number; cost: number; fx: (lv: number) => string }[];
}

// Short money for the milestone track on phones, where seven thresholds share the width.
const kMoney = (v: number) => v >= 1000 ? `$${v / 1000}k` : `$${v}`;

// 营业额 milestones: each later set unlocks at a lifetime revenue. The track fills segment by segment between thresholds.
function milestones() {
  const rev = G.revenue(), at = SETS.map(s => G.unlockAt(s.id)), next = SETS.find(s => !G.unlocked(s.id));
  return html`<section class="mile" aria-labelledby="mile-h">
    <h2 id="mile-h">营业额解锁新系列 <small>累计营业额 ${money(rev)}</small></h2>
    <ol class="mile-track" style="--n:${SETS.length}">${SETS.map((s, i) => {
      const got = rev >= at[i], fill = i === 0 ? 1 : Math.max(0, Math.min(1, (rev - at[i - 1]) / (at[i] - at[i - 1] || 1)));
      return html`<li class="${got ? 'got' : s === next ? 'next' : ''}" style="--f:${fill}">
        <img src="${logoUrl(s.id)}" alt="" loading="lazy"><b>${s.name}</b><small>${at[i] ? html`<span class="m-full">$${at[i].toLocaleString('en-US')}</span><span class="m-short">${kMoney(at[i])}</span>` : '开店就有'}</small></li>`;
    })}</ol>
    <p class="mile-next">${next ? html`下一个：<b>${next.name}</b>，还差 ${money(G.unlockAt(next.id) - rev)} 营业额（卖出的整包和单卡都算）` : '七个系列都解锁了。'}</p>
  </section>`;
}

export function renderUpgrades() {
  const ups = Object.entries(G.UPGRADES), sks = Object.entries(G.SKILLS), cash = G.state.cash;
  const lv = ups.reduce((a, [k]) => a + G.lvl(k), 0) + sks.reduce((a, [k]) => a + G.skill(k), 0);
  const max = ups.reduce((a, [, u]) => a + u.costs.length, 0) + sks.reduce((a, [, s]) => a + s.max, 0);
  const goal = buyables().sort((a, b) => a.cost - b.cost)[0];
  render(html`<header class="grow-head">
      <div class="gh-lv"><p><span>店铺等级</span><b>Lv ${lv}</b><small>/ ${max}</small></p>
        <span class="gh-bar" role="img" aria-label="${lv}/${max}"><i style="--p:${lv / max}"></i></span></div>
      ${goal ? html`<div class="gh-goal">
        <p class="gg-k">${cash >= goal.cost ? '现在就能升' : '下一个目标'}</p>
        <p class="gg-what"><b>${goal.name} Lv ${goal.lv + 1}</b><span>${goal.fx(goal.lv)} → <b>${goal.fx(goal.lv + 1)}</b></span></p>
        ${cash >= goal.cost ? html`<button type="button" data-act="${goal.act}" data-k="${goal.k}">升级 · ${money(goal.cost)}</button>`
          : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / goal.cost * 100)}%"><i style="width:${cash / goal.cost * 100}%"></i></span>
            <small>${money(cash)} / ${money(goal.cost)}，还差 ${money(goal.cost - cash)}</small>`}
      </div>` : html`<p class="gh-goal gg-k">都升满了。</p>`}
      <dl class="gh-now">
        <div><dt>进店</dt><dd>${(G.rate() * 60).toFixed(1)} 人/分</dd></div>
        <div><dt>进货价</dt><dd>市价打 ${+(G.wholesaleRate() * 10).toFixed(1)} 折</dd></div>
        <div><dt>货架</dt><dd>${G.racks()} × ${G.depth()} 包</dd></div>
        <div><dt>展示柜</dt><dd>${G.slots()} 格</dd></div>
        <div><dt>手气</dt><dd>×${G.luckMult().toFixed(2)}</dd></div>
        <div><dt>打烊结算</dt><dd>${G.offlineCap() / 3600} 小时</dd></div>
      </dl>
    </header>
    ${milestones()}`, $('grow-top'));
  render(html`<h2>店铺升级 <small>改柜台、货架和进货</small></h2>
    <ul class="grow-grid">${ups.map(([k, u]) => { const l = G.lvl(k); return tile({ name: u.name, desc: u.desc, lv: l, max: u.costs.length, cost: G.upgradeCost(k), fx: [UFX[k](l), UFX[k](l + 1)], act: 'up', k }); })}${pad(ups.length)}</ul>`, $('upgrades'));
}
