// 顾客 on the 货柜 page. The pack buyers are in the set rows of 货架 (shelf.ts): packCust() gives each row its price rail (every walk-in's
// ceiling against your tag) and the one verdict, the problem that lost the most customers. #case-cust is the 展示柜 side: the 找卡的 shortage
// table and one sentence under it. #clerk is one line. Frozen while a pack is being revealed (the 展示柜 side leaves the binder out).
import { html, render } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import type { Visit } from '../game.ts';
import { G, $, money, lately, swapHint, rarLabel, RAR } from './common.ts';
import { hold } from './mat.ts';
import { spot } from './case.ts';
import { mark } from './card.ts';
import { go } from './log.ts';

const pc = (x: number) => `${Math.round(x * 100)}%`;
const count = (vs: Visit[], r: string, why?: string) => vs.filter(v => v.r === r && (why === undefined || (v.why || '') === why)).length;
// labels of values in value order: "a、b" for a few, "lo–hi" for many
const spreadOf = (ls: string[], xs: number[]) => { const o = xs.map((x, i) => [x, ls[i]] as const).sort((a, b) => a[0] - b[0]).map(p => p[1]); return o.length > 3 ? `${o[0]}–${o.at(-1)}` : o.join('、'); };
// "$9.80、$10.20" for a few, "$9.80–$11.40" for many
const spread = (xs: number[]) => spreadOf(xs.map(x => money(x)), xs);

// The shelf-edge price rail, MIN_PCT…MAX_PCT of market in the shelf's PCT_STEP steps: customers stacked as dots on the step
// of the most they would pay (ink = buys at the tag as it is now), the flippers' zone along the low end, your yellow tag clipped on.
// A stack is at most 8 dots: past that one dot stands for `per` customers, so at 80 walk-ins a minute the shape still reads.
// Within a step the ones who would balk sit below the ones who would buy (a step can hold both: ceilings are not on the 5% grid).
// The rail is also a price control: a see-through range input over it (whole percents, so steps match the shelf's clampPct),
// click a step or drag the tag and the shelf price moves there; arrow keys step by 5%. id = the set whose shelf tag it moves.
const DOT = 7, STACK = 8; // px per stacked dot, most dots in a stack
export function priceRail(id: string, vs: Visit[], flip: number) {
  const min = G.MIN_PCT, max = G.MAX_PCT, steps = Math.round((max - min) / G.PCT_STEP), step = (p: number) => Math.min(steps, Math.max(0, Math.round((p - min) / G.PCT_STEP)));
  const pct = G.pctOf(id), at = (p: number) => `${step(p) / steps * 100}%`, near = (p: number) => Math.abs(p - pct) < 0.13;
  const mkt = G.sealedPrice(id), tag = money(G.ask(id)), yes = (x: number) => x >= pct - 1e-9, ceil = (xs: number[]) => spreadOf(xs.map(x => money(x * mkt)), xs);
  const cols: { buy: number[]; no: number[] }[] = Array.from({ length: steps + 1 }, () => ({ buy: [], no: [] }));
  for (const v of vs) cols[step(v.max!)][yes(v.max!) ? 'buy' : 'no'].push(v.max!);
  const per = Math.ceil(Math.max(...cols.map(c => c.buy.length + c.no.length)) / STACK), dots = (n: number) => (n ? Math.max(1, Math.round(n / per)) : 0);
  const buy = vs.filter(v => yes(v.max!)).length, h = Math.max(2, ...cols.map(c => Math.min(STACK, dots(c.buy.length) + dots(c.no.length)))) * DOT;
  const lo = Math.round(min * 100), hi = Math.round(max * 100), at100 = Math.round(pct * 100);
  const who = (xs: number[], b: boolean) => `${xs.length} 位最多肯出 ${ceil(xs)}，按现在的标价${b ? '会买' : '不买'}`;
  const label = `${vs.length} 位顾客最多肯出 ${ceil(vs.map(v => v.max!))}，你标 ${tag}，其中 ${buy} 位会买`;
  return html`<div class="c-rule" style="--h:${h}px" role="group" aria-label="${label}">
      <input class="c-set" type="range" min="${lo}" max="${hi}" step="${Math.round(G.PCT_STEP * 100)}" .value=${live(String(at100))} data-id="${id}"
        aria-label="${G.setById(id).name}标价" aria-valuetext="${tag}，市价的 ${at100}%，${buy} 位会买">
      ${flip ? html`<span class="c-flip" style="width:${at(flip)}"></span>` : ''}<span class="c-mkt" style="left:${at(1)}"></span>
      ${cols.map((c, i) => { const nn = dots(c.no.length), nb = dots(c.buy.length), left = `${i / steps * 100}%`;
        return [...Array.from({ length: nn }, (_, k) => [k, false, c.no] as const), ...Array.from({ length: nb }, (_, k) => [nn + k, true, c.buy] as const)]
          .filter(([k]) => k < STACK).map(([k, b, xs]) => html`<i class=${b ? 'buy' : ''} style="left:${left};bottom:calc(100% - var(--h) + ${k * DOT}px)" title="${who(xs, b)}"></i>`); })}
      <span class="sticker" style="left:clamp(30px, ${(pct - min) / (max - min) * 100}%, calc(100% - 30px))">${tag}</span>
      ${flip && !near(G.MIN_PCT + 0.08) ? html`<small class="c-lo">倒爷最高 ${pc(flip)}</small>` : ''}${near(1) ? '' : html`<small class="c-m" style="left:${at(1)}">市价</small>`}
      ${per > 1 && pct < 1.2 ? html`<small class="c-per">一个点 ≈ ${per} 位</small>` : ''}
    </div>`;
}

