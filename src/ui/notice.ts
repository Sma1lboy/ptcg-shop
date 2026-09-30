// The "while you were away" report after an absence (another tab, a locked screen, a closed page), laid out as a register receipt, and the weekly bill's
// receipt (below). Both print out of the shared slot (#pops, style.css) above any achievement labels.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, shelfFill, toShelf } from './common.ts';
import { nextStep, growCount } from './upgrades.ts';
import { go } from './layout.ts';
import { guiding } from './guide.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';
import { bill, owed } from '../debt.ts';
import { SETS } from '../sets.ts';

// On a phone the receipt first shows only its tear-off stub (style.css): one line under the top bar with the hours and the net,
// so it doesn't cover or push down what the player came back to press; tapping the stub prints the whole receipt.
let unrolled = false, ro: ResizeObserver | null = null;

// o.sales counts paying visits, not packs: a scalper who clears a shelf is one 成交
export function renderNotice() {
  const o = G.state.offline, el = $('notice');
  // phones reserve the receipt's height above the page (style.css --notice-h): the stub, or the whole receipt once unrolled
  ro ||= new ResizeObserver(() => document.documentElement.style.setProperty('--notice-h', `${el.offsetHeight}px`));
  ro.observe(el);
  if (!o) { el.hidden = true; unrolled = false; return; }
  const h = o.secs >= 3600 ? `${(o.secs / 3600).toFixed(1)} 小时` : `${Math.round(o.secs / 60)} 分钟`;
  el.hidden = false;
  el.classList.toggle('unrolled', unrolled);
  const net = o.revenue - (o.bills || 0), due = G.state.overdue, short = due ? Math.max(0, due.amount - G.state.cash) : 0;
  // a bill that fell due while away and is still unpaid: its grace only starts now (game.ts), the red chip counts it; 去凑钱 = the chip
  render(html`<button type="button" class="stub" aria-label="展开离店小票" @click=${() => { unrolled = true; renderNotice(); }}>
      <b>离店小票</b><span>离开 ${h}</span><span class="${net >= 0 ? 'gain' : 'loss'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></button>
    <div class="paper"><h2>离店小票</h2>
      <dl><dt>离开</dt><dd>${h}</dd><dt>成交</dt><dd>${o.sales} 位顾客</dd><dt>入账</dt><dd class="gain">+${money(o.revenue)}</dd>
        ${o.lost ? html`<dt>货架空了，错过</dt><dd>${o.lost} 位顾客</dd>` : ''}
        ${o.bills ? html`<dt>九姐来收账</dt><dd>−${money(o.bills)}</dd>` : ''}${o.borrowed ? html`<dt>钱不够，记成借款</dt><dd>${money(o.borrowed)}</dd>` : ''}
        ${due ? html`<dt>第 ${due.week} 周的账还没付</dt><dd>${money(due.amount)}</dd>${short ? html`<dt>还差</dt><dd>${money(short)}</dd>` : ''}` : ''}</dl>
      ${due ? html`<p class="due-note">不在店里时宽限不走，从现在接着算（离开时才到期的给满 ${G.GRACE / 60} 分钟），看顶栏的红牌子。</p>` : ''}
      <div class="nt-btns">${due && short ? html`<button type="button" @click=${() => $('due').click()}>去凑钱</button>` : ''}<button type="button" data-act="ack">收起小票</button></div></div>`, el);
}

// ---------- 收据: a bill the till covered (every week after the first, ui/story.ts decides) prints a small receipt out of the
// same slot — 九姐 doesn't come in for it. It waits out a pack reveal and the story, like the achievement label; a bill paid
// while the shop was closed is already on the closing receipt, so it prints nothing. Tap it, or it goes after 6 s. ----------
export interface Slip { week: number; amount: number; borrowed: number; note: string }
let slip: Slip | null = null, shown: Slip | null = null, slipTimer = 0, offBills = G.state.offline?.bills ?? 0;

