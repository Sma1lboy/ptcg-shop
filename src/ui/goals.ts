// 顾客 (#customers) and 店员 (#clerk) on the 货柜 page. Frozen while a pack is being revealed.
// 顾客 reads the last MISS_WINDOW of walk-ins (G.state.recent; 没买到 is G.missed, the shelf wall's count) by what they came for: pack buyers per set, each set with a price rail (every
// customer's ceiling against your tag), then the case browsers by the rarity they asked for. Each group says what to change.
import { html, render } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import type { Visit } from '../game.ts';
import { G, $, money, toShelf, shelveLabel, lately, restock, rarLabel, rarNames, RAR } from './common.ts';
import { hold } from './mat.ts';
import { point, swapHint } from './shelf.ts';
import { spot } from './case.ts';
import { mark } from './card.ts';
import { go } from './log.ts';

const pc = (x: number) => `${Math.round(x * 100)}%`;
const count = (vs: Visit[], r: string, why?: string) => vs.filter(v => v.r === r && (why === undefined || (v.why || '') === why)).length;
// "$9.80、$10.20" for a few, "$9.80–$11.40" for many
const spread = (xs: number[]) => spreadOf(xs.map(money), xs);
// labels of values in value order: "a、b" for a few, "lo–hi" for many
const spreadOf = (ls: string[], xs: number[]) => { const o = xs.map((x, i) => [x, ls[i]] as const).sort((a, b) => a[0] - b[0]).map(p => p[1]); return o.length > 3 ? `${o[0]}–${o.at(-1)}` : o.join('、'); };
const tally = (parts: [string, number][]) => parts.filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ');

