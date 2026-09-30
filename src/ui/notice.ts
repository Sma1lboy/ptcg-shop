// The "while you were away" report after an absence (another tab, a locked screen, a closed page), laid out as a register receipt, and the weekly bill's
// receipt (below). Both print out of the shared slot (#pops, style.css) above any achievement labels.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, shelfFill, toShelf } from './common.ts';
import { guiding } from './guide.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';
import { bill, owed } from '../debt.ts';

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
// Two things a new player can't see from 开包: the first sale ever (「顾客在货架上买走了你的包」, the money in the top bar is that), and a
// shelf that sells out once the guide is over (its fix is a key right in the box: 上架 what the back room holds, or 进一架 and put it up).
// It waits out a pack reveal and the story; the guide's own 补货 step speaks for a sold-out shelf while the guide runs. ----------
type Memo = { kind: 'first'; n: number; gain: number; set: string } | { kind: 'out'; id: string };
// out: sets whose shelf sold out and haven't been restocked or waved off (先不管); the box says the first of them once nothing else is up
let memo: Memo | null = null, memoTimer = 0, soldBefore = G.state.cust.sold, stocked: Record<string, boolean> = {}, out = new Set<string>();
const racked = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id!))];
function watchShop() {
  const s = G.state;
  if (soldBefore === 0 && s.cust.sold > 0) { // this save's first sale (a reload after it starts above zero: never again)
    const v = s.recent.find(x => x.r === 'sold' && !!x.n && !x.card);
    memo = { kind: 'first', n: v?.n ?? 1, gain: v?.gain ?? 0, set: v?.set ? G.setById(v.set).name : '' };
    clearTimeout(memoTimer); memoTimer = window.setTimeout(() => { if (memo?.kind === 'first') { memo = null; watchShop(); } }, 9000);
  }
  soldBefore = s.cust.sold;
  const on = racked();
  for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; } // just sold out / restocked
  for (const id of out) if (!on.includes(id)) out.delete(id); // the shelf was given to another set
  if (memo?.kind !== 'first') { const id = guiding() ? undefined : [...out][0]; memo = id ? { kind: 'out', id } : null; }
  showMemo();
}
function showMemo() {
  const el = $('memo');
  if (!memo || hold || storyOpen()) { el.hidden = true; return; }
  el.hidden = false;
  const m = memo;
  if (m.kind === 'first') {
    render(keyed('first', html`<div class="mm-box"><h2>第一笔生意</h2><p>顾客在货架上买走了你的包${m.set ? `：${m.set} ${m.n} 包` : ''}${m.gain ? html`，<b class="gain">+${money(m.gain)}</b>` : ''}。</p>
      <p class="mm-say">货架上的包自己会卖，你在哪一页都一样；顶栏现金下面跳出来的 + 就是一笔卖出。</p></div>`), el);
    return;
  }
  const id = m.id, set = G.setById(id), stock = G.state.stock[id] || 0, fill = shelfFill(id), up = toShelf(id);
  const key = stock > 1 && up ? html`<button type="button" class="primary" data-act="shelve" data-id="${id}" data-n="${up}">上架 ${up} 包</button>`
    : fill.n > 1 ? html`<button type="button" class="primary" data-act="refill" data-id="${id}" data-n="${fill.n}" title="${fill.title}">进一架 ${fill.n} 并上架 ${money(fill.n * G.wholesale(id))}</button>`
    : html`<a class="mm-go" href="#shelf">去货柜看看</a>`;
  render(keyed(`out:${id}`, html`<div class="mm-box"><h2>${set.name}卖空了</h2><p>货架空着不进钱，来买${set.name}的顾客一半空手走。</p>
    <div class="mm-btns">${key}<button type="button" class="mm-x" aria-label="先不管" @click=${() => { out.delete(id); watchShop(); }}>先不管</button></div></div>`), el);
}
export function initMemo() {
  for (const id of racked()) stocked[id] = G.shelfQty(id) > 0;
  G.on(watchShop);
  document.addEventListener('ptcg:release', () => setTimeout(showMemo, 600));
  document.addEventListener('ptcg:story', () => setTimeout(showMemo, 400));
}
