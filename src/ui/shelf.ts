// 货架 · 进货: one row per set, the buttons grouped by verb (warehouse / shelf / price / open).
// Only the next step for the set's current state is the primary button: no stock → buy, stock but nothing out → shelve, else → open.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl } from './common.ts';

export function renderShelf() {
  const s = G.state;
  render(SETS.map(set => {
    const w = G.wholesale(set.id), ev = S.packEV(S.rateKey(set.id, G.luckMult())), stock = s.stock[set.id] || 0, onShelf = G.shelfQty(set.id);
    const room = G.WAREHOUSE - stock, can = (n: number) => room > 0 && s.cash >= w * Math.min(n, room), shelfRoom = G.capacity() - onShelf, pct = G.pctOf(set.id);
    const head = html`<img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>`;
    if (!G.unlocked(set.id)) return html`<article class="set locked">${head}
        <p class="set-mkt">累计营业额 ${money(G.unlockAt(set.id))} 解锁进货（现在 ${money(G.revenue())}）</p></article>`;
    const heat = s.heat[set.id], margin = G.ask(set.id) - w, canShelve = !!(stock && shelfRoom > 0);
    const next = !stock ? 'buy' : !onShelf && canShelve ? 'shelve' : 'open', p = (k: string) => (next === k ? 'primary' : '');
    return html`<article class="set">${head}
        ${heat ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销 ↑' : '滞销 ↓'}</span>` : ''}
        <p class="set-mkt">市价 ${money(G.sealedPrice(set.id))} · 进货 ${money(w)} · <span title="按 TCGplayer 市价 × 你现在开包的概率（实测概率，有手气时乘上加成）算出的单包期望">开出期望 ${money(ev)}</span>
          · <span title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${G.demand(set.id).tag}</span></p>
        <div class="verb" role="group" aria-label="${set.name} 进货">
          <span class="v-k">仓库</span><span class="v-n"><b>${stock}</b>/${G.WAREHOUSE}</span>
          <span class="v-btns"><button type="button" class="${can(10) ? '' : p('buy')}" data-act="buy" data-id="${set.id}" data-n="1" ?disabled=${!can(1)}>进 1</button>
            <button type="button" class="${can(10) ? p('buy') : ''}" data-act="buy" data-id="${set.id}" data-n="10" ?disabled=${!can(10)}>进 10</button></span>
        </div>
        <div class="verb" role="group" aria-label="${set.name} 货架">
          <span class="v-k">货架</span><span class="v-n"><b>${onShelf}</b>/${G.capacity()}</span>
          <span class="v-btns"><button type="button" data-act="shelve" data-id="${set.id}" data-n="10" ?disabled=${!canShelve}>上架 10</button>
            <button type="button" class="${p('shelve')}" data-act="shelve" data-id="${set.id}" data-n="999" ?disabled=${!canShelve}>全上架</button>
            <button type="button" data-act="unshelve" data-id="${set.id}" data-n="999" ?disabled=${!onShelf}>撤下</button></span>
        </div>
        <div class="verb" role="group" aria-label="${set.name} 标价">
          <span class="v-k">标价</span><span class="sticker" title="货架标价">${money(G.ask(set.id))}</span>
          <span class="pricer"><button type="button" data-act="price" data-id="${set.id}" data-d="-1" aria-label="降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button>
            <b title="标价占市价的比例">${Math.round(pct * 100)}%</b>
            <button type="button" data-act="price" data-id="${set.id}" data-d="1" aria-label="涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span>
          <span class="margin ${margin >= 0 ? 'gain' : 'loss'}" title="每包毛利 = 标价 − 进货价">每包 ${margin >= 0 ? '+' : '−'}${money(Math.abs(margin))}</span>
        </div>
        <div class="verb" role="group" aria-label="${set.name} 开包">
          <span class="v-k">开包</span><span class="v-n">${s.opened[set.id] ? `已开 ${s.opened[set.id]}` : ''}</span>
          <span class="v-btns"><button type="button" class="${p('open')}" data-act="open1" data-id="${set.id}" ?disabled=${!stock}>开 1 包</button>
            <button type="button" data-act="open10" data-id="${set.id}" ?disabled=${!stock}>开 ${Math.min(10, stock) || 10} 包</button></span>
        </div>
      </article>`;
  }), $('shelf'));
}
