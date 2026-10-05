// The "while you were away" report after an absence (another tab, a locked screen, a closed page), laid out as a register receipt, and the weekly bill's
// receipt (below). Both print out of the shared slot (#pops, style.css) above any achievement labels.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, shelfFill, deepFill, toShelf } from './common.ts';
import { nextStep, growCount } from './upgrades.ts';
import { go, currentPage } from './layout.ts';
import { guiding, guideShelf } from './guide.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';
import { bill, owed } from '../debt.ts';
import { SETS } from '../sets.ts';
import { HITS } from '../sim.ts';

// A collector needs a case card, not just any missing seeker tier. Offer the least valuable eligible card from the binder; the 收藏室 is never touched.
function collectorCard() {
  if (hold || G.state.shown.length >= G.slots() || G.state.shown.some(c => c.price >= G.BIG_CARD)) return null;
  return Object.entries(G.state.singles).filter(([, c]) => c.count > 0 && HITS.includes(c.kind) && c.price >= G.BIG_CARD)
    .sort((a, b) => a[1].price - b[1].price)[0] ?? null;
}
function caseAction() {
  const pick = collectorCard();
  return pick ? html`<button type="button" class="primary" data-act="list" data-key="${pick[0]}">上柜：${pick[1].name}</button>`
    : html`<button type="button" @click=${() => go('case')}>去看卡本和展示柜</button>`;
}

// On a phone the receipt first shows only its tear-off stub (style.css): one line under the top bar with the hours and the net,
// so it doesn't cover or push down what the player came back to press; tapping the stub prints the whole receipt.
let unrolled = false, ro: ResizeObserver | null = null;

// Keep compact-layout controls steady when paper changes the space before them.
// On the opening page only anchor the rail once reached; never pull the first-screen table down with a memo.
function keepView(update: () => void) {
  const y = scrollY, mode = document.documentElement.dataset.page, compact = innerWidth < 780 || (innerWidth > innerHeight && innerHeight <= 520);
  let anchor: HTMLElement | null = null;
  if (compact && y > 0) {
    if (mode === 'open') {
      const rail = $('rail'), bottom = innerWidth < 780 ? document.querySelector('.nav')?.getBoundingClientRect().top ?? innerHeight : innerHeight;
      if (rail.getBoundingClientRect().top < bottom) anchor = rail;
    } else anchor = document.querySelector<HTMLElement>('.page:not([hidden])');
  }
  const top = anchor?.getBoundingClientRect().top;
  update();
  if (anchor && anchor.getClientRects().length && document.documentElement.dataset.page === mode && scrollY === y)
    scrollBy({ top: anchor.getBoundingClientRect().top - top!, behavior: 'instant' });
}