// What the last MISS_WINDOW of pack buyers (G.state.recent; 没买到 is G.missed) did, per set, for the set rows in shelf.ts: the rail (only
// while the set is on a shelf: that is where the tag matters) and ONE verdict — the problem that lost the most customers first, with
// what fixes it (the row's own yellow key does the buying). Returns the lookup, so a render reads the window once.
export function packCust() {
  const since = G.now() - G.MISS_WINDOW * 1000, rec = G.state.recent.filter(v => v.at > since), s = G.state;
  const openers = rec.filter(v => v.t === 'opener'), flippers = rec.filter(v => v.t === 'flipper'), racks = G.shelves(), free = racks.some(r => !r.id);
  const flip = Math.max(0, ...flippers.map(v => v.max!));
  return (id: string) => {
    const mine = openers.filter(v => v.set === id), missed = G.missed(id), name = G.setById(id).name;
    const dear = mine.filter(v => v.r === 'pricey' && !v.why), broke = count(mine, 'pricey', 'budget');
    const sweptN = flippers.filter(v => v.set === id && v.r === 'sold' && v.n).reduce((a, v) => a + v.n!, 0);
    const racked = racks.some(r => r.id === id), shelf = G.shelfQty(id), stock = s.stock[id] || 0, mkt = G.sealedPrice(id), pct = G.pctOf(id);
    // the price notes read the rail: who would balk at the tag as it is now (it may have moved since they came), and who would still buy
    const faint = mine.filter(v => v.max! < pct - 1e-9).map(v => v.max! * mkt), low = Math.min(...mine.map(v => v.max!));
    // with the clerk on this set, packs bought into the back room go onto the shelf within a second (all but CLERK_KEEP)
    const carry = G.lvl('clerk') > 0 && !!s.auto[id] && racked, mins = Math.max(1, Math.ceil((s.clerkT - G.now()) / 60000));
    const fix = !racked && !free ? '：没有空货架，在「更多」里给它换一个货架'
      : carry ? (stock > G.CLERK_KEEP ? '' : `，仓库${stock ? `只剩 ${stock} 包` : '也空了'}：进到仓库的货店员随时搬上架，不然等他下一轮进货（约 ${mins} 分钟）`)
      : shelf ? '' : `，仓库${stock ? `还有 ${stock} 包` : '也没有'}`;
    // [how many customers it is about, text]: the first one is the verdict
    const top = ([
      [missed, html`<b>${missed} 位没买到</b>：${shelf ? '货架空着的时候来的，卖得比补得快' : racked ? '货架卖空了' : '没摆上货架'}${fix}`],
      [racked ? faint.length : 0, html`按 ${money(G.ask(id))} <b>${faint.length} 位会嫌贵</b>，他们最多肯出 ${spread(faint)}`],
      [broke, `${broke} 位身上的钱不够一包`],
      // a flipper pays the tag like anyone else, he only empties the shelf faster: said, but after anyone who walked out
      [0.3, sweptN ? `倒爷一次买走 ${sweptN} 包（照标价付钱）：标价高过市价的 ${pc(flip)}，倒爷就不买` : ''],
      [0.3, racked && pct <= flip && !sweptN ? `倒爷会来买货：标价高过市价的 ${pc(flip)}，倒爷就不买` : ''],
      [0.5, racked && mine.length >= 3 && !faint.length && low > pct + 0.05 ? `按现在的标价都会买，最低的一位也肯出 ${money(low * mkt)}` : ''],
      [0.1, !mine.length && !missed && shelf ? `${lately()}没有人专门来买${name}${(s.heat[id] || 1) < 1 ? '（滞销）' : ''}` : ''],
    ] as const).filter(([n, t]) => n && t).sort((a, b) => b[0] - a[0])[0];
    return { rail: mine.length && racked ? priceRail(id, mine, flip) : null, verdict: top ? html`${top[1]}。` : null, missed };
  };
}

