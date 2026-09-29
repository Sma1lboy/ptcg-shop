// 货架 · 进货: the shop's shelves (one set each, the player picks), then one card per set — stock, open, shelve, price.
import { html, render } from 'lit-html';
import type { Shelf } from '../game.ts';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl } from './common.ts';

// One shelf: its set, how full, and what to do with it. An empty shelf offers every set that has packs in the back room.
function rack(r: Shelf, i: number, deep: number) {
  if (!r.id) {
    const can = SETS.filter(x => G.unlocked(x.id) && (G.state.stock[x.id] || 0) > 0);
    return html`<li class="rack empty"><span class="muted">空货架</span>
      ${can.length ? html`<div class="btns">${can.map(x => html`<button type="button" data-act="place" data-i="${i}" data-id="${x.id}">摆${x.name}</button>`)}</div>` : html`<small class="muted">仓库没货，先进货</small>`}</li>`;
  }
  const set = G.setById(r.id), stock = G.state.stock[r.id] || 0;
  return html`<li class="rack ${r.qty ? '' : 'out'}"><img class="logo" src="${logoUrl(r.id)}" alt="${set.en}" loading="lazy">
      <span class="r-name">${set.name}</span><span class="sticker" title="标价">${money(G.ask(r.id))}</span>
      <span class="r-bar" role="img" aria-label="${r.qty}/${deep} 包"><i style="width:${r.qty / deep * 100}%"></i></span>
      <span class="r-qty">${r.qty ? `${r.qty}/${deep} 包` : '卖空了'}</span>
      <div class="btns"><button type="button" data-act="shelve" data-id="${r.id}" data-n="999" ?disabled=${!stock || r.qty >= deep} title="从仓库补满">补满</button>
        <button type="button" data-act="place" data-i="${i}" data-id="" ?disabled=${stock + r.qty > G.WAREHOUSE} title="${stock + r.qty > G.WAREHOUSE ? `仓库放不下这 ${r.qty} 包` : '货退回仓库，空出这个货架'}">撤下</button></div></li>`;
}

export function renderShelf() {
  const s = G.state, shelves = G.shelves(), deep = G.depth(), next = G.upgradeCost('racks'), free = shelves.some(r => !r.id);
  render(html`<p class="racks-h"><b>货架 ${shelves.length}/${G.RACK_BASE + G.UPGRADES.racks.costs.length}</b> · 每个放 ${deep} 包
      <small class="muted">一个货架摆一个系列。想买的系列不在架上，一半拆包玩家会改买别的，另一半直接走。</small></p>
    <ol class="racks">${shelves.map((r, i) => rack(r, i, deep))}
      ${next != null ? html`<li class="rack empty"><button type="button" data-act="up" data-k="racks" ?disabled=${s.cash < next}>加一个货架 ${money(next)}</button></li>` : ''}</ol>
    ${SETS.map(set => {
    const w = G.wholesale(set.id), ev = S.packEV(S.rateKey(set.id, G.luckMult())), stock = s.stock[set.id] || 0, onShelf = G.shelfQty(set.id);
    const own = shelves.filter(r => r.id === set.id).length, fits = own ? onShelf < own * deep : free, pct = G.pctOf(set.id);
    const room = G.WAREHOUSE - stock, can = (n: number) => room > 0 && s.cash >= w * Math.min(n, room);
    if (!G.unlocked(set.id)) return html`<article class="set locked"><img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>
        <div class="set-stock">累计营业额 <b>${money(G.unlockAt(set.id))}</b> 解锁进货（现在 ${money(G.revenue())}）</div></article>`;
    const heat = s.heat[set.id], mkt = G.sealedPrice(set.id), margin = G.ask(set.id) - w;
    return html`<article class="set">
        <img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)} · <b title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${G.demand(set.id).tag}</b></span></div>
        <div class="set-price"><span class="sticker" title="货架标价">${money(G.ask(set.id))}</span>${heat ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销' : '滞销'}</span>` : ''}
          <span>市价 ${money(mkt)}</span><span>进货 ${money(w)}</span><span title="按 TCGplayer 市价 × 你现在开包的概率（实测概率，有手气时乘上加成）算出的单包期望">开出期望 ${money(ev)}</span></div>
        <div class="set-stock">仓库 <b>${stock}</b>/${G.WAREHOUSE} · ${own ? html`${own} 个货架上 <b>${onShelf}</b> 包` : '没上架'}${s.opened[set.id] ? ` · 已开 ${s.opened[set.id]}` : ''}</div>
        <div class="btns">
          <button type="button" data-act="buy" data-id="${set.id}" data-n="1" ?disabled=${!can(1)}>进 1 包</button>
          <button type="button" data-act="buy" data-id="${set.id}" data-n="10" ?disabled=${!can(10)}>进 10 包</button>
          <button type="button" class="primary" data-act="open1" data-id="${set.id}" ?disabled=${!stock}>开 1 包</button>
          <button type="button" data-act="open10" data-id="${set.id}" ?disabled=${!stock}>开 ${Math.min(10, stock) || 10} 包</button>
        </div>
        <div class="btns shelf-ctl" role="group" aria-label="${set.name} 货架">
          <button type="button" data-act="shelve" data-id="${set.id}" data-n="999" ?disabled=${!(stock && fits)} title="${own ? '补满这个系列的货架' : free ? '摆上第一个空货架' : '没有空货架：先撤下一个，或加一个货架'}">${own || !free ? '上架' : '摆上空货架'}</button>
          <span class="pricer"><button type="button" data-act="price" data-id="${set.id}" data-d="-1" aria-label="降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button>
            <b title="标价占市价的比例">${Math.round(pct * 100)}%</b>
            <button type="button" data-act="price" data-id="${set.id}" data-d="1" aria-label="涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span>
          <span class="margin ${margin >= 0 ? 'gain' : 'loss'}" title="每包毛利 = 标价 − 进货价">每包 ${margin >= 0 ? '+' : '−'}${money(Math.abs(margin))}</span>
        </div>
      </article>`;
  })}`, $('shelf'));
}