// Budget follows the immutable printed quote, not a newly calculated order with more packs.
function refreshBill(el: HTMLElement) {
  const slot = el.querySelector<HTMLElement>('.mm-budget'); if (!slot) return;
  const cost = +(el.dataset.cost || 0), b = G.nextBill(), short = b ? Math.max(0, b.amount - (G.state.cash - cost)) : 0;
  render(cost && b ? html`<p class="mm-say"><span>第 ${b.week} 周账 ${money(b.amount)} · 约 ${Math.max(1, Math.floor(G.dueIn() / 60))} 分钟后到期</span>
    <span>${short ? `补货后还差 ${money(short)} 付账` : '补货后账款已留够'}</span></p>` : '', slot);
}

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
  const d = o.detail, net = d?.cash ?? o.revenue, due = G.state.overdue, short = due ? Math.max(0, due.amount - G.state.cash) : 0;
  const empty = G.shelves().find(r => !r.id || !r.qty), pick = collectorCard();
  // a bill that fell due while away and is still unpaid: its grace only starts now (game.ts), the red chip counts it; 去凑钱 = the chip
  render(html`<button type="button" class="stub" aria-label="展开离店小票" @click=${() => { unrolled = true; renderNotice(); }}>
      <b>离店小票</b><span>离线经营 ${h}</span><span class="${net >= 0 ? 'gain' : 'loss'}">${d ? '现金' : '销售'} ${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></button>
    <div class="paper"><h2>离店小票</h2>
      <dl><dt>离线经营</dt><dd>${h}</dd><dt>商品成交</dt><dd>${o.sales} 位顾客</dd><dt>商品销售额</dt><dd class="gain">+${money(o.revenue)}</dd>
        ${o.tickets ? html`<dt>收藏室门票</dt><dd class="gain">+${money(o.tickets)}</dd>` : ''}
        ${o.bonus ? html`<dt>离线销售奖励</dt><dd class="gain">+${money(o.bonus)}</dd>` : ''}
        ${o.lost ? html`<dt>没找到要买的包或卡</dt><dd>${o.lost} 位顾客</dd>` : ''}
        ${o.bills ? html`<dt>九姐来收账</dt><dd>−${money(o.bills)}</dd>` : ''}${o.borrowed ? html`<dt>钱不够，记成借款</dt><dd>${money(o.borrowed)}</dd>` : ''}
        ${due ? html`<dt>第 ${due.week} 周的账还没付</dt><dd>${money(due.amount)}</dd>${short ? html`<dt>还差</dt><dd>${money(short)}</dd>` : ''}` : ''}</dl>
      ${d ? html`<details><summary>看收入和缺货明细</summary><dl>
        ${([['买包的和倒爷', d.packs], ['找卡的', d.seeker], ['收藏党', d.collector]] as const).map(([name, part]) => html`
          <dt>${name}成交</dt><dd>${part.sales} 位 · ${money(part.revenue)}</dd>
          ${part.lost ? html`<dt>${name}没找到</dt><dd>${part.lost} 位</dd>` : ''}`)}
        ${d.intake ? html`<dt>柜台收卡</dt><dd>−${money(d.intake)}</dd>` : ''}
        ${d.restock ? html`<dt>店员进货</dt><dd>−${money(d.restock)}</dd>` : ''}
        ${d.bulk ? html`<dt>店员卖散卡</dt><dd>+${money(d.bulk)}</dd>` : ''}
        <dt>营业现金变化</dt><dd class="${net >= 0 ? 'gain' : 'loss'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</dd>
      </dl><p class="note">含收卡、补货、还账、门票和离线奖励；不含成就奖金及回店后的操作。倒爷也可能买走柜里的卡。</p></details>` : html`<p class="note">这张旧小票只有合计，没有按顾客分类；销售额不等于现金增加。</p>`}
      ${due ? html`<p class="due-note">不在店里时宽限不走，从现在接着算（离开时才到期的给满 ${G.GRACE / 60} 分钟），看顶栏的红牌子。</p>` : ''}
      ${!due ? html`<p class="note">${empty ? '现在有空货架，先去补货上架。' : pick ? `卡本里有收藏党会看的大卡，先把${pick[1].name}摆进展示柜。` : '货架还在卖。卡本里的闪卡会自动卖给找卡的；去看看单卡生意和缺货表。'}</p>` : ''}
      <div class="nt-btns">${due ? html`<button type="button" class="primary" @click=${() => $('due').click()}>${short ? '去凑钱' : '去看账单'}</button>`
        : empty ? html`<button type="button" class="primary" @click=${() => {
          G.ackOffline(); go('shelf');
          $('shelf').querySelector<HTMLElement>(empty.id ? `.set[data-spot="set:${empty.id}"]` : '.set:not(.locked)')?.scrollIntoView({ block: 'center' });
        }}>去补货</button>` : caseAction()}
        <button type="button" data-act="ack">收起小票</button></div></div>`, el);
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
type Note = { kind: 'first'; n: number; gain: number; set: string } | { kind: 'intake'; n: number; paid: number } | { kind: 'done' }
  | { kind: 'cards'; buyer: 'seeker' | 'collector'; card: string; n: number; gain: number };
type Memo = Note | { kind: 'out'; ids: string[] } | { kind: 'new'; id: string } | { kind: 'grow'; k: string } | { kind: 'hand' } | { kind: 'case'; key: string } | { kind: 'kept'; id: string }
  | { kind: 'dex'; id: string; need: number; cost: number; bonus: number; at: number };