export function printSlip(s: Slip) {
  const ob = G.state.offline?.bills ?? 0, dup = ob > offBills; offBills = ob;
  if (dup) return;
  slip = s; showSlip();
}
function showSlip() {
  const el = $('slip');
  if (!slip || hold || storyOpen()) return;
  const s = slip, next = bill(G), left = owed(G); slip = null; shown = s;
  el.hidden = false;
  render(keyed(`${s.week}`, html`<div class="paper"><h2>收据 · 第 ${s.week} 周</h2>
    <dl><dt>付给九姐</dt><dd class="loss">−${money(s.amount)}</dd>
      ${s.borrowed ? html`<dt>其中借来的</dt><dd>${money(s.borrowed)}</dd>` : ''}
      ${left ? html`<dt>还欠</dt><dd>${money(left)}</dd>` : ''}
      ${next ? html`<dt>下一张 · 第 ${next.week} 周</dt><dd>${money(next.amount)}</dd>` : ''}</dl>
    <p class="note">${s.note}</p></div>`), el);
  document.dispatchEvent(new Event('ptcg:slip')); // sound.ts: the calculator, then the till
  clearTimeout(slipTimer); slipTimer = window.setTimeout(hideSlip, 6000);
}
function hideSlip() { clearTimeout(slipTimer); shown = null; $('slip').hidden = true; }

export function initSlip() {
  $('slip').addEventListener('click', hideSlip);
  document.addEventListener('ptcg:release', () => setTimeout(showSlip, 600)); // after the pack's summary, with the story's beats
  document.addEventListener('ptcg:story', () => { if (!storyOpen()) setTimeout(showSlip, 400); else if (shown) { slip = shown; hideSlip(); } }); // under the dialog: print it again after
}

