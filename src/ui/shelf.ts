// 货柜 · 货架. Two parts in #shelf:
// 1. The shelf wall: one bay of shop furniture per shelf (header card with the set's logo, pegboard back, one board per 加层 level
//    holding DEPTH_STEP packs shown as FACES pack faces; sold-out spots show the bare back), the player's price label on the rail
//    under the bottom board, and the next 加一个货架 as an unbuilt bay's outline at the end. One <select> per unit puts a set on it,
//    swaps it or clears it (events.ts), and says how many buyers each set lost lately, so the player knows who to make room for.
// 2. A's set table: one row per set (系列·行情 | 仓库 | 货架 | 标价 | 开包), a subgrid table from 1340px of shelf width, cards below. Only the next
//    step for the set's state is the primary button: no stock → buy, stock but on no shelf → shelve, else → open.
import { html, render, nothing } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { keyed } from 'lit-html/directives/keyed.js';
import type { Shelf } from '../game.ts';
import { SETS, LOOK } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, logoUrl, imgUrl, toShelf, shelveLabel, lately, restock } from './common.ts';
import { hold } from './mat.ts';
import { packFront } from '../table3d.js';

const FACES = 5; // pack faces per board: each face is the front of a row of DEPTH_STEP / FACES packs going back
// A pack row: its front pack face-out, and up to three packs behind it peeking over its top (the row's depth); rows fill board by
// board from the bottom, left to right. A full shelf is a wall of packs three deep, an emptying one thins to single packs, then bare back.
const PEEK = 3;
const row = (left: number, per: number) => left <= 0 ? '' : `pk d${Math.round((Math.min(left, per) - 1) / (per - 1) * PEEK)}`;
// The pack's printed front, the very picture on the 3D pack (table3d.js packFront), once it's painted; until then, or where it
// can't be read back (null: a CDN scan taints the canvas), style.css paints the same look from sets.ts LOOK (colours + chase art).
const fronts: Record<string, string | null> = {};
const look = (id: string) => { // same width as the 2D mat asks for, so each set is painted once
  if (!(id in fronts)) { fronts[id] = null; packFront(id).then((u: string | null) => { if (u) { fronts[id] = u; draw(); } }); }
  const l = LOOK[id], f = fronts[id];
  return (l ? `--c0:${l.c[0]};--c1:${l.c[1]};--c2:${l.c[2]};--art:url("${imgUrl({ set: id, n: l.chase })}");` : '') + (f ? `--front:url("${f}");` : '');
};

// 卖出落在墙上: every render (once a second, on every page, mid-reveal too) compares each shelf with what it held last time. Packs
// gone from a shelf that still holds the same set were sold (sellPacks drains a set's shelves in order, so the drop says which
// shelf; restocking only adds): the packs lift off the boards and a till chip rises from the rail, 「卖出 3 包 +$24」, or
// 「倒爷扫走 12 包」 when a flipper swept that set since. A sold-out shelf whose set lost buyers since says so: 「2 位空手走」, and
// its 卖空了 sign shakes. One beat per shelf per render, gone after LIVE: at 85 walk-ins a minute over seven shelves that is
// a chip every few seconds per shelf. The first render only takes the baseline.
const LIVE = 2400;
type Beat = { k: number; at: number; n: number; gain: number; flip: boolean; lost: number; faces: number[] };
let seen: { id: string | null; qty: number }[] | null = null, missSeen: Record<string, number> = {}, lastAt = 0, beatN = 0;
const beats: (Beat | undefined)[] = [];
function listen(boards: number) {
  const s = G.state, now = Date.now(), per = G.DEPTH_STEP / FACES, shelves = G.shelves();
  const flips = new Set(s.recent.filter(v => v.at > lastAt && v.t === 'flipper' && v.r === 'sold' && v.n).map(v => v.set));
  lastAt = s.recent[0]?.at ?? lastAt;
  const shaken = new Set<string>();
  shelves.forEach((r, i) => {
    const was = seen?.[i], id = r.id; if (!was || !id || was.id !== id) return;
    const n = Math.max(0, was.qty - r.qty), lost = !r.qty && !shaken.has(id) ? G.missed(id) - (missSeen[id] ?? G.missed(id)) : 0;
    if (!r.qty) shaken.add(id); // a set on several empty shelves: said once
    if (!n && lost <= 0) return;
    const faces = Array.from({ length: boards * FACES }, (_, j) => j).filter(j => row(was.qty - j * per, per) !== row(r.qty - j * per, per));
    beats[i] = { k: ++beatN, at: now, n, gain: n * G.ask(id), flip: flips.has(id), lost: Math.max(0, lost), faces };
  });
  seen = shelves.map(r => ({ id: r.id, qty: r.qty }));
  missSeen = Object.fromEntries(SETS.map(x => [x.id, G.missed(x.id)]));
}
const beat = (i: number) => { const b = beats[i]; return b && Date.now() - b.at < LIVE ? b : undefined; };

