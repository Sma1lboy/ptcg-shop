// 货柜 · 货架. Two parts in #shelf:
// 1. The shelf wall: one drawn unit per shelf. Each 加层 level is one more board; a board holds DEPTH_STEP packs, shown as FACES
//    pack faces with the set's logo (sold-out spots stay empty); the player's price label sits on the shelf edge. One <select> per
//    unit puts a set on it, swaps it or clears it (events.ts), and says how many buyers each set lost lately, so the player knows
//    who to make room for.
// 2. A's set table: one row per set (系列·行情 | 仓库 | 货架 | 标价 | 开包), a subgrid table from 1280px, cards below. Only the next
//    step for the set's state is the primary button: no stock → buy, stock but on no shelf → shelve, else → open.
import { html, render, nothing } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import type { Shelf } from '../game.ts';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl, toShelf, shelveLabel } from './common.ts';

const FACES = 5; // pack faces per board; each face stands for DEPTH_STEP / FACES packs
const MIN = G.MISS_WINDOW / 60;

function rack(r: Shelf, i: number, boards: number, deep: number) {
  const s = G.state, id = r.id, per = G.DEPTH_STEP / FACES, filled = Math.ceil(r.qty / per), miss = id ? G.missed(id) : 0;
  const others = SETS.filter(x => G.unlocked(x.id) && x.id !== id), clerk = G.lvl('clerk') > 0; // with a clerk, a shelf can wait for the next round's buying
  const opt = (x: typeof SETS[number]) => { const st = s.stock[x.id] || 0, m = G.missed(x.id);
    return html`<option value="${x.id}" .selected=${live(false)} ?disabled=${!st && !clerk}>${id ? '换成' : '摆'}${x.name}（${st ? `仓库 ${st}` : clerk ? '仓库没货，店员进货' : '仓库没货'}${m ? ` · ${m} 位没找到` : ''}）</option>`; };
  const full = !!id && (s.stock[id] || 0) + r.qty > G.WAREHOUSE;
  // Options bind .selected through live(): after a swap the same template re-renders, and lit's cache would skip re-selecting
  // the current set, leaving the option the player clicked (now some other set) shown as chosen.
  return html`<li class="rack ${id ? (r.qty ? '' : 'out') : 'empty'}" style="${id ? `--logo:url("${logoUrl(id)}")` : ''}">
      <p class="r-sign">${id ? G.setById(id).name : '空货架'}</p>
      <div class="r-boards" aria-hidden="true">${Array.from({ length: boards }, (_, b) => html`<div class="board">${Array.from({ length: FACES }, (_, f) =>
        html`<i class="${(boards - 1 - b) * FACES + f < filled ? 'pk' : ''}"></i>`)}</div>`)}</div>
      <p class="r-edge">${id ? html`<span class="sticker" title="标价（占市价 ${Math.round(G.pctOf(id) * 100)}%）">${money(G.ask(id))}</span>
        <span>${r.qty ? html`<b>${r.qty}</b>/${deep}` : html`<b>卖空了</b>`}</span>` : html`<span class="muted">放 ${deep} 包</span>`}</p>
      ${miss ? html`<p class="r-miss" title="最近 ${MIN} 分钟，来买这个系列、货架上却没有的拆包玩家：一半改买了别的，一半走了">${MIN} 分钟里 <b>${miss}</b> 位没买到</p>` : nothing}
      <div class="r-ctl"><select data-act="place" data-i="${i}" data-cur="${id ?? ''}" aria-label="第 ${i + 1} 个货架摆什么">
          ${id ? html`<option value="${id}" .selected=${live(true)}>${G.setById(id).name}</option>` : html`<option value="-" .selected=${live(true)} disabled>摆上…</option>`}
          ${others.map(opt)}
          ${id ? html`<option value="" .selected=${live(false)} ?disabled=${full}>${full ? '撤下（仓库放不下）' : '撤下，空出货架'}</option>` : nothing}</select>
        ${id ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="999" ?disabled=${!s.stock[id] || r.qty >= deep} title="从仓库补满">补满</button>` : nothing}</div>
    </li>`;
}

function wall() {
  const shelves = G.shelves(), deep = G.depth(), boards = Math.ceil(deep / G.DEPTH_STEP), cash = G.state.cash;
  const nr = G.upgradeCost('racks'), nd = G.upgradeCost('depth');
  return html`<div class="wall">
      <p class="wall-h"><b>货架 ${shelves.length}/${G.RACK_BASE + G.UPGRADES.racks.costs.length}</b><span class="muted">每个 ${boards} 层、放 ${deep} 包，摆一个系列</span>
        <span class="wall-up">${nr != null ? html`<button type="button" data-act="up" data-k="racks" ?disabled=${cash < nr}>加一个货架 ${money(nr)}</button>` : nothing}
          ${nd != null ? html`<button type="button" data-act="up" data-k="depth" ?disabled=${cash < nd}>每个加一层 ${money(nd)}</button>` : nothing}</span></p>
      <ol class="racks">${shelves.map((r, i) => rack(r, i, boards, deep))}</ol>
      <p class="wall-note">想买的系列不在架上，拆包玩家一半改买别的，一半直接走。</p>
    </div>`;
}

export function renderShelf() {
  const s = G.state, shelves = G.shelves(), deep = G.depth(), free = shelves.some(r => !r.id);
  render(html`${wall()}<div class="shelf-head" aria-hidden="true"><span>系列 · 行情</span><span>仓库</span><span>货架</span><span>标价</span><span>开包</span></div>${SETS.map(set => {
    const w = G.wholesale(set.id), ev = S.packEV(S.rateKey(set.id, G.luckMult())), stock = s.stock[set.id] || 0, onShelf = G.shelfQty(set.id);
    const room = G.WAREHOUSE - stock, can = (n: number) => room > 0 && s.cash >= w * Math.min(n, room), pct = G.pctOf(set.id);
    const own = shelves.filter(r => r.id === set.id).length, canShelve = !!stock && (own ? onShelf < own * deep : free), miss = G.missed(set.id);
    const heat = s.heat[set.id];
    const head = (tag?: string) => html`<div class="s-id"><img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}${tag ? html` · <span title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${tag}</span>` : ''}</span></div>
        ${heat && tag ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销 ↑' : '滞销 ↓'}</span>` : ''}</div>`;
    if (!G.unlocked(set.id)) return html`<article class="set locked">${head()}
        <p class="set-mkt">累计营业额 ${money(G.unlockAt(set.id))} 解锁进货（现在 ${money(G.revenue())}）</p></article>`;
    const margin = G.ask(set.id) - w;
    const next = !stock ? 'buy' : !onShelf && canShelve ? 'shelve' : 'open', p = (k: string) => (next === k ? 'primary' : '');
    return html`<article class="set">${head(G.demand(set.id).tag)}
        <p class="set-mkt">市价 ${money(G.sealedPrice(set.id))} · 进货 ${money(w)} · <span title="按 TCGplayer 市价 × 你现在开包的概率（实测概率，有手气时乘上加成）算出的单包期望">开出期望 ${money(ev)}</span></p>
        <div class="verb" role="group" aria-label="${set.name} 进货">
          <span class="v-k">仓库</span><span class="v-n"><b>${stock}</b>/${G.WAREHOUSE}</span>
          <span class="v-btns"><button type="button" class="${can(10) ? '' : p('buy')}" data-act="buy" data-id="${set.id}" data-n="1" ?disabled=${!can(1)}>进 1</button>
            <button type="button" class="${can(10) ? p('buy') : ''}" data-act="buy" data-id="${set.id}" data-n="10" ?disabled=${!can(10)}>进 10</button></span>
        </div>
        <div class="verb" role="group" aria-label="${set.name} 货架">
          <span class="v-k">货架</span><span class="v-n">${own ? html`<b>${onShelf}</b>/${own * deep}${own > 1 ? html`<small>${own} 个货架</small>` : nothing}`
            : html`没上架${miss ? html`<small title="最近 ${MIN} 分钟来买这个系列、货架上没有的拆包玩家"><b>${miss}</b> 位没买到</small>` : nothing}`}</span>
          <span class="v-btns"><button type="button" class="${p('shelve')}" data-act="shelve" data-id="${set.id}" data-n="${toShelf(set.id)}" ?disabled=${!canShelve}
            title="${!canShelve && !own && !free ? '没有空货架：在上面给一个货架换系列，或加一个货架' : `${own ? '补这个系列的货架' : '摆上第一个空货架'}，仓库留 1 包自己拆；货架上的「补满」全搬上去`}">${shelveLabel(set.id, own > 0 || !free)}</button></span>
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
  })}`, $('shelf'));
}