// ---------- 店里的话 (#memo, DESIGN.md「店里的话」): a BW message box printed out of the same slot, on whatever page the player is on.
// Things a new player can't see from 开包: the first sale ever (「顾客在货架上买走了你的包」, the money in the top bar is that), shelves
// that sell out once the guide is over (their fix is a key right in the box: 上架 what the back room holds, or 进一架 and put it up —
// every sold-out set at once when the cash covers them all), a set just unlocked while a shelf stands empty (the same key puts it
// up), 成长's 下一步 once the 闲钱 covers it, and a pack left half-flipped. It waits out the story, and a reveal while 开包 shows it;
// while the guide runs its own steps (进货, 补货) speak for the shelves.
// A box stays up while what it says still holds, and its key keeps the count and price it was printed with while the cash covers them:
// a box swapped for another between reading and clicking (新到 → another set's 进一架), or a key that read 40 and bought 46, did
// something else than what the player read. Only a pack left mid-reveal on another page cuts in (after a sold-out shelf). ----------
type Note = { kind: 'first'; n: number; gain: number; set: string } | { kind: 'intake'; n: number; paid: number } | { kind: 'done' };
type Memo = Note | { kind: 'out'; ids: string[] } | { kind: 'new'; id: string } | { kind: 'grow'; k: string } | { kind: 'hand' };
// out: sets whose shelf sold out and haven't been restocked or waved off (先不管); fresh: sets unlocked since the page opened, not yet
// on a shelf, while one stands empty; notes: 第一笔生意 / 第一次收卡 / 引导走完了, each up until its 知道了 (a 9 s note went by unseen);
// grew: the 下一步 (k + level) already said, or seen on 成长
let memo: Memo | null = null, soldBefore = G.state.cust.sold, tookBefore = G.state.intake?.n ?? 0, stocked: Record<string, boolean> = {}, out = new Set<string>(), fresh = new Set<string>(), grew = '';
const notes: Note[] = [];
// who speaks for a sold-out shelf: the guide's 补货 step while the guide runs — except during a reveal, when the guide's bubble is put
// away and the shelf would stand empty unsaid until the last card (~a minute of walk-outs)
const shelfMine = () => hold || !guiding();
// the 下一步 the box names, once per item: when the 闲钱 covers it, or covers something else on 成长 while it waits (cash piled up
// with 「3 项买得起」 on the tab and nothing said, because the 下一步 itself was still out of reach)
const growKey = () => { const g = nextStep(); return g && !G.canBranch() && (g.cost <= G.spare() || growCount() > 0) ? `${g.k}:${g.lv}` : ''; };
const racked = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id!))];
const unlocked = () => SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
const known = new Set(unlocked());
// a pack left mid-reveal while the player is on another page: the story, the labels, the new cards and an overdue bill's grace all wait for it (mat.ts hold)
const away = () => hold && document.documentElement.dataset.page !== 'open';
// what fixes one set's empty shelf: 上架 from the back room (more than the pack kept to open), else 进一架 bought and put up (events.ts
// 'refill' does the same per set); null when the cash doesn't cover a shelf's worth
function fix(id: string) {
  const up = toShelf(id); if ((G.state.stock[id] || 0) > 1 && up) return { cost: 0, up, n: 0 };
  const f = shelfFill(id); return f.n > 1 ? { cost: f.n * G.wholesale(id), up: 0, n: f.n } : null;
}
// every sold-out set at once when each has a fix and the cash covers them together; else the first one alone
function outIds() {
  const all = [...out], fixes = all.map(fix), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  return all.length > 1 && fixes.every(Boolean) && cost <= G.state.cash ? all : all.slice(0, 1);
}
function holds(m: Memo) {
  switch (m.kind) {
    case 'first': case 'intake': case 'done': return notes[0] === m;
    case 'hand': return away();
    // a set that sells out while the box is up joins it when the cash covers both (it stood unsaid for a minute behind the first)
    case 'out': return (away() || shelfMine()) && m.ids.every(i => out.has(i)) && outIds().length <= m.ids.length;
    case 'new': return !guiding() && !away() && fresh.has(m.id);
    case 'grow': return !guiding() && !away() && location.hash !== '#grow' && m.k !== grew && m.k === growKey();
  }
}
function pick(): Memo | null {
  // away: a sold-out shelf first, then an unread 第一次收卡 (cash fell with only 「收卡 −$」 to say why), then the half-flipped pack
  if (away()) return out.size ? { kind: 'out', ids: outIds() } : notes[0]?.kind === 'intake' ? notes[0] : { kind: 'hand' };
  if (shelfMine() && out.size) return { kind: 'out', ids: outIds() };
  if (notes.length) return notes[0];
  if (guiding()) return null;
  const nu = [...fresh][0], k = location.hash === '#grow' ? '' : growKey();
  return nu ? { kind: 'new', id: nu } : k && k !== grew ? { kind: 'grow', k } : null;
}
function watchShop() {
  const s = G.state;
  if (soldBefore === 0 && s.cust.sold > 0) { // this save's first sale (a reload after it starts above zero: never again)
    const v = s.recent.find(x => x.r === 'sold' && !!x.n && !x.card);
    notes.push({ kind: 'first', n: v?.n ?? 1, gain: v?.gain ?? 0, set: v?.set ? G.setById(v.set).name : '' });
  }
  soldBefore = s.cust.sold;
  // the first time a pack buyer sells the hits they tore open back to the shop (收卡): cash goes down with nobody pressing anything
  if (!tookBefore && s.intake?.n) notes.push({ kind: 'intake', n: s.intake.n, paid: s.intake.cost });
  tookBefore = s.intake?.n ?? 0;
  const on = racked();
  for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; } // just sold out / restocked
  for (const id of out) if (!on.includes(id)) out.delete(id); // the shelf was given to another set
  for (const id of unlocked()) if (!known.has(id)) { known.add(id); if (!on.includes(id)) fresh.add(id); }
  const free = G.shelves().some(r => !r.id);
  for (const id of fresh) if (on.includes(id) || !free) fresh.delete(id); // put up, or no empty shelf left to put it on
  // cut in on the box up: a pack left mid-reveal (anything but a sold-out shelf); a sold-out shelf over a note (the note waits its turn
  // in `notes`: an unread 知道了 must not leave a shelf empty) or over 钱够升级 (an empty shelf costs money every minute, an upgrade can wait)
  const cut = memo && (away() ? memo.kind !== 'out' && memo.kind !== 'intake' && (memo.kind !== 'hand' || out.size > 0 || notes[0]?.kind === 'intake') : (memo.kind === 'first' || memo.kind === 'intake' || memo.kind === 'done' || memo.kind === 'grow') && out.size > 0 && shelfMine());
  memo = memo && holds(memo) && !cut ? memo : pick();
  showMemo();
}
function close() { notes.shift(); memo = null; watchShop(); }
function showMemo() {
  const el = $('memo'), was = el.hidden;
  // yields to a reveal where it plays, except a sold-out shelf: a corner box off the cards (desktop: over the rail's empty lower half;
  // phone: over the display case under the table's head), never over the pack or the cards being turned
  el.hidden = !memo || (hold && document.documentElement.dataset.page === 'open' && memo.kind !== 'out') || storyOpen();
  if (el.hidden !== was) document.dispatchEvent(new Event('ptcg:memo')); // guide.ts: on a phone the bubble yields to the box
  if (el.hidden) return;
  // the box's identity: which note, and for a shelf note how each set gets fixed (上架 / 进一架 / neither) and whether that leaves the
  // next bill short — a count or a price that moved with the cash keeps its printed value, but a key that would now do something else
  // (the back room ran out) or a bill line that stopped being true is printed again
  const m = memo!, sets = m.kind === 'out' ? m.ids : m.kind === 'new' ? [m.id] : [], fixes = sets.map(fix), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  const b = G.nextBill(), short = !!(cost && b && G.state.cash - cost < b.amount);
  const ident = sets.length ? `${m.kind}:${sets.join()}:${fixes.map(f => (f ? (f.up ? 'u' : 'b') : '-')).join('')}${short ? ':$' : ''}` : m.kind === 'grow' ? `grow:${m.k}` : m.kind;
  if (!was && el.dataset.ident === ident && +(el.dataset.cost || 0) <= G.state.cash) return; // the same box keeps its words (above)
  el.dataset.ident = ident; el.dataset.cost = '0';
  const ok = html`<div class="mm-btns"><button type="button" class="primary" @click=${close}>知道了</button></div>`; // a note's key: on a phone the guide's bubble waits while the box is up
  if (m.kind === 'first') {
    render(keyed('first', html`<div class="mm-box"><h2>第一笔生意</h2><p>顾客在货架上买走了你的包${m.set ? `：${m.set} ${m.n} 包` : ''}${m.gain ? html`，<b class="gain">+${money(m.gain)}</b>` : ''}。</p>
      <p class="mm-say">货架上的包自己会卖，你在哪一页都一样；顶栏现金下面跳出来的 + 就是一笔卖出。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'intake') { // money going out that nobody pressed for: 收卡 is the shop's second trade, and where the case's cards come from
    // counted as of now, not when the note was queued: the readout under the cash had already shown a bigger 收卡 −$ than it said
    const b = G.state.intake ?? { n: m.n, cost: m.paid };
    render(keyed('intake', html`<div class="mm-box"><h2>第一次收卡</h2><p>买包的顾客在柜台拆了包，把开出的闪卡按你的收卡价卖给了你：到现在收了 ${b.n} 张，<b class="loss">−${money(b.cost)}</b>。</p>
      <p class="mm-say">现金少了，卡进了单卡库存；挂进「货柜」的展示柜，来找卡的顾客会按展示柜的标价买走。收卡价在货柜「顾客」里调，调低就少收。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'done') {
    // the guide ends on 欧气 (its last step): say what that page is, it had no word of its own
    render(keyed('done', html`<div class="mm-box"><h2>引导走完了</h2>${location.hash === '#luck' ? html`<p>这一页是欧气：你开出的包值多少，在几千个开同样包的模拟玩家里排第几，下面的卡册按系列收着你开到的卡。</p>` : ''}<p>往后自己经营：货架卖空时，这里会打出一张条子，上面就是补货的键。</p>
      <p class="mm-say">仓库里留的包随时去「开包」拆；钱够升级时这里也会说。每周九姐按顶栏的倒计时来收账：到点现金够就自动付，不够有 ${G.GRACE / 60} 分钟宽限凑钱，再不够记成借款。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'hand') {
    render(keyed('hand', html`<div class="mm-box"><h2>手里这包还没翻完</h2><p class="mm-why">开包台上那包翻完之前，剧情、成就和新进卡册的卡都等着它。</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${() => go('open')}>回开包台翻完</button></div></div>`), el);
    return;
  }
  if (m.kind === 'grow') {
    const g = nextStep()!, spare = G.spare(), now = g.cost <= spare;
    // 成长's 下一步 just under the sticky top bar (scrollIntoView put it under the bar, the key cut off). Going there doesn't count as
    // told: a player pulled away before 升级 (a 新到 box landing in the same seconds) heard nothing more for six minutes; the box is
    // down while 成长 shows and comes back when they leave without buying — only 先不管 or buying the level ends it
    const toGrow = () => { go('grow'); requestAnimationFrame(() => { const bar = document.querySelector('.top')?.getBoundingClientRect().bottom ?? 0; scrollBy({ top: $('grow-top').getBoundingClientRect().top - bar - 12 }); }); watchShop(); };
    render(keyed(`grow:${m.k}`, html`<div class="mm-box"><h2>钱够升级了</h2>${now
      ? html`<p>下一步是<b>${g.name} Lv ${g.lv + 1}</b>（${g.fx[0]} → ${g.fx[1]}），${money(g.cost)}；闲钱 <b>${money(spare)}</b>，账单的钱已经留出来了。</p>`
      : html`<p>闲钱 <b>${money(spare)}</b> 够买「成长」页上 ${growCount()} 项；「下一步」<b>${g.name} Lv ${g.lv + 1}</b> 还差 ${money(g.cost - spare)}。账单的钱已经留出来了。</p>`}
      <div class="mm-btns"><button type="button" class="primary" @click=${toGrow}>${now ? '去「成长」升级' : '去「成长」看看'}</button><button type="button" class="mm-x" @click=${() => { grew = m.k; watchShop(); }}>先不管</button></div></div>`), el);
    return;
  }
  const ids = sets, id = ids[0], set = G.setById(id), f = fixes[0], names = ids.map(x => G.setById(x).name).join('、');
  el.dataset.cost = String(cost);
  const key = ids.length > 1 ? html`<button type="button" class="primary" data-act="refill" data-id="${ids.join(',')}">都补上${cost ? ` ${money(cost)}` : ''}</button>`
    : f?.up ? html`<button type="button" class="primary" data-act="shelve" data-id="${id}" data-n="${f.up}">上架 ${f.up} 包</button>`
    : f ? html`<button type="button" class="primary" data-act="refill" data-id="${id}" data-n="${f.n}" title="${shelfFill(id).title}">进一架 ${f.n} 并上架 ${money(f.cost)}</button>`
    : html`<a class="mm-go" href="#shelf">去货柜看看</a>`;
  // the key spends into the bill's money: said on the box (the 成长 note keeps it, this one used to take the till down to $3). No
  // amount left over in it: the words stay while the cash moves (above)
  const bill = short && b ? html`<p class="mm-say">补完以后第 ${b.week} 周的账（${money(b.amount)}，还有约 ${Math.max(1, Math.floor(G.dueIn() / 60))} 分钟）暂时不够；货架上的包几分钟就卖回来。</p>` : '';
  const x = () => { for (const i of ids) (m.kind === 'out' ? out : fresh).delete(i); memo = null; watchShop(); };
  const head = m.kind === 'out' ? html`<h2>${names}卖空了</h2><p class="mm-why">货架空着不进钱，来买${ids.length > 1 ? '这几个系列' : set.name}的顾客一半空手走。</p>`
    : html`<h2>新到：${set.name}</h2><p class="mm-why">营收够了，${set.name}可以进货了；店里还有一个空货架，摆上去就多一个系列在卖。</p>`;
  render(keyed(ident, html`<div class="mm-box">${head}${bill}
    <div class="mm-btns">${key}<button type="button" class="mm-x" aria-label="先不管" @click=${x}>先不管</button></div></div>`), el);
}
export function initMemo() {
  for (const id of racked()) { stocked[id] = G.shelfQty(id) > 0; if (!stocked[id]) out.add(id); } // a page opened on empty shelves: said like a sell-out just now
  G.on(watchShop); watchShop();
  // the page makes room for the box instead of reflowing around it (style.css --memo-h): the phone's view tabs sat under it, and the
  // desktop's rows under it can scroll clear of it
  const el = $('memo'); new ResizeObserver(() => document.documentElement.style.setProperty('--memo-h', `${el.offsetHeight}px`)).observe(el);
  document.addEventListener('ptcg:release', () => setTimeout(watchShop, 600)); // the reveal is over: the box it held back, and no more 「还没翻完」
  document.addEventListener('ptcg:story', () => { if (storyOpen()) showMemo(); else setTimeout(showMemo, 400); }); // under the dialog at once; back 400 ms after it
  document.addEventListener('ptcg:guidedone', () => { notes.push({ kind: 'done' }); watchShop(); });
  // a look at 成长 doesn't count as told: a glance before the guide ended (nothing bought) silenced 「钱够升级了」 for good while the cash
  // piled up to $2k. While 成长 shows, the box stays down (holds / pick); leaving without buying, it may still say the 下一步 once
  addEventListener('hashchange', watchShop);
}