// A set customers keep asking for that is on no shelf, while every shelf is taken: the shelf whose set sold to the fewest buyers
// in the same window says so and offers the swap (G.place, what its <select> does). Only when more came for the missing set
// than bought from that shelf, so a busy wall doesn't nag.
function swapHint(): { i: number; id: string; miss: number; buyers: number } | null {
  const racks = G.shelves(); if (racks.some(r => !r.id)) return null;
  const want = SETS.filter(x => G.unlocked(x.id) && !racks.some(r => r.id === x.id)).map(x => ({ id: x.id, miss: G.missed(x.id) })).sort((a, b) => b.miss - a.miss)[0];
  if (!want?.miss) return null;
  const since = Date.now() - G.MISS_WINDOW * 1000, buyers = (id: string) => G.state.recent.filter(v => v.at > since && v.r === 'sold' && v.set === id && v.n && !v.card && v.t !== 'seeker').length / racks.filter(r => r.id === id).length;
  const idle = racks.map((r, i) => ({ i, b: buyers(r.id!) })).sort((a, b) => a.b - b.b)[0];
  return want.miss > idle.b ? { i: idle.i, id: want.id, miss: want.miss, buyers: Math.round(idle.b) } : null;
}
// 顾客 rows (goals.ts) light their set's shelves while pointed at (a set on no shelf: the shelf swapHint offers for it)
let lit: string | null = null;
export function point(id: string | null) { if (lit !== id) { lit = id; draw(); } }