// out: sets whose shelf sold out and haven't been restocked or waved off (先不管); fresh: sets unlocked since the page opened, not yet
// on a shelf, while one stands empty; notes: 第一笔生意 / 第一次收卡 / 引导走完了, each up until its 知道了 (a 9 s note went by unseen);
// grew: the 下一步 (k + level) already said, or seen on 成长
let memo: Memo | null = null, soldBefore = G.state.earned.sealed, tookBefore = G.state.intake?.n ?? 0, stocked: Record<string, boolean> = {}, out = new Set<string>(), fresh = new Set<string>(), grew = '';
const notes: Note[] = [];
let caseDismissed = false, keptDismissed = false;
const dexDismissed = new Set<string>(); // set:tier waved off with 先不补, for this page session
// 图鉴补卡 as a next step: the cheapest next 图鉴 tier of any unlocked set that 补卡 alone reaches (the missing hits, cheapest first, at
// market) within the 闲钱 and within a tenth of the next upgrade (a side purchase: it must not push 成长's 下一步 back). A real permanent
// unlock (that set's walk-ins), not a repeat purchase; the first-hour player never found it on the 欧气 page. Waits for the guide, a
// reveal and 成长 (which says its own 下一步); scripts/autoplay.mjs mirrors it.
function dexOffer() {
  if (guiding() || hold || location.hash === '#grow') return null;
  const cap = 0.1 * (nextStep()?.cost ?? Infinity);
  let best: { id: string; need: number; cost: number; bonus: number; at: number } | null = null;
  for (const s of SETS) {
    if (!G.unlocked(s.id) || G.master(s.id)) continue;
    const tot = G.dexTotal(s.id), have = G.dexCount(s.id), tier = G.DEX_TIERS.find(([at]) => have / tot < at - 1e-9);
    if (!tier || dexDismissed.has(`${s.id}:${tier[0]}`)) continue;
    const need = Math.ceil(tier[0] * tot - 1e-9) - have, miss = G.missing(s.id);
    if (need <= 0 || miss.length < need) continue;
    const cost = miss.slice(0, need).reduce((a, c) => a + c.price, 0);
    if (cost <= G.spare() && cost <= cap && (!best || cost < best.cost)) best = { id: s.id, need, cost, bonus: tier[1], at: tier[0] };
  }
  return best;
}
// toShelf keeps one pack for the player. Invite only off the opening table, never over a reveal/result or available growth.
const keptAvailable = (id: string) => G.state.stock[id] === 1 && G.unlocked(id) && !G.master(id);
function keptAllowed() {
  const page = currentPage();
  return !keptDismissed && !hold && !guiding() && page !== 'open' && (page !== 'grow' || growCount() === 0) && G.shelves().some(s => s.id && s.qty > 0);
}
function keptPack(): string | null {
  if (!keptAllowed()) return null;
  let id: string | null = null, share = Infinity;
  for (const s of SETS) if (keptAvailable(s.id)) {
    const p = G.dexCount(s.id) / G.dexTotal(s.id);
    if (p < share) { id = s.id; share = p; }
  }
  return id;
}
// who speaks for a sold-out shelf: the guide's own 补货 step, once it has got that far — except during a reveal, when the guide's bubble
// is put away and the shelf would stand empty unsaid until the last card (~a minute of walk-outs). On any earlier step (a player
// who never answered 定价 had empty shelves for four minutes, the box dropped the moment a reveal ended and the later notes took its
// place) the box speaks, and while the shelf stays empty it comes before every note
const shelfMine = () => hold || !guideShelf();
// the 下一步 the box names, once per item: when the 闲钱 covers it, or covers something else on 成长 while it waits (cash piled up
// with 「3 项买得起」 on the tab and nothing said, because the 下一步 itself was still out of reach)
const growKey = () => { const g = nextStep(); return g && !G.canBranch() && (g.cost <= G.spare() || growCount() > 0) ? `${g.k}:${g.lv}` : ''; };
const racked = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id!))];
const unlocked = () => SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
const known = new Set(unlocked());
// a pack left mid-reveal while the player is on another page: the story, the labels, the new cards and an overdue bill's grace all wait for it (mat.ts hold)
const away = () => hold && document.documentElement.dataset.page !== 'open';
// Restock one empty set: move spare warehouse packs, or buy and shelve the quoted quantity (events.ts 'refill').
// Cash may cover only part of the shelf; no quote when neither spare stock nor a purchase of at least 2 packs is available.
// alone: the box names this set only, so with a clerk it may stock the back room as well (deepFill); several sets share the cash a shelf each.
function fix(id: string, alone = true) {
  const up = toShelf(id); if ((G.state.stock[id] || 0) > 1 && up) return { cost: 0, up, n: 0, text: `上架 ${up} 包`, title: `从仓库上架 ${up} 包，不另进货` };
  const f = alone ? deepFill(id) : shelfFill(id); return f.n > 1 ? { ...f, cost: f.n * G.wholesale(id), up: 0 } : null;
}
// every sold-out set at once when each has a fix and the cash covers them together; else the first one alone
function outIds() {
  const all = [...out], fixes = all.map(x => fix(x, false)), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  return all.length > 1 && fixes.every(Boolean) && cost <= G.state.cash ? all : all.slice(0, 1);
}
function holds(m: Memo) {
  switch (m.kind) {
    case 'first': case 'intake': case 'done': case 'cards': return notes[0] === m;
    case 'hand': return away();
    // a set that sells out while the box is up joins it when the cash covers both (it stood unsaid for a minute behind the first)
    case 'out': return (away() || shelfMine()) && m.ids.every(i => out.has(i)) && outIds().length <= m.ids.length;
    case 'new': return !guiding() && !away() && fresh.has(m.id) && G.shelves().some(r => !r.id);
    case 'grow': return !guiding() && !away() && location.hash !== '#grow' && m.k !== grew && m.k === growKey();
    case 'case': return !guiding() && !hold && !caseDismissed && !!collectorCard() && !!G.state.singles[m.key]?.count;
    case 'kept': return keptAllowed() && keptAvailable(m.id);
    case 'dex': { const o = dexOffer(); return !!o && o.id === m.id && o.need === m.need; }
  }
}
function pick(): Memo | null {
  // away: a sold-out shelf first, then an unread 第一次收卡 (cash fell with only 「收卡 −$」 to say why), then the half-flipped pack
  if (away()) return out.size ? { kind: 'out', ids: outIds() } : notes[0]?.kind === 'intake' ? notes[0] : { kind: 'hand' };
  if (shelfMine() && out.size) return { kind: 'out', ids: outIds() };
  if (notes.length) return notes[0];
  if (guiding()) return null;
  const nu = G.shelves().some(r => !r.id) ? [...fresh][0] : undefined, k = location.hash === '#grow' ? '' : growKey(), c = !caseDismissed && collectorCard();
  if (nu) return { kind: 'new', id: nu };
  if (c) return { kind: 'case', key: c[0] };
  if (k && k !== grew) return { kind: 'grow', k };
  const o = dexOffer(); if (o) return { kind: 'dex', ...o };
  const id = keptPack(); return id ? { kind: 'kept', id } : null;
}
function watchShop() {
  const s = G.state;
  if (soldBefore === 0 && s.earned.sealed > 0) {
    const v = s.recent.find(x => x.r === 'sold' && !!x.n && !x.card);
    if (v) notes.push({ kind: 'first', n: v.n!, gain: v.gain ?? 0, set: v.set ? G.setById(v.set).name : '' });
  }
  soldBefore = s.earned.sealed;
  // the first time a pack buyer sells the hits they tore open back to the shop (收卡): cash goes down with nobody pressing anything
  if (!tookBefore && s.intake?.n) notes.push({ kind: 'intake', n: s.intake.n, paid: s.intake.cost });
  tookBefore = s.intake?.n ?? 0;
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    if (note.kind === 'cards' && !s.cardFirst?.[note.buyer]) notes.splice(i, 1);
  }
  for (const buyer of ['seeker', 'collector'] as const) {
    const v = s.cardFirst?.[buyer];
    if (v?.card && !notes.some(n => n.kind === 'cards' && n.buyer === buyer))
      notes.push({ kind: 'cards', buyer, card: v.card, n: v.n ?? 1, gain: v.gain ?? 0 });
  }
  const on = racked();
  for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; } // just sold out / restocked
  for (const id of out) if (!on.includes(id)) out.delete(id); // the shelf was given to another set
  for (const id of unlocked()) if (!known.has(id)) { known.add(id); if (!on.includes(id)) fresh.add(id); }
  for (const id of fresh) if (on.includes(id)) fresh.delete(id); // no free shelf means wait, not forget the unlocked set
  // cut in on the box up: a pack left mid-reveal (anything but a sold-out shelf); a sold-out shelf over a note (the note waits its turn
  // in `notes`: an unread 知道了 must not leave a shelf empty) or over 钱够升级 (an empty shelf costs money every minute, an upgrade can wait)
  const cut = memo && (away() ? memo.kind !== 'out' && memo.kind !== 'intake' && (memo.kind !== 'hand' || out.size > 0 || notes[0]?.kind === 'intake') : (memo.kind === 'first' || memo.kind === 'intake' || memo.kind === 'done' || memo.kind === 'grow' || memo.kind === 'cards' || memo.kind === 'case' || memo.kind === 'dex') && out.size > 0 && shelfMine());
  const receiptReady = notes.length > 0 && (memo?.kind === 'grow' || memo?.kind === 'case' || memo?.kind === 'dex');
  const keep = memo && holds(memo) && !cut && !receiptReady;
  const next = !keep || memo?.kind === 'kept' ? pick() : null;
  memo = keep && (memo!.kind !== 'kept' || next?.kind === 'kept') ? memo : next;
  showMemo();
}
function close() { const note = notes.shift(); memo = null; if (note?.kind === 'cards') G.ackCardSale(note.buyer); else watchShop(); }
function showMemo() {
  const el = $('memo'), was = el.hidden;
  // yields to a reveal where it plays, except a sold-out shelf: a corner box off the cards (desktop: over the rail's empty lower half;
  // phone: over the display case under the table's head), never over the pack or the cards being turned
  const hidden = !memo || (hold && document.documentElement.dataset.page === 'open' && memo.kind !== 'out') || storyOpen();
  if (hidden !== was) keepView(() => { el.hidden = hidden; document.dispatchEvent(new Event('ptcg:memo')); }); // guide yields to the box
  if (el.hidden) return;
  // Keep the quoted quantity while cash changes. A different set, restock method, unit price, or unaffordable quote
  // gets a new order; the current bill balance refreshes separately without moving the purchase button.
  const m = memo!, sets = m.kind === 'out' ? m.ids : m.kind === 'new' ? [m.id] : [], fixes = sets.map(x => fix(x, sets.length === 1)), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  const ident = sets.length ? `${m.kind}:${sets.join()}:${fixes.map((f, i) => (f ? (f.up ? 'u' : `b${G.wholesale(sets[i])}`) : '-')).join(',')}`
    : m.kind === 'grow' ? `grow:${m.k}` : m.kind === 'case' ? `case:${m.key}` : m.kind === 'cards' ? `cards:${m.buyer}` : m.kind === 'kept' ? `kept:${m.id}` : m.kind === 'dex' ? `dex:${m.id}:${m.need}` : m.kind;
  if (!was && el.dataset.ident === ident && +(el.dataset.cost || 0) <= G.state.cash) { refreshBill(el); return; } // keep quantities, refresh the bill balance
  el.dataset.ident = ident; el.dataset.cost = '0';
  const ok = html`<div class="mm-btns"><button type="button" class="primary" @click=${close}>${m.kind === 'done' ? '开始经营' : '关闭'}</button></div>`;
  if (m.kind === 'first') {
    render(keyed('first', html`<div class="mm-box"><h2>第一笔生意</h2><p>顾客在货架上买走了你的包${m.set ? `：${m.set} ${m.n} 包` : ''}${m.gain ? html`，<b class="gain">+${money(m.gain)}</b>` : ''}。</p>
      <p class="mm-say">顾客会自动购买货架上的包，切到其他页面也会继续经营；顶栏现金下方会显示收入来源。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'cards') {
    render(keyed(ident, html`<div class="mm-box"><h2>${m.buyer === 'collector' ? '展示柜开张了' : '找卡的买走了闪卡'}</h2>
      <p>${m.buyer === 'collector' ? '收藏党从展示柜买走' : '找卡的从卡本或展示柜买走'}${m.card}${m.n > 1 ? `等 ${m.n} 张卡` : ''}，<b class="gain">+${money(m.gain)}</b>。</p>
      <p class="mm-say">这是卖卡收入，不是卖包；卡本和展示柜都在货柜的单卡页。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'kept') {
    render(keyed(ident, html`<div class="mm-box"><h2>仓库留的这包还没开</h2>
      <p>${G.setById(m.id).name}还留着 1 包。想收图鉴，可以从这包开始。</p>
      <p class="mm-say">只拆已经进货的包，不会另买；也可以留着上架卖。</p>
      <div class="mm-btns"><button type="button" class="primary" data-act="open1" data-id="${m.id}">去开这 1 包</button>
        <button type="button" @click=${() => { keptDismissed = true; memo = null; watchShop(); }}>先不拆</button></div></div>`), el);
    return;
  }
  if (m.kind === 'case') {
    const c = G.state.singles[m.key];
    render(keyed(ident, html`<div class="mm-box"><h2>给收藏党摆一张大卡</h2>
      <p>卡本里的${c.name}市价 ${money(c.price)}，够收藏党看的 $${G.BIG_CARD} 门槛。展示柜还没有大卡，摆进去后按单卡标价等顾客挑。</p>
      <div class="mm-btns"><button type="button" class="primary" data-act="list" data-key="${m.key}">上柜：${c.name}</button>
        <button type="button" @click=${() => { caseDismissed = true; watchShop(); }}>先不摆</button></div></div>`), el);
    return;
  }
  if (m.kind === 'dex') {
    const set = G.setById(m.id), pct = Math.round(m.at * 100);
    const fill = () => { G.collect(m.id, m.need); memo = null; watchShop(); };
    render(keyed(ident, html`<div class="mm-box"><h2>图鉴补到 ${pct}%</h2>
      <p>${set.name}图鉴收录 ${G.dexCount(m.id)}/${G.dexTotal(m.id)}。按市价从同行补 ${m.need} 张缺的闪卡，收录到 ${pct}%，这个系列带来的回头客 <b>+${Math.round(m.bonus * 100)}%</b>，一直有效。</p>
      <p class="mm-say">补来的卡只进图鉴，不能卖、不能上柜。花的是留好账款后的闲钱。</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${fill}>补 ${m.need} 张 ${money(m.cost, 'exact')}</button>
        <button type="button" class="mm-x" @click=${() => { dexDismissed.add(`${m.id}:${m.at}`); memo = null; watchShop(); }}>先不补</button></div></div>`), el);
    return;
  }
  if (m.kind === 'intake') { // money going out that nobody pressed for: 收卡 is the shop's second trade, and where the case's cards come from
    // counted as of now, not when the note was queued: the readout under the cash had already shown a bigger 收卡 −$ than it said
    const b = G.state.intake ?? { n: m.n, cost: m.paid };
    render(keyed('intake', html`<div class="mm-box"><h2>第一次收卡</h2><p>买包的顾客在柜台拆了包，把开出的闪卡按你的收卡价卖给了你：到现在收了 ${b.n} 张，<b class="loss">−${money(b.cost)}</b>。</p>
      <p class="mm-say">收购的卡已放进卡本。找卡的顾客能直接购买匹配的卡；收藏党只买展示柜里的大卡。收卡价可在「货柜」调整，调低后愿意卖卡给你的顾客会减少。</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${() => { close(); go('case'); }}>去看收到的卡</button><button type="button" @click=${close}>先不去</button></div></div>`), el);
    return;
  }
  if (m.kind === 'done') {
    // the guide ends on 欧气 (its last step): say what that page is, it had no word of its own
    render(keyed('done', html`<div class="mm-box"><h2>引导完成</h2>${location.hash === '#luck' ? html`<p>这里比较累计开包的卡牌总值与模拟玩家的结果；下方卡册记录你收录的卡。</p>` : ''}<p>以后货架卖空，这里会出现补货按钮；有闲钱可升级时也会提醒。</p>
      <p class="mm-say">仓库里的包可以去「开包」页拆。账单到期自动付款；现金不足有 ${G.GRACE / 60} 分钟宽限，之后额度够则借款，不够则破产。倒计时和金额在顶栏账单里。</p>${ok}</div>`), el);
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
      ? html`<p>可升级<b>${g.name} Lv ${g.lv + 1}</b>（${g.fx[0]} → ${g.fx[1]}），花费 ${money(g.cost)}。留好账款和自动还款后，还能花 <b>${money(spare)}</b>。</p>`
      : html`<p>留好账款和自动还款后，还能花 <b>${money(spare)}</b>，够买「成长」页上 ${growCount()} 项。推荐的<b>${g.name} Lv ${g.lv + 1}</b> 还差 ${money(g.cost - spare)}。</p>`}
      ${g.k === 'case' && G.state.shown.length < G.slots() ? html`<p class="mm-say">展示柜现在还空着 ${G.slots() - G.state.shown.length} 格${G.caseMoves() ? '：卡本里的闪卡可以先在货柜的展示柜页按「补满柜位」摆上去，不花钱' : '，扩柜等柜子摆满了再买也不迟'}。</p>` : ''}
      <div class="mm-btns"><button type="button" class="primary" @click=${toGrow}>${now ? '去「成长」升级' : '去「成长」看看'}</button><button type="button" class="mm-x" @click=${() => { grew = m.k; watchShop(); }}>先不管</button></div></div>`), el);
    return;
  }
  const ids = sets, id = ids[0], set = G.setById(id), f = fixes[0], names = ids.map(x => G.setById(x).name).join('、');
  el.dataset.cost = String(cost);
  const key = ids.length > 1 ? html`<button type="button" class="primary" data-act="refill" data-id="${ids.join(',')}" data-n="${fixes.map(f => f?.n ?? 0).join(',')}" title="${fixes.map((f, i) => `${G.setById(ids[i]).name}：${f?.title ?? '暂时无法补货'}`).join('；')}">按报价补货${cost ? ` ${money(cost, 'exact')}` : ''}</button>`
    : f?.up ? html`<button type="button" class="primary" data-act="shelve" data-id="${id}" data-n="${f.up}" title="${f.title}">${f.text}</button>`
    : f ? html`<button type="button" class="primary" data-act="refill" data-id="${id}" data-n="${f.n}" title="${f.title}">${f.text}并上架 ${money(f.cost, 'exact')}</button>`
    : html`<a class="mm-go" href="#shelf">去货柜看看</a>`;
  const x = () => { for (const i of ids) (m.kind === 'out' ? out : fresh).delete(i); memo = null; watchShop(); };
  const head = m.kind === 'out' ? html`<h2>${names}卖空了</h2><p class="mm-why">货架空着不进钱，来买${ids.length > 1 ? '这几个系列' : set.name}的顾客一半空手走。</p>`
    : html`<h2>新到：${set.name}</h2><p class="mm-why">营收够了，${set.name}可以进货了；店里还有一个空货架，摆上去就多一个系列在卖。</p>`;
  render(keyed(ident, html`<div class="mm-box">${head}<div class="mm-budget"></div>
    <div class="mm-btns">${key}<button type="button" class="mm-x" aria-label="先不管" @click=${x}>先不管</button></div></div>`), el);
  refreshBill(el);
}
export function initMemo() {
  for (const id of racked()) { stocked[id] = G.shelfQty(id) > 0; if (!stocked[id]) out.add(id); } // a page opened on empty shelves: said like a sell-out just now
  G.on(watchShop); watchShop();
  // the page makes room for the box instead of reflowing around it (style.css --memo-h): the phone's view tabs sat under it, and the
  // desktop's rows under it can scroll clear of it
  const el = $('memo'); new ResizeObserver(() => keepView(() => document.documentElement.style.setProperty('--memo-h', `${el.offsetHeight}px`))).observe(el);
  document.addEventListener('ptcg:release', () => setTimeout(watchShop, 600)); // the reveal is over: the box it held back, and no more 「还没翻完」
  document.addEventListener('ptcg:story', () => { if (storyOpen()) showMemo(); else setTimeout(showMemo, 400); }); // under the dialog at once; back 400 ms after it
  document.addEventListener('ptcg:guidedone', () => { notes.push({ kind: 'done' }); watchShop(); });
  // a look at 成长 doesn't count as told: a glance before the guide ended (nothing bought) silenced 「钱够升级了」 for good while the cash
  // piled up to $2k. While 成长 shows, the box stays down (holds / pick); leaving without buying, it may still say the 下一步 once
  addEventListener('hashchange', watchShop);
}
