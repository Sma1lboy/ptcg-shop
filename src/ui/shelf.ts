// 货架 · 进货: one card per set — stock, open, shelve, price.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl } from './common.ts';

export function renderShelf() {
  const s = G.state;
  render(SETS.map(set => {
    const w = G.wholesale(set.id), ev = S.packEV(S.rateKey(set.id, G.luckMult())), stock = s.stock[set.id] || 0, onShelf = G.shelfQty(set.id);
    const room = G.WAREHOUSE - stock, can = (n: number) => room > 0 && s.cash >= w * Math.min(n, room), shelfRoom = G.capacity() - onShelf, pct = G.pctOf(set.id);
    if (!G.unlocked(set.id)) return html`<article class="set locked"><img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>
        <div class="set-stock">累计营业额 <b>${money(G.unlockAt(set.id))}</b> 解锁进货（现在 ${money(G.revenue())}）</div></article>`;
    const heat = s.heat[set.id], mkt = G.sealedPrice(set.id), margin = G.ask(set.id) - w;
    return html`<article class="set">
        <img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)} · <b title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${G.demand(set.id).tag}</b></span></div>
        <div class="set-price"><span class="sticker" title="货架标价">${money(G.ask(set.id))}</span>${heat ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销' : '滞销'}</span>` : ''}
          <span>市价 ${money(mkt)}</span><span>进货 ${money(w)}</span><span title="按 TCGplayer 市价 × 你现在开包的概率（实测概率，有手气时乘上加成）算出的单包期望">开出期望 ${money(ev)}</span></div>
        <div class="set-stock">仓库 <b>${stock}</b>/${G.WAREHOUSE} · 货架 <b>${onShelf}</b>/${G.capacity()} 包${s.opened[set.id] ? ` · 已开 ${s.opened[set.id]}` : ''}</div>
        <div class="btns">
          <button type="button" data-act="buy" data-id="${set.id}" data-n="1" ?disabled=${!can(1)}>进 1 包</button>
          <button type="button" data-act="buy" data-id="${set.id}" data-n="10" ?disabled=${!can(10)}>进 10 包</button>
          <button type="button" class="primary" data-act="open1" data-id="${set.id}" ?disabled=${!stock}>开 1 包</button>
          <button type="button" data-act="open10" data-id="${set.id}" ?disabled=${!stock}>开 ${Math.min(10, stock) || 10} 包</button>
        </div>
        <div class="btns shelf-ctl" role="group" aria-label="${set.name} 货架">
          <button type="button" data-act="shelve" data-id="${set.id}" data-n="10" ?disabled=${!(stock && shelfRoom > 0)}>上架 10</button>
          <button type="button" data-act="shelve" data-id="${set.id}" data-n="999" ?disabled=${!(stock && shelfRoom > 0)}>全上架</button>
          <button type="button" data-act="unshelve" data-id="${set.id}" data-n="999" ?disabled=${!onShelf}>全撤下</button>
          <span class="pricer"><button type="button" data-act="price" data-id="${set.id}" data-d="-1" aria-label="降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button>
            <b title="标价占市价的比例">${Math.round(pct * 100)}%</b>
            <button type="button" data-act="price" data-id="${set.id}" data-d="1" aria-label="涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span>
          <span class="margin ${margin >= 0 ? 'gain' : 'loss'}" title="每包毛利 = 标价 − 进货价">每包 ${margin >= 0 ? '+' : '−'}${money(Math.abs(margin))}</span>
        </div>
      </article>`;
  }), $('shelf'));
}