// 缺货表: seekers ask for one rarity tier (G.SEEK), of one set or any, and leave empty-handed when neither the case nor the
// binder holds one. One row per set they asked for (plus 不挑系列), one cell per tier: who left with nothing in the window against
// the cards of that tier the shop holds now (the seeker's own test: game.ts visit). A cell with none is an empty pocket (缺); one
// with cards but walk-outs means they sell faster than they come in. Under the table one sentence, for the worst set: where that set's
// hits come from and the move that brings more — a set on a shelf is torn open at the counter and sold to you at the 收卡价; a set on
// no shelf reaches the shop only through your own packs, so 收卡价 cannot help it. Hovering a cell lights those cards (case.ts).
const TIER_MARK = ['RR', 'IR', 'SIR'], TIER = TIER_MARK.map(k => `${RAR[k].zh}档`);
const FEW = 3; // phones: the sets that lost the most seekers, the rest behind a button
let allGaps = false;
function gaps(rec: Visit[]) {
  const s = G.state, seekers = rec.filter(v => v.t === 'seeker');
  if (!seekers.some(v => v.r === 'none')) return '';
  const held = [...s.shown.map(c => ({ c, n: 1 })), ...(hold ? [] : Object.values(s.singles).map(c => ({ c, n: c.count })))];
  const have = (id: string, t: number) => held.reduce((a, { c, n }) => a + (G.SEEK[t].includes(c.kind) && (!id || c.set === id) ? n : 0), 0);
  const racks = G.shelves(), free = racks.some(r => !r.id), swap = swapHint();
  const rows = [...new Set(seekers.map(v => v.set || ''))].map(id => {
    const mine = seekers.filter(v => (v.set || '') === id), cells = [0, 1, 2].map(t => {
      const vs = mine.filter(v => v.tier === t);
      return { t, came: vs.length, none: count(vs, 'none'), have: have(id, t) };
    });
    return { id, cells, none: cells.reduce((a, c) => a + c.none, 0) };
  }).filter(r => r.none).sort((a, b) => +!a.id - +!b.id || b.none - a.none); // 不挑系列 last: its fix is every set's
  const src = (id: string) => {
    if (!id) return html`哪个系列的都行：卡本里这一档有就卖得掉。`;
    const set = G.setById(id), racked = racks.some(r => r.id === id), stock = s.stock[id] || 0;
    if (racked && !G.shelfQty(id)) return html`<b>${set.name}货架卖空了</b>：没人买它的包，柜台上也就没人拆。<a href="#shelf">去货架补货</a>`;
    if (racked) {
      const sellers = rec.filter(v => v.offer && v.set === id), took = sellers.reduce((a, v) => a + (v.took || 0), 0), low = sellers.filter(v => v.sell === 'low').length;
      const hard = G.SEEK[2].reduce((a, k) => a + (set.rates[k] || 0), 0);
      return html`${set.name}：柜台上拆它的卖给你 ${took} 张${low ? html` · <b>${low} 位嫌收得低</b>，到展示柜提高收卡价` : ''}${hard ? ` · ${TIER[2]}约 ${Math.round(100 / hard)} 包出一张` : ''}`;
    }
    return html`<b>${set.name}没上货架</b>：没有顾客买它的包来当场拆，调收卡价也收不到它的卡。<a href="#shelf">${free || stock || swap?.id === id ? '去货架上架' : '去货架腾一个'}</a>`;
  };
  return html`<table class="gaps" aria-label="找卡的：${lately()}空手走的，按系列和稀有度档">
      <thead><tr><th scope="col">找卡的 · 空手走</th>${TIER.map((l, t) => html`<th scope="col" title="${G.SEEK[t].map(rarLabel).join('、')}">${mark({ r: TIER_MARK[t], kind: TIER_MARK[t] }, false)} ${l}</th>`)}</tr></thead>
      <tbody class="${allGaps ? 'all' : ''}">${rows.map(({ id, cells }) => html`<tr>
          <th scope="row">${id ? G.setById(id).name : '不挑系列'}</th>
          ${cells.map(({ t, came, none, have }) => {
            const k = `${id}:${t}`;
            return html`<td class="g ${!came ? 'nil' : none ? (have ? 'thin' : 'gap') : ''}" data-spot="seek:${k}" tabindex="${came ? 0 : -1}"
                @pointerenter=${() => spot(k)} @pointerleave=${() => spot(null)} @focusin=${() => spot(k)} @focusout=${() => spot(null)}
                @click=${have ? () => go(['case', '.v-slot.spot, .sb-pk.spot']) : null} @keydown=${have ? (e: KeyboardEvent) => { if (e.key === 'Enter') go(['case', '.v-slot.spot, .sb-pk.spot']); } : null}
                title="${came ? `${lately()}来找 ${came} 位，空手走 ${none} 位；柜里和卡本里现在有 ${have} 张${none ? (have ? '：卖得比补得快' : '：一张没有') : ''}${have ? '。点一下看是哪几张' : ''}` : '没人来找这一档'}">
              ${came ? html`${none ? html`<b>${none}</b>` : html`<span>0</span>`}<small>${have ? `现在 ${have} 张` : '缺'}</small>` : ''}</td>`; })}
        </tr>`)}</tbody></table>
    ${rows.length > FEW ? html`<button type="button" class="c-more" aria-expanded="${allGaps}" @click=${() => { allGaps = !allGaps; customers(); }}>${allGaps ? `只看前 ${FEW} 个` : `再看 ${rows.length - FEW} 个`}</button>` : ''}
    <p class="c-note">${src(rows[0].id)}。</p>`;
}

