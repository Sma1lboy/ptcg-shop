// 货柜 · 货架: ONE table of packs, a row per unlocked set (the locked ones are a single line under it). A row holds everything the set needs:
// logo · name · 行情 tag | stock bar (货架 n/cap · 仓库 n) | price tag with − / ＋ and the margin | ONE yellow key + 开 1 包, then the price rail
// (every walk-in's ceiling against your tag, goals.ts) with its one-sentence verdict, then a 更多 fold for the rare things (进 10, 进满仓库,
// 开 10 包, 换货架, 店员自动补货). The yellow key is 补到满 $X: buy the shelf's gap and shelve it in one press (common.ts refillQuote, the
// same quote as the sold-out box), or 上架 N 包 when the back room already covers it. A subgrid table from 900px of shelf width, rows of
// cards below; on a one-column shelf each row folds to name · where it stands · the key.
import { html, render, nothing } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl, lately, restock, refillQuote, swapHint, bar } from './common.ts';
import { hold } from './mat.ts';
import { packCust } from './goals.ts';

// 店员没本钱: the clerk's last round came up short (the till was emptied, most often by an upgrade just before it) and the shelves
// still lack it. Says what it cost, where the money went, and offers his buying now; the 成长 page warns before the buy that causes it.
function clerkNote() {
  const short = G.clerkShort(); if (short <= 0) return nothing;
  const s = G.state, r = s.clerkRound!, cash = s.cash, need = G.clerkNeed(), b = G.nextBill(), missed = SETS.reduce((a, x) => a + G.missed(x.id), 0);
  const ago = Math.round((G.now() - r.at) / 60000), next = Math.max(1, Math.ceil((s.clerkT - G.now()) / 60000));
  const keep = G.clerkKeep(), cheap = Math.min(...G.shelves().filter(x => x.id && s.auto[x.id]).map(x => G.wholesale(x.id!))), spend = Math.min(Math.max(0, cash - keep), need), left = cash - spend;
  return html`<p class="shelf-alert"><b>店员没本钱：</b>${ago > 0 ? `${ago} 分钟前` : '刚才'}那一轮钱不够，还差 <b>${money(short)}</b> 的货${missed ? html`，${lately()} <b>${missed} 位</b>没买到` : ''}；下一轮约 ${next} 分钟后。
      ${cash - keep >= cheap ? html`<button type="button" @click=${() => G.clerkNow()}>现在补货 ${money(spend)}</button>${keep ? html` <small>九姐的 ${money(keep)} 先留着，补完剩 ${money(left)}</small>` : b && left < b.amount ? html` <small>补完剩 ${money(left)}，九姐来收 ${money(b.amount)}：卖出去才回得来</small>` : nothing}`
        : html`<small>${keep && cash >= cheap ? `收银台的钱要留给九姐（${money(keep)}），付完账再补。` : '收银台里还不够一包，卖出几单再补。'}</small>`}</p>`;
}

// Sets the player unfolded on a one-column shelf; kept across renders and page switches, not saved. The first set put on a shelf
// before any price was set opens by itself, once: the guide's 定价 step points at its − / ＋.
const unfold = new Set<string>();
let primed = false;
const unfolded = (id: string) => unfold.has(id);
// Two columns and up never fold (style.css @container), so there the fold buttons are inert: not ten empty tab stops. The width is
// the shelf's own, watched, since the page may be hidden (0 wide) when it renders and the receipt narrows it on desktop.
let wide = false;
new ResizeObserver(([e]) => { const w = e.contentRect.width; if (w && (w >= 700) !== wide) { wide = w >= 700; draw(); } }).observe($('shelf'));
document.addEventListener('ptcg:rail', () => draw()); // a price rail being dragged (goals.ts): the tag moved, nothing was committed yet

// 换货架: the row's select puts the set on shelf i (what was there goes back to the back room), or takes it off every shelf it is on. A
// refused move (the back room cannot take the packs back) changes nothing and emits nothing, so the select is drawn back by hand.
function placeOn(sel: HTMLSelectElement, id: string) {
  let ok = true;
  if (sel.value === 'x') G.shelves().forEach((r, i) => { if (ok && r.id === id) ok = G.place(i, null); });
  else if (sel.value !== '-') ok = G.place(+sel.value, id);
  if (!ok) draw();
}