// The shelf-edge price rail, MIN_PCT…MAX_PCT of market in the shelf's PCT_STEP steps: customers stacked as dots on the step
// of the most they would pay (ink = buys at the tag as it is now), the flippers' zone along the low end, your yellow tag clipped on.
// A stack is at most 8 dots: past that one dot stands for `per` customers, so at 80 walk-ins a minute the shape still reads.
// Within a step the ones who would balk sit below the ones who would buy (a step can hold both: ceilings are not on the 5% grid).
// The rail is also the price control: a see-through range input over it (whole percents, so steps match the shelf's clampPct),
// click a step or drag the tag and the shelf price moves there; arrow keys step by 5%.
// id = the set whose shelf tag it moves; '' = the 单卡标价 (case and binder: case browsers' ceilings are shares of each card's own
// market price, so that rail prints percents where a set's prints dollars); 'buy' = the 收卡价, where the dots are counter sellers'
// floors (the least they take) and a solid dot is one who sells to you at the price as it is now. It spans BUY_MIN…BUY_MAX and
// marks what a peer shop pays (BUYLIST) where the others mark market.
const DOT = 7, STACK = 8; // px per stacked dot, most dots in a stack
function priceRail(id: string, vs: Visit[], flip: number) {
  const sell = id === 'buy', min = sell ? G.BUY_MIN : G.MIN_PCT, max = sell ? G.BUY_MAX : G.MAX_PCT, val = (v: Visit) => (sell ? v.floor! : v.max!);
  const steps = Math.round((max - min) / G.PCT_STEP), step = (p: number) => Math.min(steps, Math.max(0, Math.round((p - min) / G.PCT_STEP)));
  const pct = sell ? G.buyPct() : id ? G.pctOf(id) : G.casePct(), at = (p: number) => `${step(p) / steps * 100}%`, near = (p: number) => Math.abs(p - pct) < 0.13;
  const set = id && !sell, mkt = set ? G.sealedPrice(id) : 0, cash = (x: number) => (set ? money(x * mkt) : pc(x)), spread = (xs: number[]) => spreadOf(xs.map(cash), xs);
  const tag = sell ? `收 ${pc(pct)}` : set ? money(G.ask(id)) : `标 ${pc(pct)}`, yes = (x: number) => (sell ? x <= pct + 1e-9 : x >= pct - 1e-9);
  const cols: { buy: number[]; no: number[] }[] = Array.from({ length: steps + 1 }, () => ({ buy: [], no: [] }));
  for (const v of vs) cols[step(val(v))][yes(val(v)) ? 'buy' : 'no'].push(val(v));
  const per = Math.ceil(Math.max(...cols.map(c => c.buy.length + c.no.length)) / STACK), dots = (n: number) => (n ? Math.max(1, Math.round(n / per)) : 0);
  const buy = vs.filter(v => yes(val(v))).length, h = Math.max(2, ...cols.map(c => Math.min(STACK, dots(c.buy.length) + dots(c.no.length)))) * DOT;
  const lo = Math.round(min * 100), hi = Math.round(max * 100), at100 = Math.round(pct * 100), mark = sell ? G.BUYLIST : 1;
  const who = (xs: number[], b: boolean) => sell ? `${xs.length} 位最少要市价的 ${spread(xs)}，按现在的收卡价${b ? '会卖给你' : '不卖'}` : `${xs.length} 位最多肯出${set ? '' : '市价的'} ${spread(xs)}，按现在的标价${b ? '会买' : '不买'}`;
  const label = sell ? `${vs.length} 位来卖卡的最少要市价的 ${spread(vs.map(val))}，你收 ${pc(pct)}，其中 ${buy} 位会卖` : `${vs.length} 位顾客最多肯出${set ? '' : '市价的'} ${spread(vs.map(val))}，你标 ${tag}，其中 ${buy} 位会买`;
  return html`<div class="c-rule" style="--h:${h}px" role="group" aria-label="${label}">
      <input class="c-set" type="range" min="${lo}" max="${hi}" step="${Math.round(G.PCT_STEP * 100)}" .value=${live(String(at100))} data-id="${id}"
        aria-label="${sell ? '收卡价' : set ? `${G.setById(id).name}标价` : '单卡标价'}" aria-valuetext="${set ? `${money(G.ask(id))}，` : ''}市价的 ${at100}%，${buy} 位${sell ? '会卖' : '会买'}">
      ${flip ? html`<span class="c-flip" style="width:${at(flip)}"></span>` : ''}<span class="c-mkt" style="left:${at(mark)}"></span>
      ${cols.map((c, i) => { const nn = dots(c.no.length), nb = dots(c.buy.length), left = `${i / steps * 100}%`;
        return [...Array.from({ length: nn }, (_, k) => [k, false, c.no] as const), ...Array.from({ length: nb }, (_, k) => [nn + k, true, c.buy] as const)]
          .filter(([k]) => k < STACK).map(([k, b, xs]) => html`<i class=${b ? 'buy' : ''} style="left:${left};bottom:calc(100% - var(--h) + ${k * DOT}px)" title="${who(xs, b)}"></i>`); })}
      <span class="sticker" style="left:clamp(30px, ${(pct - min) / (max - min) * 100}%, calc(100% - 30px))">${tag}</span>
      ${flip && !near(G.MIN_PCT + 0.08) ? html`<small class="c-lo">倒爷 ≤${pc(flip)}</small>` : ''}${near(mark) ? '' : html`<small class="c-m" style="left:${at(mark)}">${sell ? '同行价' : '市价'}</small>`}
      ${per > 1 && pct < 1.2 ? html`<small class="c-per">一个点 ≈ ${per} 位</small>` : ''}
    </div>`;
}