// With no seeker walked out empty-handed: the one sentence that matters. Counter sellers the shop could not take (the binder full, the bill
// owed) come first; else supply against demand at the single-card tag, every hit the shop has — in the case and in the binder — against
// who would buy at it.
function caseLine(rec: Visit[]) {
  const s = G.state, sellers = rec.filter(v => v.offer), full = sellers.filter(v => v.sell === 'full').length, owe = sellers.filter(v => v.sell === 'owe').length;
  if (full && G.binderN() >= G.BINDER) return html`<b>卡本满了（${G.BINDER} 张）</b>，${full} 位来卖卡的没收成：大卡上柜、单卡标价降一档，或者卖一些给同行。`;
  if (owe) return html`欠着九姐的账，${owe} 位来卖卡的没收：账付了才收。`;
  const all = rec.filter(v => v.t === 'seeker' || v.t === 'collector'); if (!all.length) return '';
  const onHand = hold ? 0 : Object.values(s.singles).filter(c => S.HITS.includes(c.kind)).reduce((a, c) => a + c.count, 0), cards = s.shown.length + onHand;
  const pct = G.casePct(), would = all.filter(v => v.max! >= pct - 1e-9).length;
  return !cards ? html`<b>柜里和卡本里都没有闪卡</b>：开包开出的、柜台上收来的闪卡（${RAR.RR.zh}以上）都进卡本。`
    : would > 2 * cards ? html`按单卡标价 ${pc(pct)} <b>${would} 位会买</b>，柜里加卡本只有 ${cards} 张：愿买的人比卡多得多，标价往上调多半也卖得完。`
    : html`按单卡标价 ${pc(pct)} ${would} 位会买，柜里加卡本 ${cards} 张。`;
}

