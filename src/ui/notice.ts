// The "while you were away" report after an absence (another tab, a locked screen, a closed page), laid out as a register receipt, and the weekly bill's
// receipt (below). Both print out of the shared slot (#pops, style.css) above any achievement labels.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, shelfFill, toShelf } from './common.ts';
import { growCount } from './upgrades.ts';
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
// up), and the first time the spare cash covers a level on 成长. It waits out a pack reveal and the story; while the guide runs its
// own steps (进货, 补货) speak for these. ----------
type Memo = { kind: 'first'; n: number; gain: number; set: string } | { kind: 'out' } | { kind: 'new'; id: string } | { kind: 'done' } | { kind: 'grow' };
// out: sets whose shelf sold out and haven't been restocked or waved off (先不管); fresh: sets unlocked since the page opened, not yet
// on a shelf, while one stands empty. Sold out comes first, then new, then 成长; grew: the 成长 note was said (or 成长 visited) — once
let memo: Memo | null = null, memoTimer = 0, soldBefore = G.state.cust.sold, stocked: Record<string, boolean> = {}, out = new Set<string>(), fresh = new Set<string>(), grew = false;
const racked = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id!))];
const unlocked = () => SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
const known = new Set(unlocked());
function watchShop() {
  const s = G.state;
  if (soldBefore === 0 && s.cust.sold > 0) { // this save's first sale (a reload after it starts above zero: never again)
    const v = s.recent.find(x => x.r === 'sold' && !!x.n && !x.card);
    brief({ kind: 'first', n: v?.n ?? 1, gain: v?.gain ?? 0, set: v?.set ? G.setById(v.set).name : '' });
  }
  soldBefore = s.cust.sold;
  const on = racked();
  for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; } // just sold out / restocked
  for (const id of out) if (!on.includes(id)) out.delete(id); // the shelf was given to another set
  for (const id of unlocked()) if (!known.has(id)) { known.add(id); if (!on.includes(id)) fresh.add(id); }
  const free = G.shelves().some(r => !r.id);
  for (const id of fresh) if (on.includes(id) || !free) fresh.delete(id); // put up, or no empty shelf left to put it on
  if (memo?.kind !== 'first' && memo?.kind !== 'done') {
    // 成长: nothing bought there yet and the badge has something yellow (levels the 闲钱 covers)
    const nu = [...fresh][0], grow = !grew && !s.bought?.length && growCount() > 0 && location.hash !== '#grow';
    memo = guiding() ? null : out.size ? { kind: 'out' } : nu ? { kind: 'new', id: nu } : grow ? { kind: 'grow' } : null;
  }
  showMemo();
}
// a brief note (the first sale, the guide's end): up for 9 s or until tapped, then back to whatever the shelves say
function brief(m: Memo) { memo = m; clearTimeout(memoTimer); memoTimer = window.setTimeout(close, 9000); }
function close() { clearTimeout(memoTimer); if (memo?.kind === 'first' || memo?.kind === 'done') memo = null; watchShop(); }
// what fixes one set's empty shelf: 上架 from the back room (more than the pack kept to open), else 进一架 bought and put up (events.ts
// 'refill' does the same per set); null when the cash doesn't cover a shelf's worth
function fix(id: string) {
  const up = toShelf(id); if ((G.state.stock[id] || 0) > 1 && up) return { cost: 0, up };
  const f = shelfFill(id); return f.n > 1 ? { cost: f.n * G.wholesale(id), up: 0 } : null;
}
function showMemo() {
  const el = $('memo'), was = el.hidden;
  el.hidden = !memo || hold || storyOpen();
  if (el.hidden !== was) document.dispatchEvent(new Event('ptcg:memo')); // guide.ts: on a phone the bubble yields to the box
  if (el.hidden) return;
  const m = memo!;
  if (m.kind === 'first') {
    render(keyed('first', html`<div class="mm-box" @click=${close}><h2>第一笔生意</h2><p>顾客在货架上买走了你的包${m.set ? `：${m.set} ${m.n} 包` : ''}${m.gain ? html`，<b class="gain">+${money(m.gain)}</b>` : ''}。</p>
      <p class="mm-say">货架上的包自己会卖，你在哪一页都一样；顶栏现金下面跳出来的 + 就是一笔卖出。</p></div>`), el);
    return;
  }
  if (m.kind === 'done') {
    render(keyed('done', html`<div class="mm-box" @click=${close}><h2>引导走完了</h2><p>往后自己经营：货架卖空时，这里会打出一张条子，上面就是补货的键。</p>
      <p class="mm-say">仓库里留的包随时去「开包」拆；钱够升级时这里也会说；每周九姐按顶栏的倒计时来收账。</p></div>`), el);
    return;
  }
  if (m.kind === 'grow') {
    const toGrow = () => { grew = true; go('grow'); requestAnimationFrame(() => $('grow-top').scrollIntoView({ block: 'start' })); watchShop(); };
    render(keyed('grow', html`<div class="mm-box"><h2>钱够升级了</h2><p>闲钱 <b>${money(G.spare())}</b>（现金留出下一张账单以后的钱）够买「成长」页上 ${growCount()} 项。「下一步」那一格就是眼下最该升的一项。</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${toGrow}>去「成长」看看</button><button type="button" class="mm-x" @click=${() => { grew = true; watchShop(); }}>先不管</button></div></div>`), el);
    return;
  }
  // every sold-out set at once when each has a fix and the cash covers them together; else the first one alone
  const all = m.kind === 'out' ? [...out] : [m.id], fixes = all.map(fix), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  const ids = all.length > 1 && fixes.every(Boolean) && cost <= G.state.cash ? all : all.slice(0, 1);
  const id = ids[0], set = G.setById(id), f = fixes[0], names = ids.map(x => G.setById(x).name).join('、');
  const key = ids.length > 1 ? html`<button type="button" class="primary" data-act="refill" data-id="${ids.join(',')}">都补上${cost ? ` ${money(cost)}` : ''}</button>`
    : f?.up ? html`<button type="button" class="primary" data-act="shelve" data-id="${id}" data-n="${f.up}">上架 ${f.up} 包</button>`
    : f ? html`<button type="button" class="primary" data-act="refill" data-id="${id}" title="${shelfFill(id).title}">进一架 ${shelfFill(id).n} 并上架 ${money(f.cost)}</button>`
    : html`<a class="mm-go" href="#shelf">去货柜看看</a>`;
  const x = () => { for (const i of ids) (m.kind === 'out' ? out : fresh).delete(i); watchShop(); };
  const head = m.kind === 'out' ? html`<h2>${names}卖空了</h2><p class="mm-why">货架空着不进钱，来买${ids.length > 1 ? '这几个系列' : set.name}的顾客一半空手走。</p>`
    : html`<h2>新到：${set.name}</h2><p class="mm-why">营收够了，${set.name}可以进货了；店里还有一个空货架，摆上去就多一个系列在卖。</p>`;
  render(keyed(`${m.kind}:${ids.join()}`, html`<div class="mm-box">${head}
    <div class="mm-btns">${key}<button type="button" class="mm-x" aria-label="先不管" @click=${x}>先不管</button></div></div>`), el);
}
export function initMemo() {
  for (const id of racked()) { stocked[id] = G.shelfQty(id) > 0; if (!stocked[id]) out.add(id); } // a page opened on empty shelves: said like a sell-out just now
  G.on(watchShop); watchShop();
  document.addEventListener('ptcg:release', () => setTimeout(showMemo, 600));
  document.addEventListener('ptcg:story', () => { if (storyOpen()) showMemo(); else setTimeout(showMemo, 400); }); // under the dialog at once; back 400 ms after it
  document.addEventListener('ptcg:guidedone', () => { brief({ kind: 'done' }); showMemo(); });
  addEventListener('hashchange', () => { if (location.hash === '#grow') grew = true; watchShop(); }); // 成长 found on its own: the note has nothing to add
}