export function renderShelf() {
  const first = G.shelves().find(r => r.id)?.id;
  if (!first) primed = false; // 清空存档 doesn't reload the page: a fresh shop primes again
  else if (!primed && !Object.keys(G.state.price).length) { primed = true; unfold.add(first); }
  draw();
}

function draw() {
  const s = G.state, shelves = G.shelves(), deep = G.depth(), cust = packCust(), swap = swapHint(), clerkOn = G.lvl('clerk') > 0;
  const sets = SETS.filter(x => G.unlocked(x.id)), locked = SETS.filter(x => !G.unlocked(x.id)).sort((a, b) => G.unlockAt(a.id) - G.unlockAt(b.id));
  const row = (set: typeof SETS[number]) => {
    const id = set.id, name = set.name, w = G.wholesale(id), ev = S.packEV(S.rateKey(id, G.luckMult())), stock = s.stock[id] || 0, onShelf = G.shelfQty(id);
    const own = shelves.filter(r => r.id === id).length, cap = own * deep, pct = G.pctOf(id), margin = G.ask(id) - w, heat = s.heat[id], tag = G.demand(id).tag;
    const q = refillQuote(id), c = cust(id), more = restock(id), room = G.WAREHOUSE - stock, slot = shelves.findIndex(r => r.id === id);
    // the missing set's row says the swap, with the move: every shelf is taken and customers keep asking for it
    const sw = swap?.id === id ? swap : null, held = sw ? shelves[sw.i].id! : '', canSwap = !!sw && (!!stock || clerkOn) && (s.stock[held] || 0) + shelves[sw!.i].qty <= G.WAREHOUSE;
    const verdict = sw ? html`<b>${c.missed} 位没买到</b>：没有空货架；第 ${sw.i + 1} 架的${G.setById(held).name}最近只卖给 ${sw.buyers} 位${canSwap ? html` <button type="button" @click=${() => G.place(sw.i, id)}>换到第 ${sw.i + 1} 架</button>` : '，在「更多」里换'}。` : c.verdict;
    // sum: the folded row on a one-column shelf (style.css): where the set stands, the key beside it
    const sum = html`${own ? html`仓库 <b>${stock}</b> · 货架 ${onShelf ? html`<b>${onShelf}</b>/${cap}` : html`<b>卖空了</b>`} <span class="sticker">${money(G.ask(id))}</span>` : html`没上架 · 仓库 <b>${stock}</b>`}${c.missed ? html` · <b>${c.missed}</b> 位没买到` : nothing}`;
    return html`<article class="set ${unfolded(id) ? 'open' : ''}" data-spot="set:${id}">
      <div class="s-id"><img class="logo" src="${logoUrl(id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3><button type="button" class="fold" ?inert=${wide} aria-expanded="${unfolded(id)}" @click=${() => { if (!unfold.delete(id)) unfold.add(id); draw(); }}>${name}</button>${heat && tag ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销 ↑' : '滞销 ↓'}</span>` : ''}</h3>
          <span class="s-en">${set.en} · ${set.released.slice(0, 4)}${tag ? html` · <span title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${tag}</span>` : ''}</span>
          <span class="set-mkt">市价 ${money(G.sealedPrice(id))} · 进货 ${money(w)} · <span title="按 TCGplayer 单卡市价和开包时的概率计算；有手气时使用实测基础概率乘游戏加成后的概率">开出期望 ${money(ev)}</span></span>
          <span class="s-sum">${sum}</span></div></div>
      <div class="s-stock" role="group" aria-label="${name} 库存">
        <span>${own ? html`货架 <b>${onShelf}</b>/${cap}` : '没上架'}</span>${own ? bar(onShelf / cap, `货架 ${onShelf}/${cap}`) : nothing}
        <span class="muted">仓库 <b>${stock}</b>/${G.WAREHOUSE}</span></div>
      <div class="s-price" role="group" aria-label="${name} 标价">
        <span class="sticker" title="标价（占市价 ${Math.round(pct * 100)}%）">${money(G.ask(id))}</span>
        <span class="pricer"><button type="button" data-act="price" data-id="${id}" data-d="-1" aria-label="降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button>
          <b title="标价占市价的比例">${Math.round(pct * 100)}%</b>
          <button type="button" data-act="price" data-id="${id}" data-d="1" aria-label="涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span>
        <span class="margin ${margin >= 0 ? 'gain' : 'loss'}" title="每包毛利 = 标价 − 进货价">每包 ${margin >= 0 ? '+' : '−'}${money(Math.abs(margin))}</span></div>
      <div class="s-act" role="group" aria-label="${name} 补货和开包">
        <button type="button" class="primary" data-act="${q.act}" data-id="${id}" data-n="${q.n}" title="${q.title}" ?disabled=${!q.ok}>${q.text}</button>
        <button type="button" data-act="open1" data-id="${id}" ?disabled=${!stock || hold}>开 1 包</button></div>
      ${c.rail || verdict ? html`<div class="s-cust">${c.rail ?? nothing}${verdict ? html`<p class="c-note">${verdict}</p>` : nothing}</div>` : nothing}
      <details class="s-more"><summary>更多</summary>
        <div class="m-btns">
          <button type="button" data-act="buy" data-id="${id}" data-n="10" ?disabled=${room < 1 || s.cash < w * Math.min(10, room)}>进 10</button>
          <button type="button" data-act="buy" data-id="${id}" data-n="${more.n}" title="${more.title}" ?disabled=${more.n < 1}>${more.n === room ? '进满仓库' : '进仓库'} ${more.n}</button>
          <button type="button" data-act="open10" data-id="${id}" ?disabled=${stock < 2 || hold}>开 ${stock >= 2 ? Math.min(10, stock) : 10} 包</button></div>
        <label class="m-place">换货架 <select ?disabled=${!stock && !clerkOn && slot < 0} title="${!stock && !clerkOn ? '仓库没货，先进货才能摆上别的货架' : '摆到哪个货架：原来的系列退回仓库'}" @change=${(e: Event) => placeOn(e.target as HTMLSelectElement, id)}>
          ${slot < 0 ? html`<option value="-" .selected=${live(true)} disabled>摆到…</option>` : nothing}
          ${shelves.map((r, i) => html`<option value="${i}" .selected=${live(i === slot)} ?disabled=${!stock && !clerkOn && r.id !== id}>第 ${i + 1} 架 · ${!r.id ? '空' : r.id === id ? '现在摆它' : `换下${G.setById(r.id).name}`}</option>`)}
          ${slot >= 0 ? html`<option value="x" .selected=${live(false)}>撤下，空出货架</option>` : nothing}</select></label>
        ${clerkOn ? html`<label class="m-auto"><input type="checkbox" data-act="auto" data-id="${id}" .checked=${!!s.auto[id]}> 店员自动补货</label>` : nothing}
      </details>
    </article>`;
  };
  const next = locked[0], max = G.RACK_BASE + G.UPGRADES.racks.costs.length;
  render(html`${clerkNote()}
    <p class="shelf-meta"><b>货架 ${shelves.length}/${max}</b> · 每个放 ${deep} 包，摆一个系列。想买的系列不在架上，拆包玩家一半改买别的，一半直接走。${G.upgradeCost('racks') != null ? html` <a href="#grow">去成长加货架</a>` : nothing}</p>
    <div class="shelf-head" aria-hidden="true"><span>系列 · 行情</span><span>库存</span><span>标价</span><span>补货</span></div>
    ${repeat(sets, x => x.id, row)}
    ${next ? html`<p class="set-locked">还有 ${locked.length} 个系列：下一个 ${next.name} 营业额 ${money(G.unlockAt(next.id))} 解锁 ${bar(G.revenue() / G.unlockAt(next.id), `营业额 ${money(G.revenue())}，${next.name}要 ${money(G.unlockAt(next.id))}`)}</p>` : nothing}`, $('shelf'));
}