// One set: a line of counts, the rail (only while it is on a shelf: that is where the tag matters), then one verdict — the
// problem that lost the most customers first, with the move that fixes it — and at most one more.
// Phones list only the FEW sets that lost the most (style.css), the rest behind a button: ten rails ran two screens under the shelf.
const FEW = 3;
let allSets = false;
function packs(rec: Visit[]) {
  const openers = rec.filter(v => v.t === 'opener'), flippers = rec.filter(v => v.t === 'flipper'), s = G.state;
  const flip = Math.max(0, ...flippers.map(v => v.max!)), racks = G.shelves(), free = racks.some(r => !r.id);
  const rows = SETS.map(x => x.id).filter(id => G.unlocked(id) && (racks.some(r => r.id === id) || G.missed(id) || openers.some(v => v.set === id))).map(id => {
    const mine = openers.filter(v => v.set === id), missed = G.missed(id), sold = count(mine, 'sold');
    const dear = mine.filter(v => v.r === 'pricey' && !v.why), broke = count(mine, 'pricey', 'budget');
    const swept = flippers.filter(v => v.set === id && v.r === 'sold' && v.n), sweptN = swept.reduce((a, v) => a + v.n!, 0);
    // order by who already walked out (not by the rail's faint dots: those move while the tag is dragged)
    return { id, mine, missed, sold, dear, broke, swept, sweptN, lost: missed + dear.length + broke };
  }).sort((a, b) => b.lost - a.lost);
  if (!rows.length) return '';
  return html`<p class="c-h">点是顾客最多肯出的价：实的按现在的标价会买，淡的不会。点轨上哪一档，标价就改到哪一档</p>
    <ul class="c-sets ${allSets ? 'all' : ''}">${repeat(rows, r => r.id, ({ id, mine, missed, sold, dear, broke, swept, sweptN }) => {
      const racked = racks.some(r => r.id === id), shelf = G.shelfQty(id), stock = s.stock[id] || 0, mkt = G.sealedPrice(id), name = G.setById(id).name;
      // the price notes read the rail: who would balk at the tag as it is now (it may have moved since they came), and who would still buy
      const pct = G.pctOf(id), faint = mine.filter(v => v.max! < pct - 1e-9).map(v => v.max! * mkt), low = Math.min(...mine.map(v => v.max!));
      // what would put the set back on sale: the same moves the shelf above offers. With the clerk on this set, packs bought into the
      // back room go onto the shelf within a second (all but CLERK_KEEP), so 进满 is the fix even while the shelf still has some.
      const clerk = G.lvl('clerk') > 0 && !!s.auto[id], carry = clerk && racked, buf = carry ? G.CLERK_KEEP : 0, fill = restock(id);
      const buy = html`<button type="button" data-act="buy" data-id="${id}" data-n="${fill.n}" title="${fill.title}" ?disabled=${!fill.n}>${fill.n ? fill.text : '进货'}</button>`;
      const refill = stock > buf && !carry ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="${racked ? 999 : toShelf(id)}">${racked ? '补满' : shelveLabel(id, false)}</button>` : buy;
      const act = racked || free ? refill : '', mins = Math.max(1, Math.ceil((s.clerkT - Date.now()) / 60000));
      const fix = !racked && !free ? '：在上面给一个货架换系列，或者加一个货架'
        : carry ? (stock > buf ? '' : `，仓库${stock ? `只剩 ${stock} 包` : '也空了'}：进到仓库的货店员随时搬上架，不然等他下一轮进货（约 ${mins} 分钟）`)
        : shelf ? '' : `，仓库${stock ? `还有 ${stock} 包` : '也没有'}`;
      // [how many customers it is about, text, button]
      const notes = ([
        [missed, html`<b>${missed} 位没买到</b>：${shelf ? '货架空着的时候来的，卖得比补得快' : racked ? '货架卖空了' : '没摆上货架'}${fix}`, missed && (!shelf || fix) ? act : ''],
        [racked ? faint.length : 0, html`按 ${money(G.ask(id))} <b>${faint.length} 位会嫌贵</b>，他们最多肯出 ${spread(faint)}`, ''],
        [broke, `${broke} 位身上的钱不够一包`, ''],
        // a flipper pays the tag like anyone else, he only empties the shelf faster: said, but after anyone who walked out
        [0.3, sweptN ? `倒爷整架扫走 ${sweptN} 包（照标价付钱，货架空得快）：标价高过市价的 ${pc(flip)} 就没人扫` : '', ''],
        [0.3, racked && pct <= flip && !sweptN ? `倒爷会来扫货：标价高过市价的 ${pc(flip)} 就没人扫` : '', ''],
        [0.5, racked && mine.length >= 3 && !faint.length && low > pct + 0.05 ? `按现在的标价都会买，最低的一位也肯出 ${money(low * mkt)}` : '', ''],
        [0.1, !mine.length && !missed && shelf ? `${lately()}没有人专门来买${name}${(s.heat[id] || 1) < 1 ? '（滞销）' : ''}` : '', ''],
      ] as const).filter(([n, t]) => n && t).sort((a, b) => b[0] - a[0]).slice(0, 2);
      return html`<li @pointerenter=${() => point(id)} @pointerleave=${() => point(null)} @focusin=${() => point(id)} @focusout=${() => point(null)}>
          <div class="c-row"><b>${name}</b><span class="muted">${racked ? `货架 ${shelf} 包` : '没上架'}</span>
            <span class="c-n">${tally([['来买', mine.length + openers.filter(v => v.miss === id).length], ['买走', sold], ['嫌贵', dear.length + broke], ['没买到', missed], ['倒爷', swept.length]]) || '没人来'}</span></div>
          ${mine.length && racked ? priceRail(id, mine, flip) : ''}
          ${notes.length ? html`<p class="c-note">${notes.map(([, t], i) => html`${i ? '；' : ''}${t}`)}。${notes[0][2]}</p>` : ''}
        </li>`;
    })}</ul>${rows.length > FEW ? html`<button type="button" class="c-more" aria-expanded="${allSets}" @click=${() => { allSets = !allSets; customers(); }}>${allSets ? `只看前 ${FEW} 个` : `再看 ${rows.length - FEW} 个系列`}</button>` : ''}`;
}

// 缺货表: seekers ask for one rarity tier (G.SEEK), of one set or any, and leave empty-handed when neither the case nor the
// binder holds one. One row per set they asked for (plus 不挑系列), one cell per tier: who left with nothing in the window against
// the cards of that tier the shop holds now (the seeker's own test: game.ts visit). A cell with none is an empty pocket (缺); one
// with cards but walk-outs means they sell faster than they come in. The row ends with where that set's hits come from and the
// move that brings more: a set on a shelf is torn open at the counter and sold to you at the 收卡价 (the rail below); a set on
// no shelf reaches the shop only through your own packs, so 收卡价 cannot help it. Hovering a cell lights those cards (case.ts).
const TIER_MARK = ['RR', 'IR', 'SIR'], TIER = TIER_MARK.map(k => `${RAR[k].zh}档`);
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
  // one short line under the row: only what changes the supply of that set's hits
  let told = false; // 「提下面的收卡价」 once, on the first row that needs it
  const src = (id: string) => {
    if (!id) return '哪个系列的都行：卡本里这一档有就卖得掉';
    const set = G.setById(id), racked = racks.some(r => r.id === id), stock = s.stock[id] || 0;
    if (racked && !G.shelfQty(id)) { // sold out: nobody buys its packs, so nobody tears them open at the counter
      const fill = restock(id), up = stock > (G.lvl('clerk') && s.auto[id] ? G.CLERK_KEEP : 0);
      return html`<b>货架卖空了</b>：没人买这个系列的包，柜台上也就没人拆${up ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="999">补满</button>`
        : fill.n ? html`<button type="button" data-act="buy" data-id="${id}" data-n="${fill.n}" title="${fill.title}">${fill.text}</button>` : ''}`;
    }
    if (racked) {
      const sellers = rec.filter(v => v.offer && v.set === id), took = sellers.reduce((a, v) => a + (v.took || 0), 0), low = sellers.filter(v => v.sell === 'low').length;
      const hard = G.SEEK[2].reduce((a, k) => a + (set.rates[k] || 0), 0);
      return html`柜台上拆这个系列的卖给你 ${took} 张${low ? html` · <b>${low} 位嫌收得低</b>${told ? '' : (told = true, '，提下面的收卡价')}` : ''}${hard ? ` · ${TIER[2]}约 ${Math.round(100 / hard)} 包出一张` : ''}`;
    }
    const act = stock && free ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="${toShelf(id)}">${shelveLabel(id, false)}</button>`
      : swap?.id === id && (stock || G.lvl('clerk')) ? html`<button type="button" @click=${() => G.place(swap.i, id)}>换上货架</button>`
      : stock ? html`<button type="button" data-act="open10" data-id="${id}" ?disabled=${hold}>自己开 ${Math.min(10, stock)} 包</button>`
      : html`：<a href="#shelf">在货架上给它腾一个</a>`;
    return html`<b>没上货架</b>：柜台上没人拆，收卡价帮不上${act}`;
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
        </tr><tr class="g-src"><td colspan="4">${src(id)}</td></tr>`)}</tbody></table>
    ${rows.length > FEW ? html`<button type="button" class="c-more" aria-expanded="${allGaps}" @click=${() => { allGaps = !allGaps; customers(); }}>${allGaps ? `只看前 ${FEW} 个` : `再看 ${rows.length - FEW} 个`}</button>` : ''}`;
}
let allGaps = false;

// The singles side: one rail for the 单卡标价 (seekers' and collectors' ceilings: every card is priced as a share of its own market
// price, so one tag moves the case and the binder), a verdict on supply against demand, the 缺货表 of what seekers asked for,
// then the collectors and the price notes per tier; below, the counter sellers (GAMEPLAY §14) on the 收卡价 rail.
function showcase(rec: Visit[]) {
  const s = G.state, free = G.slots() - s.shown.length, mine = Object.entries(s.singles).filter(([, c]) => S.HITS.includes(c.kind));
  // a tier row only for its price notes now (who balked at what); who left empty-handed is the 缺货表's
  const rows = [...G.SEEK.map((kinds, tier) => ({ label: `找 ${rarNames(kinds)}`, vs: rec.filter(v => v.t === 'seeker' && v.tier === tier), fit: (c: { kind: string; price: number }) => kinds.includes(c.kind) })),
    { label: `收藏党（$${G.BIG_CARD} 以上）`, vs: rec.filter(v => v.t === 'collector'), fit: (c: { kind: string; price: number }) => c.price >= G.BIG_CARD }].filter(r => r.vs.length)
    // collectors left empty-handed while the binder holds a card they would take go first: its 上柜 is the cheapest fix on the page
    .map(r => ({ ...r, ready: r.label.startsWith('收藏') && count(r.vs, 'none') && mine.some(([, c]) => r.fit(c)) ? 1 : 0 })).sort((a, b) => b.ready - a.ready);
  const sellers = rec.filter(v => v.offer), counter = sellerNote(sellers);
  if (!rows.length) return counter;
  const all = rows.flatMap(r => r.vs), onHand = mine.reduce((a, [, c]) => a + c.count, 0), cards = s.shown.length + onHand;
  const pct = G.casePct(), would = all.filter(v => v.max! >= pct - 1e-9).length, none = count(all, 'none');
  const moves = G.caseMoves(), fill = moves && free > 0 ? html`<button type="button" data-act="fillcase">补满柜位（${moves} 张）</button>` : '';
  // supply against demand: who would buy at the tag against every hit the shop has, in the case and in the binder
  const verdict = !cards ? html`<b>柜里和卡本里都没有闪卡</b>：${none} 位空手走了。开包开出的、柜台上收来的闪卡（${RAR.RR.zh}以上）都进卡本`
    : would > 2 * cards ? html`按 ${pc(pct)} <b>${would} 位会买</b>，柜里加卡本只有 ${cards} 张：卡比人少，标价往上调也卖得完，收卡价提一档能多收些`
    : html`按 ${pc(pct)} ${would} 位会买，柜里加卡本 ${cards} 张`;
  return html`<p class="c-h">点是顾客最多肯出市价的几成：实的按现在的单卡标价会买。点轨上哪一档，展示柜和卡本的标价就改到哪一档</p>
    ${cards ? priceRail('', all, 0) : ''}
    <p class="c-note">${verdict}。${free > 0 ? `柜里空 ${free} 格${onHand ? '' : '，卡本里没有闪卡了'}` : `柜位满了（${G.slots()} 格）`}。${fill}</p>
    ${gaps(rec)}
    <ul class="c-case">${rows.map(({ label, vs, fit }) => {
      const big = label.startsWith('收藏'), none = big ? count(vs, 'none') : 0, dear = vs.filter(v => v.r === 'pricey' && v.why !== 'budget'), broke = count(vs, 'pricey', 'budget');
      const have = none && moves ? mine.filter(([, c]) => fit(c)).sort((a, b) => b[1].price - a[1].price)[0] : undefined;
      const byCard = [...new Set(dear.map(v => v.card!))].map(card => { const d = dear.filter(v => v.card === card); return html`<b>${card}</b> 标 ${money(d[0].pct! * d[0].price!)}，${d.length} 人嫌贵，最多肯出 ${spread(d.map(v => v.max! * v.price!))}`; });
      const took = vs.filter(v => v.r === 'sold').reduce((a, v) => a + (v.n || 1), 0);
      const notes = [
        none ? (have ? `柜里没有，卡本里有 ${have[1].name}（收藏党只看展示柜）` : `没有 $${G.BIG_CARD} 以上的卡，只能等开包开出、或柜台上收到大卡`) : '',
        ...byCard, broke ? `${broke} 人看中了但钱不够` : '',
      ].filter(Boolean);
      if (!big && !notes.length) return '';
      return html`<li><div class="c-row"><b>${label}</b><span class="c-n">${tally([['来了', vs.length], ['买走', count(vs, 'sold')], ['带走卡', took > count(vs, 'sold') ? took : 0], ['嫌贵', dear.length + broke], ['没找到', big ? none : 0]])}</span></div>
          ${notes.length ? html`<p class="c-note">${notes.map((n, i) => html`${i ? '；' : ''}${n}`)}。${have && free > 0 ? html`<button type="button" data-act="list" data-key="${have[0]}">上柜</button>` : have && moves ? html`<button type="button" data-act="fillcase">换上大卡（${moves} 张）</button>` : ''}</p>` : ''}</li>`;
    })}</ul>${counter}`;
}

// 来卖卡的: pack buyers who tore their packs open at the counter and had hits to offer. Their floors on the 收卡价 rail, what was
// bought and for how much, and the one thing that would change it (the binder full, the price under most floors).
function sellerNote(vs: Visit[]) {
  if (!vs.length) return '';
  const pct = G.buyPct(), got = vs.filter(v => v.took), n = got.reduce((a, v) => a + v.took!, 0), paid = got.reduce((a, v) => a + v.paid!, 0);
  const low = vs.filter(v => v.sell === 'low').length, full = vs.filter(v => v.sell === 'full').length, owe = vs.filter(v => v.sell === 'owe').length, cash = vs.filter(v => v.sell === 'cash').length;
  const up = vs.filter(v => v.sell === 'low' && v.floor! <= pct + G.PCT_STEP + 1e-9).length;
  const note = full && G.binderN() >= G.BINDER ? html`<b>卡本满了（${G.BINDER} 张）</b>，${full} 位没收成：大卡上柜、单卡标价降一档，或者卖一些给同行`
    : owe ? html`欠着九姐的账，${owe} 位的卡没收：账付了才收`
    : low > got.length ? html`按 ${pc(pct)} <b>${low} 位嫌你收得低</b>${up ? `，提到 ${pc(pct + G.PCT_STEP)} 能多收 ${up} 位` : ''}`
    : html`收来的卡按单卡标价 ${pc(G.casePct())} 卖，每张赚市价的 ${Math.round((G.casePct() - pct) * 100)} 个百分点${cash ? `；${cash} 位的卡没收全：九姐来收账前 ${G.BILL_KEEP / 60} 分钟，收银机的钱先留够那张账` : ''}`;
  return html`<div class="c-row c-sellers"><b>来卖卡的（拆包玩家当场拆）</b><span class="c-n">${tally([['来问', vs.length], ['卖给你', got.length], ['嫌收得低', low]])}</span></div>
    ${priceRail('buy', vs, 0)}
    <p class="c-note">${n ? `收了 ${n} 张闪卡，花 ${money(paid)}。` : ''}${note}。</p>`;
}

// Three targets, one window: the head on 货柜's view bar (count, bar, 没找到 split) stays over both views, and each view's sub-tab says
// how many of its own customers left empty-handed; the pack buyers sit under the shelf on 货架, the case browsers beside the case on 展示柜.
function customers() {
  const since = Date.now() - G.MISS_WINDOW * 1000, rec = G.state.recent.filter(v => v.at > since), n = rec.length; // the shelf wall's window
  const atCase = rec.filter(v => v.r === 'none' && (v.t === 'seeker' || v.t === 'collector')).length, none = count(rec, 'none');
  const tab = (el: HTMLElement, k: number, what: string) => { el.hidden = !k; render(html`${k}<span class="visually-hidden"> 位${what}</span>`, el); };
  tab($('n-packs'), none - atCase, '没买到整包'); tab($('n-case'), atCase, '在展示柜和卡本没找到');
  const quiet = html`<p class="muted">${G.state.cust.visits ? `${lately()}还没有顾客进门。` : '还没有顾客来过。先把货上架。'}</p>`;
  if (!n) { render(html`<span class="muted">顾客：${G.state.cust.visits ? `${lately()}还没有人进门` : '还没有人来过'}</span>`, $('cust-head')); render(html`<h2>顾客 · 来买整包的</h2>${quiet}`, $('customers')); render(html`<h2>顾客 · 单卡</h2>${quiet}`, $('case-cust')); return; }
  const [sold, pricey] = ['sold', 'pricey'].map(r => count(rec, r));
  render(html`<span class="c-meta">顾客 · ${lately()}来了 ${n} 位 · 每分钟约 ${(G.rate() * 60).toFixed(1)} 位</span>
      <span class="cust-bar" role="img" aria-label="${lately()} ${n} 位顾客：买走 ${sold}，嫌贵 ${pricey}，没找到 ${none}">
        <span class="c-sold" style="flex:${sold}"></span><span class="c-pricey" style="flex:${pricey}"></span><span class="c-none" style="flex:${none}"></span></span>
      <span class="cust-sum"><b>买走 ${sold}</b> · 嫌贵 ${pricey} · <span class="muted">没找到 ${none}${none ? `（整包 ${none - atCase} · 展示柜 ${atCase}）` : ''}</span></span>`, $('cust-head'));
  render(html`<h2>顾客 · 来买整包的</h2>${packs(rec) || html`<p class="muted">${lately()}没有人来买整包。</p>`}`, $('customers'));
  render(html`<h2>顾客 · 单卡</h2>${showcase(rec) || html`<p class="muted">${lately()}没有人来翻展示柜和卡本，也没有人来卖卡。</p>`}`, $('case-cust'));
}

function clerk() {
  if (!G.lvl('clerk')) return html`<p class="muted">店员（店铺升级里）每 ${G.CLERK_ROUND / 60} 分钟巡一次货架，自动进货补上，你不在线也照样补。</p>`;
  return html`<ul class="auto">${SETS.filter(s => G.unlocked(s.id)).map(s =>
    html`<li><label><input type="checkbox" data-act="auto" data-id="${s.id}" .checked=${!!G.state.auto[s.id]}> ${s.name}</label></li>`)}</ul>
      <p class="muted">勾选的系列：店员每 ${G.CLERK_ROUND / 60} 分钟进一次货补货架（钱不够就少买）；仓库里的货随时搬上架，留 ${G.CLERK_KEEP} 包给你拆。人多了货架一两分钟就卖空，把仓库进满，货架就不用空着等下一轮。</p>`;
}

function renderGoals() { // mid-reveal too: customers() leaves the binder's cards out while a pack is in hand (hold), the rest is the shop
  customers();
  render(html`<h2>店员 · 自动进货</h2>${clerk()}`, $('clerk'));
}

export function initGoals() {
  document.addEventListener('change', e => { const b = (e.target as Element).closest<HTMLInputElement>('[data-act="auto"]'); if (b) G.setAuto(b.dataset.id!, b.checked); });
  // dragging the rail only redraws this panel; letting go (change) commits: every panel re-renders and the save is written once
  const tag = (r: HTMLInputElement, commit: boolean) => (r.dataset.id === 'buy' ? G.setBuyPct(+r.value / 100, commit) : r.dataset.id ? G.setPrice(r.dataset.id, +r.value / 100, commit) : G.setCasePct(+r.value / 100, commit));
  document.addEventListener('input', e => { const r = e.target as HTMLInputElement; if (r.matches?.('.c-set')) { tag(r, false); renderGoals(); } });
  document.addEventListener('change', e => { const r = e.target as HTMLInputElement; if (r.matches?.('.c-set')) tag(r, true); });
  document.addEventListener('ptcg:release', renderGoals);
  G.on(renderGoals); renderGoals();
}