function customers() {
  const since = G.now() - G.MISS_WINDOW * 1000, rec = G.state.recent.filter(v => v.at > since);
  const body = !rec.length ? html`<p class="muted">${G.state.cust.visits ? `${lately()}还没有顾客进门。` : '还没有顾客来过。先把货上架。'}</p>`
    : gaps(rec) || html`<p class="c-note">${caseLine(rec) || html`${lately()}没有人来翻展示柜和卡本，也没有人来卖卡。`}</p>`;
  render(html`<h2>顾客 · 找卡的</h2>${body}`, $('case-cust'));
}

// 店员: one line, the setting itself is a checkbox in each set's 更多 (shelf.ts)
function clerk() {
  if (!G.lvl('clerk')) return html`<p class="muted">没雇店员：成长里的「店员」1 级帮工每 ${G.CLERK_ROUND_1 / 60} 分钟替你用现金进货。<a href="#grow">去成长</a></p>`;
  const n = SETS.filter(s => G.unlocked(s.id) && G.state.auto[s.id]).length;
  return html`<p class="muted">${G.lvl('clerk') === 1 ? '帮工' : '店员'}在岗，${n ? `${n} 个系列每 ${G.clerkRoundSecs() / 60} 分钟自动补货${G.lvl('clerk') === 1 ? '，货架卖空也马上补' : ''}` : '还没有勾选自动补货的系列（行里的「更多」）'}。<a href="#grow">去成长</a></p>`;
}

function renderGoals() { // mid-reveal too: the 展示柜 side leaves the binder's cards out while a pack is in hand (hold), the rest is the shop
  customers();
  render(clerk(), $('clerk'));
}

export function initGoals() {
  document.addEventListener('change', e => { const b = (e.target as Element).closest<HTMLInputElement>('[data-act="auto"]'); if (b) G.setAuto(b.dataset.id!, b.checked); });
  // dragging a rail only redraws the set table (shelf.ts listens); letting go (change) commits: every panel re-renders and the save is written once
  document.addEventListener('input', e => { const r = e.target as HTMLInputElement; if (r.matches?.('.c-set')) { G.setPrice(r.dataset.id!, +r.value / 100, false); document.dispatchEvent(new Event('ptcg:rail')); } });
  document.addEventListener('change', e => { const r = e.target as HTMLInputElement; if (r.matches?.('.c-set')) G.setPrice(r.dataset.id!, +r.value / 100, true); });
  document.addEventListener('ptcg:release', renderGoals);
  G.on(renderGoals); renderGoals();
}
