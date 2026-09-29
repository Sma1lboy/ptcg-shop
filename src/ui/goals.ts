// 顾客 (#customers) and 店员 (#clerk) on the 货柜 page, 图鉴 (#dex) on the 欧气 page. Frozen while a pack is being revealed (dex progress would spoil the pull).
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';

const RES: Record<string, string> = { sold: '成交', pricey: '嫌贵', none: '没找到' };

function customers() {
  const rec = G.state.recent, n = rec.length, by = (r: string) => rec.filter(x => x.r === r).length;
  if (!n) return html`<p class="muted">还没有顾客来过。先把货上架。</p>`;
  const [sold, pricey, none] = ['sold', 'pricey', 'none'].map(by);
  const tip = pricey > sold && pricey >= none ? '嫌贵的人比买的人多：试试降价。' : none > sold && none > pricey ? '多数人找不到想要的：货架和展示柜里缺货。' : sold >= n * 0.7 ? '几乎都买了：可以试着涨一点价。' : '';
  return html`<div class="cust-bar" role="img" aria-label="最近 ${n} 位顾客：买走 ${sold}，嫌贵 ${pricey}，没找到 ${none}">
        <span class="c-sold" style="flex:${sold}"></span><span class="c-pricey" style="flex:${pricey}"></span><span class="c-none" style="flex:${none}"></span></div>
      <p class="cust-sum">最近 ${n} 位：<b class="gain">买走 ${sold}</b> · <b class="c-p">嫌贵 ${pricey}</b> · <span class="muted">没找到 ${none}</span></p>
      ${tip ? html`<p class="muted">${tip}</p>` : ''}
      <ul class="cust-feed">${rec.slice(0, 6).map(x => html`<li class="${x.r}"><span>${RES[x.r]}</span>${x.text}</li>`)}</ul>`;
}

function dex() {
  return SETS.filter(s => G.unlocked(s.id)).map(s => {
    const c = G.dexCount(s.id), tot = G.dexTotal(s.id), share = c / tot, next = G.DEX_TIERS.find(([at]) => share < at - 1e-9);
    const need = next ? Math.ceil(next[0] * tot - 1e-9) - c : 0;
    return html`<li><div class="dx-h"><span>${s.name}</span><b>${c}/${tot}</b></div>
        <div class="dx-bar" role="img" aria-label="${s.name} 图鉴 ${Math.round(share * 100)}%"><i style="width:${share * 100}%"></i>${G.DEX_TIERS.map(([at]) => html`<u style="left:${at * 100}%"></u>`)}</div>
        <small class="muted">${next ? `再收 ${need} 张到 ${next[0] * 100}%：回头客 +${next[1] * 100}%` : '已收齐'} · 现有加成 +${Math.round(G.dexBonusOf(s.id) * 100)}%</small>${collect(s.id)}</li>`;
  });
}

// 图鉴补卡: buy the missing hits at market into the binder (never resellable); C/U/R only come from packs. 100% = 大师套.
function collect(id: string) {
  if (G.master(id)) return html`<small class="master">大师套：这个系列的拆包玩家肯多付 ${G.MASTER.tol * 100}%，专程来买的人 ×${G.MASTER.w}</small>`;
  const miss = G.missing(id), base = G.dexTotal(id) - G.dexCount(id) - miss.length, cash = G.state.cash, all = miss.reduce((a, c) => a + c.price, 0), top = miss.at(-1);
  const baseNote = base ? `普卡还缺 ${base} 张，只能开包收` : '';
  if (!top) return html`<small class="muted">闪卡齐了 · ${baseNote}</small>`;
  return html`<div class="btns"><button type="button" data-act="collect" data-id="${id}" ?disabled=${cash < miss[0].price} title="按市价从同行买，只收进图鉴册，不能再卖">补 ${miss[0].name} ${money(miss[0].price)}</button>
      ${miss.length > 1 ? html`<button type="button" data-act="collect" data-id="${id}" data-n="all" ?disabled=${cash < all}>闪卡全补 ${money(all)}</button>` : ''}</div>
    <small class="muted">闪卡还缺 ${miss.length} 张，最贵的是 ${top.name} ${money(top.price)}${baseNote ? ` · ${baseNote}` : ''}</small>`;
}

function clerk() {
  if (!G.lvl('clerk')) return html`<p class="muted">店员（店铺升级里）会在货架见底时自动进货上架，你不在线也照样补。</p>`;
  return html`<ul class="auto">${SETS.filter(s => G.unlocked(s.id)).map(s =>
    html`<li><label><input type="checkbox" data-act="auto" data-id="${s.id}" .checked=${!!G.state.auto[s.id]}> ${s.name}</label></li>`)}</ul>
      <p class="muted">勾选的系列，店员按标价上架；钱不够就少买。</p>`;
}

function renderGoals() {
  if (hold) return;
  render(html`<h2>顾客 · 最近成交</h2>${customers()}`, $('customers'));
  render(html`<h2>图鉴 · 口碑 <span class="dx-total">回头客 +${Math.round(G.dexBonus() * 100)}%</span></h2><ul class="dex">${dex()}</ul>`, $('dex'));
  render(html`<h2>店员 · 自动进货</h2>${clerk()}`, $('clerk'));
}

export function initGoals() {
  document.addEventListener('change', e => { const b = (e.target as Element).closest<HTMLInputElement>('[data-act="auto"]'); if (b) G.setAuto(b.dataset.id!, b.checked); });
  document.addEventListener('ptcg:release', renderGoals);
  G.on(renderGoals); renderGoals();
}