function rack(r: Shelf, i: number, boards: number, deep: number, swap: ReturnType<typeof swapHint>) {
  // flippers who swept this set in the 顾客 window (the same one the 没买到 count uses): the player sees the packs gone and why
  const s = G.state, id = r.id, since = Date.now() - G.MISS_WINDOW * 1000, swept = id ? s.recent.filter(v => v.at > since && v.t === 'flipper' && v.r === 'sold' && v.set === id && v.n) : [];
  const per = G.DEPTH_STEP / FACES, miss = id ? G.missed(id) : 0;
  const others = SETS.filter(x => G.unlocked(x.id) && x.id !== id), clerk = G.lvl('clerk') > 0; // with a clerk, a shelf can wait for the next round's buying
  const opt = (x: typeof SETS[number]) => { const st = s.stock[x.id] || 0, m = G.missed(x.id);
    return html`<option value="${x.id}" .selected=${live(false)} ?disabled=${!st && !clerk}>${id ? '换成' : '摆'}${x.name}（${st ? `仓库 ${st}` : clerk ? '仓库没货，店员进货' : '仓库没货'}${m ? ` · ${m} 位没找到` : ''}）</option>`; };
  const full = !!id && (s.stock[id] || 0) + r.qty > G.WAREHOUSE;
  // Options bind .selected through live(): after a swap the same template re-renders, and lit's cache would skip re-selecting
  // the current set, leaving the option the player clicked (now some other set) shown as chosen.
  const bt = beat(i), lift = (j: number) => (bt?.faces.includes(j) ? keyed(bt.k, html`<i class="pk lift"></i>`) : nothing);
  const sw = swap?.i === i ? swap : null, canSwap = !!sw && (!!s.stock[sw.id] || clerk) && !full;
  return html`<li class="rack ${id ? (r.qty ? '' : 'out') : 'empty'} ${lit && (id === lit || sw?.id === lit) ? 'lit' : ''}" style="${id ? `--logo:url("${logoUrl(id)}");${look(id)}` : ''}">
      <p class="r-sign">${id ? html`<img src="${logoUrl(id)}" alt="" loading="lazy"><span>${G.setById(id).name}</span>` : html`<span>空货架</span>`}</p>
      <div class="r-bay" aria-hidden="true">${Array.from({ length: boards }, (_, b) => html`<div class="board">${Array.from({ length: FACES }, (_, f) =>
        html`<i class="${row(r.qty - ((boards - 1 - b) * FACES + f) * per, per)}">${lift((boards - 1 - b) * FACES + f)}</i>`)}</div>`)}${id && !r.qty ? keyed(bt?.lost ? bt.k : 0, html`<span class="r-out ${bt?.lost ? 'shake' : ''}">卖空了</span>`) : nothing}
        ${bt ? keyed(bt.k, html`<span class="r-beat ${bt.n ? '' : 'lost'}">${bt.n ? html`${bt.flip ? '倒爷扫走' : '卖出'} ${bt.n} 包 <em>+${money(bt.gain)}</em>` : `${bt.lost} 位空手走`}</span>`) : nothing}</div>
      <p class="r-rail">${id ? html`<span class="sticker" title="标价（占市价 ${Math.round(G.pctOf(id) * 100)}%）">${money(G.ask(id))}</span>
        <span>${r.qty ? html`<b>${r.qty}</b>/${deep}` : html`<b>0</b>/${deep}`}</span>` : html`<span>放 ${deep} 包</span>`}</p>
      ${swept.length ? html`<p class="r-miss" title="倒爷只收便宜货：每人肯出的上限不同，平均约市价的 ${Math.round(G.TYPES.flipper.tol * 100)}%。你的标价不高于他的上限，他就整架收走，按标价付钱；收过一批，${G.FLIP_COOLDOWN / 60} 分钟内不再收这个系列">倒爷整架收走 <b>${swept.reduce((a, v) => a + v.n!, 0)}</b> 包：标价是市价的 ${Math.round(swept[0].pct! * 100)}%，他肯出到 ${Math.round(Math.max(...swept.map(v => v.max!)) * 100)}%</p>` : nothing}
      ${miss ? html`<p class="r-miss" title="${lately()}，来买这个系列、货架上却没有的拆包玩家：一半改买了别的，一半走了">${lately()} <b>${miss}</b> 位没买到</p>` : nothing}
      ${sw ? html`<p class="r-miss r-swap" title="${lately()}：来买${G.setById(sw.id).name}却不在任何货架上的拆包玩家 ${sw.miss} 位；这个货架的系列买走的只有 ${sw.buyers} 位">${G.setById(sw.id).name} <b>${sw.miss} 位</b>没找到 · 这架只卖给 ${sw.buyers} 位${canSwap ? html` <button type="button" @click=${() => G.place(i, sw.id)}>换成${G.setById(sw.id).name}</button>` : '：在下面换系列'}</p>` : nothing}
      <div class="r-ctl"><select data-act="place" data-i="${i}" data-cur="${id ?? ''}" aria-label="第 ${i + 1} 个货架摆什么">
          ${id ? html`<option value="${id}" .selected=${live(true)}>${G.setById(id).name}</option>` : html`<option value="-" .selected=${live(true)} disabled>摆上…</option>`}
          ${others.map(opt)}
          ${id ? html`<option value="" .selected=${live(false)} ?disabled=${full}>${full ? '撤下（仓库放不下）' : '撤下，空出货架'}</option>` : nothing}</select>
        ${id ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="999" ?disabled=${!s.stock[id] || r.qty >= deep} title="从仓库补满">补满</button>` : nothing}</div>
    </li>`;
}

// The next 加一个货架, drawn where it would stand: the outline of an unbuilt bay (one board, so when it wraps to a row of its own it
// is a small frame, not a wall-high hole) at the end of the wall, its price on the button.
function ghost(cost: number) {
  return html`<li class="rack ghost"><p class="r-sign"><span>还能加一个</span></p>
      <div class="r-bay" aria-hidden="true"><div class="board">${Array.from({ length: FACES }, () => html`<i></i>`)}</div></div>
      <div class="r-ctl"><button type="button" data-act="up" data-k="racks" ?disabled=${G.state.cash < cost}>加一个货架 ${money(cost)}</button></div>
    </li>`;
}

// 店员没本钱: the clerk's last round came up short (the till was emptied, most often by an upgrade just before it) and the shelves
// still lack it. Says what it cost, where the money went, and offers his buying now; the 成长 page warns before the buy that causes it.
function clerkNote() {
  const short = G.clerkShort(); if (short <= 0) return nothing;
  const s = G.state, r = s.clerkRound!, cash = s.cash, need = G.clerkNeed(), b = G.nextBill(), missed = SETS.reduce((a, x) => a + G.missed(x.id), 0);
  const ago = Math.round((Date.now() - r.at) / 60000), next = Math.max(1, Math.ceil((s.clerkT - Date.now()) / 60000));
  const cheap = Math.min(...G.shelves().filter(x => x.id && s.auto[x.id]).map(x => G.wholesale(x.id!))), spend = Math.min(cash, need), left = cash - spend;
  return html`<p class="wall-alert"><b>店员没本钱：</b>${ago > 0 ? `${ago} 分钟前` : '刚才'}那一轮补满货架要 ${money(r.need)}，到现在只进了 ${money(r.spent)}，还差 <b>${money(short)}</b> 的货${missed ? html`；${lately()} <b>${missed} 位</b>来买整包没买到` : ''}。
      店员只拿收银台里的现钱进货：巡货前钱被升级或账单花掉，货架就空着等他下一轮（约 ${next} 分钟后）。
      ${cash >= cheap ? html`<button type="button" class="primary" @click=${() => G.clerkNow()}>现在补货 ${money(spend)}</button>${b && left < b.amount ? html` <small>补完剩 ${money(left)}，九姐来收 ${money(b.amount)}：卖出去才回得来</small>` : nothing}`
        : html`<small>收银台里还不够一包，卖出几单再补。</small>`}</p>`;
}

function wall() {
  const shelves = G.shelves(), deep = G.depth(), boards = Math.ceil(deep / G.DEPTH_STEP), cash = G.state.cash;
  const nr = G.upgradeCost('racks'), nd = G.upgradeCost('depth'), swap = swapHint();
  return html`<div class="wall">
      <p class="wall-h"><b>货架 ${shelves.length}/${G.RACK_BASE + G.UPGRADES.racks.costs.length}</b><span class="muted">每个 ${boards} 层、放 ${deep} 包，摆一个系列</span>
        <span class="wall-up">${nd != null ? html`<button type="button" data-act="up" data-k="depth" ?disabled=${cash < nd}>每个加一层 ${money(nd)}</button>` : nothing}</span></p>
      ${clerkNote()}
      <ol class="racks">${shelves.map((r, i) => rack(r, i, boards, deep, swap))}${nr != null ? ghost(nr) : nothing}</ol>
      <p class="wall-note">想买的系列不在架上，拆包玩家一半改买别的，一半直接走。</p>
    </div>`;
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

export function renderShelf() {
  const first = G.shelves().find(r => r.id)?.id;
  if (!first) primed = false; // 清空存档 doesn't reload the page: a fresh shop primes again
  else if (!primed && !Object.keys(G.state.price).length) { primed = true; unfold.add(first); }
  draw();
}

function draw() {
  listen(Math.ceil(G.depth() / G.DEPTH_STEP));
  const s = G.state, shelves = G.shelves(), deep = G.depth(), free = shelves.some(r => !r.id);
  render(html`${wall()}<div class="shelf-head" aria-hidden="true"><span>系列 · 行情</span><span>仓库</span><span>货架</span><span>标价</span><span>开包</span></div>${SETS.map(set => {
    const w = G.wholesale(set.id), ev = S.packEV(S.rateKey(set.id, G.luckMult())), stock = s.stock[set.id] || 0, onShelf = G.shelfQty(set.id);
    const room = G.WAREHOUSE - stock, full = restock(set.id), can = (n: number) => room > 0 && s.cash >= w * Math.min(n, room), pct = G.pctOf(set.id);
    const own = shelves.filter(r => r.id === set.id).length, canShelve = !!stock && (own ? onShelf < own * deep : free), miss = G.missed(set.id);
    const heat = s.heat[set.id];
    // sum + go: the folded row on a one-column shelf (style.css): where the set stands and the one next step, the rest behind the name
    const head = (tag?: string, sum?: unknown, go?: unknown) => html`<div class="s-id"><img class="logo" src="${logoUrl(set.id)}" alt="${set.en}" loading="lazy">
        <div class="set-name"><h3>${sum ? html`<button type="button" class="fold" ?inert=${wide} aria-expanded="${unfolded(set.id)}" @click=${() => { if (!unfold.delete(set.id)) unfold.add(set.id); draw(); }}>${set.name}</button>` : set.name}${heat && tag ? html`<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：市价 ${heat > 1 ? '+15%，来买的人也更多' : '−10%，来买的人更少'}（游戏设定）">${heat > 1 ? '热销 ↑' : '滞销 ↓'}</span>` : ''}</h3>
          <span class="s-en">${set.en} · ${set.released.slice(0, 4)}${tag ? html` · <span title="来买这个系列的顾客是什么样的人（游戏设定，见页脚）">${tag}</span>` : ''}</span>${sum ? html`<span class="s-sum">${sum}</span>` : nothing}</div>${go ?? nothing}</div>`;
    if (!G.unlocked(set.id)) return html`<article class="set locked">${head()}
        <p class="set-mkt">累计营业额 ${money(G.unlockAt(set.id))} 解锁进货（现在 ${money(G.revenue())}）</p></article>`;
    const margin = G.ask(set.id) - w;
    const next = !stock ? 'buy' : !onShelf && canShelve ? 'shelve' : 'open', p = (k: string) => (next === k ? 'primary' : '');
    const sum = html`${own ? html`仓库 <b>${stock}</b> · 货架 ${onShelf ? html`<b>${onShelf}</b>/${own * deep}` : html`<b>卖空了</b>`} <span class="sticker">${money(G.ask(set.id))}</span>`
      : html`没上架 · 仓库 <b>${stock}</b>`}${miss ? html` · <b>${miss}</b> 位没买到` : nothing}`;
    // later on, when filling the back room costs under a quarter of the cash, the next step is 进满, not ten packs at a time
    const fill = full.n === room && full.n > 10 && full.n * w * 4 <= s.cash;
    const go = next === 'buy' ? (fill ? html`<button type="button" class="primary" data-act="buy" data-id="${set.id}" data-n="${full.n}" title="${full.title}">${full.text}</button>`
      : html`<button type="button" class="primary" data-act="buy" data-id="${set.id}" data-n="${can(10) ? 10 : 1}" ?disabled=${!can(1)}>进 ${can(10) ? 10 : 1}</button>`)
      : next === 'shelve' ? html`<button type="button" class="primary" data-act="shelve" data-id="${set.id}" data-n="${toShelf(set.id)}">${shelveLabel(set.id, own > 0 || !free)}</button>`
      : html`<button type="button" class="primary" data-act="open1" data-id="${set.id}" ?disabled=${hold}>开 1 包</button>`;
    return html`<article class="set ${unfolded(set.id) ? 'open' : ''}">${head(G.demand(set.id).tag, sum, html`<span class="s-go">${go}</span>`)}
        <p class="set-mkt">市价 ${money(G.sealedPrice(set.id))} · 进货 ${money(w)} · <span title="按 TCGplayer 市价 × 你现在开包的概率（实测概率，有手气时乘上加成）算出的单包期望">开出期望 ${money(ev)}</span></p>
        <div class="verb" role="group" aria-label="${set.name} 进货">
          <span class="v-k">仓库</span><span class="v-n"><b>${stock}</b>/${G.WAREHOUSE}</span>
          <span class="v-btns"><button type="button" class="${can(10) ? '' : p('buy')}" data-act="buy" data-id="${set.id}" data-n="1" ?disabled=${!can(1)}>进 1</button>
            <button type="button" class="${can(10) && !fill ? p('buy') : ''}" data-act="buy" data-id="${set.id}" data-n="10" ?disabled=${!can(10)}>进 10</button>
            ${full.n > 10 ? html`<button type="button" class="${fill ? p('buy') : ''}" data-act="buy" data-id="${set.id}" data-n="${full.n}" title="${full.title}">${full.text}</button>` : nothing}</span>
        </div>
        <div class="verb v-shelf" role="group" aria-label="${set.name} 货架">
          <span class="v-k">货架</span><span class="v-n">${own ? html`<b>${onShelf}</b>/${own * deep}${own > 1 ? html`<small>${own} 个货架</small>` : nothing}`
            : html`没上架${miss ? html`<small title="${lately()}来买这个系列、货架上没有的拆包玩家"><b>${miss}</b> 位没买到</small>` : nothing}`}</span>
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
          <span class="v-btns"><button type="button" class="${p('open')}" data-act="open1" data-id="${set.id}" ?disabled=${!stock || hold}>开 1 包</button>
            ${stock === 1 ? nothing : html`<button type="button" data-act="open10" data-id="${set.id}" ?disabled=${!stock || hold}>开 ${Math.min(10, stock) || 10} 包</button>`}</span>
        </div>
      </article>`;
  })}`, $('shelf'));
}
