// The "while you were away" report after an absence (another tab, a locked screen, a closed page), laid out as a register receipt, and the weekly bill's
// receipt (below). Both print out of the shared slot (#pops, style.css) above any achievement labels.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, refillQuote } from './common.ts';
import type { Quote } from './common.ts';
import { go } from './layout.ts';
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
// It says only EVENTS, never an action a page already has a key for (the shelf row's 进货, 展示柜's 补满柜位, 成长's 下一步, 卡册's 补到 N%, 开包's rail):
// a shelf that sold out (their fix is a key right in the box: 上架 what the back room holds, or 进一架 and put it up — every sold-out set at
// once when the cash covers them all; a set unlocked since the page opened while a shelf stands empty rides along as one extra line and key),
// a pack left half-flipped, a 找卡委托, and the one-time notes: the first sale, the first 收卡, the first card sales, the guide's end.
// It waits out the story, and a reveal while 开包 shows it; while the guide runs its own steps (进货, 补货) speak for the shelves.
// A box stays up while what it says still holds, and its key keeps the count and price it was printed with while the cash covers them:
// a box swapped for another between reading and clicking, or a key that read 40 and bought 46, did something else than what the
// player read. A sold-out shelf comes before every note; only a pack left mid-reveal on another page cuts in after it. ----------
type Note = { kind: 'first'; n: number; gain: number; set: string } | { kind: 'intake'; n: number; paid: number } | { kind: 'done' }
  | { kind: 'cards'; buyer: 'seeker' | 'collector'; card: string; n: number; gain: number } | { kind: 'comm'; key: string };
type Memo = Note | { kind: 'out'; ids: string[] } | { kind: 'hand' };
// out: sets whose shelf sold out and haven't been restocked or waved off (先不管); fresh: sets unlocked since the page opened, not yet
// on a shelf (said inside the sold-out box while one shelf stands empty); notes: 第一笔生意 / 第一次收卡 / 单卡成交 / 委托 / 引导走完了,
// each up until its 知道了 (a 9 s note went by unseen)
let memo: Memo | null = null, soldBefore = G.state.earned.sealed, tookBefore = G.state.intake?.n ?? 0, stocked: Record<string, boolean> = {}, out = new Set<string>(), fresh = new Set<string>();
const notes: Note[] = [];
let commNoted = ''; // the 找卡委托 the note was said for (its set|n|deadline), '' while nobody is asking
// who speaks for a sold-out shelf: the guide's own 补货 step, once it has got that far — except during a reveal, when the guide's bubble
// is put away and the shelf would stand empty unsaid until the last card (~a minute of walk-outs). On any earlier step (a player
// who never answered 定价 had empty shelves for four minutes, the box dropped the moment a reveal ended and the later notes took its
// place) the box speaks, and while the shelf stays empty it comes before every note
const shelfMine = () => hold || !guideShelf();
const racked = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id!))];
const unlocked = () => SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
const known = new Set(unlocked());
// a pack left mid-reveal while the player is on another page: the story, the labels, the new cards and an overdue bill's grace all wait for it (mat.ts hold)
const away = () => hold && document.documentElement.dataset.page !== 'open';
// Restock one empty set: the quote its key prints (common.ts refillQuote, shared with the shelf rows): move spare warehouse packs, or buy and
// shelve the quoted quantity (events.ts 'refill'). Cash may cover only part of the shelf; null when neither spare stock nor a purchase of at least 2 packs is available.
// alone: the box names this set only, so with a clerk it may stock the back room as well (deepFill); several sets share the cash a shelf each.
const fix = (id: string, alone = true) => { const q = refillQuote(id, alone); return q.ok ? q : null; };
// every sold-out set at once when each has a fix and the cash covers them together; else the first one alone
function outIds() {
  const all = [...out], fixes = all.map(x => fix(x, false)), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  return all.length > 1 && fixes.every(Boolean) && cost <= G.state.cash ? all : all.slice(0, 1);
}
function holds(m: Memo) {
  switch (m.kind) {
    case 'first': case 'intake': case 'done': case 'cards': case 'comm': return notes[0] === m;
    case 'hand': return away();
    // a set that sells out while the box is up joins it when the cash covers both (it stood unsaid for a minute behind the first)
    case 'out': return (away() || shelfMine()) && m.ids.every(i => out.has(i)) && outIds().length <= m.ids.length;
  }
}
function pick(): Memo | null {
  // away: a sold-out shelf first, then an unread 第一次收卡 (cash fell with only 「收卡 −$」 to say why), then the half-flipped pack
  if (away()) return out.size ? { kind: 'out', ids: outIds() } : notes[0]?.kind === 'intake' ? notes[0] : { kind: 'hand' };
  if (shelfMine() && out.size) return { kind: 'out', ids: outIds() };
  return notes[0] ?? null;
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
  // 找卡委托: one note per request, not while the guide speaks (the request is still on 展示柜, the note just waits for the guide to finish); it goes with the request, and once the player is
  // looking at 展示柜 (the panel says it all there). A second note when its card turns up in the binder (收卡, a pack): a reviewer's arrived and
  // went unnoticed until the request lapsed — that note delivers on the spot, on any page.
  const cm = s.comm, have = !!cm && (s.singles[G.commKey(cm)]?.count ?? 0) > 0, ck = cm ? `${cm.set}|${cm.n}|${cm.due}${have ? ':have' : ''}` : '';
  for (let i = notes.length - 1; i >= 0; i--) { const note = notes[i]; if (note.kind === 'comm' && (note.key !== ck || (!have && location.hash === '#case'))) notes.splice(i, 1); }
  if (!cm) commNoted = ''; else if (ck !== commNoted && !guiding()) { if (have || location.hash !== '#case') notes.push({ kind: 'comm', key: ck }); commNoted = ck; }
  const on = racked();
  for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; } // just sold out / restocked
  for (const id of out) if (!on.includes(id)) out.delete(id); // the shelf was given to another set
  for (const id of unlocked()) if (!known.has(id)) { known.add(id); if (!on.includes(id)) fresh.add(id); }
  for (const id of fresh) if (on.includes(id)) fresh.delete(id); // no free shelf means wait, not forget the unlocked set
  // cut in on the box up: a pack left mid-reveal (anything but a sold-out shelf); a sold-out shelf over a note (the note waits its turn
  // in `notes`: an unread 知道了 must not leave a shelf empty — an empty shelf costs money every minute)
  const cut = memo && (away() ? memo.kind !== 'out' && memo.kind !== 'intake' && (memo.kind !== 'hand' || out.size > 0 || notes[0]?.kind === 'intake') : memo.kind !== 'out' && memo.kind !== 'hand' && out.size > 0 && shelfMine());
  if (!(memo && holds(memo) && !cut)) memo = pick();
  showMemo();
}
function close() { const note = notes.shift(); memo = null; if (note?.kind === 'cards') G.ackCardSale(note.buyer); else watchShop(); }
// one 上架 / 补货并上架 key: the box's own yellow key, or the secondary key of the newly unlocked set
const fixKey = (id: string, f: Quote, primary: boolean, lead = '') =>
  html`<button type="button" class="${primary ? 'primary' : ''}" data-act="${f.act}" data-id="${id}" data-n="${f.n}" title="${f.title}">${lead}${f.text}</button>`;
function showMemo() {
  const el = $('memo'), was = el.hidden;
  // yields to a reveal where it plays, except a sold-out shelf: a corner box off the cards (desktop: over the rail's empty lower half;
  // phone: over the display case under the table's head), never over the pack or the cards being turned
  const hidden = !memo || (hold && document.documentElement.dataset.page === 'open' && memo.kind !== 'out') || storyOpen();
  if (hidden !== was) keepView(() => { el.hidden = hidden; document.dispatchEvent(new Event('ptcg:memo')); }); // guide yields to the box
  if (el.hidden) return;
  // Keep the quoted quantity while cash changes. A different set, restock method, unit price, or unaffordable quote
  // gets a new order; the current bill balance refreshes separately without moving the purchase button. A quote the till has
  // outgrown (today's would be at least twice the printed one) is printed again: 「进 3 包 $19」 stood while the cash went $79 → $1,873.
  const m = memo!, sets = m.kind === 'out' ? m.ids : [], fixes = sets.map(x => fix(x, sets.length === 1)), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
  // the newly unlocked set the box also names: only while a shelf stands free and there is something to put on it
  const add = m.kind === 'out' && G.shelves().some(r => !r.id) ? [...fresh].find(i => fix(i, false)) : undefined, addFix = add ? fix(add, false) : null;
  const quote = (id: string, f: Quote | null) => (f ? (f.act === 'shelve' ? 'u' : `b${G.wholesale(id)}`) : '-');
  const ident = m.kind === 'out' ? `out:${sets.join()}:${fixes.map((f, i) => quote(sets[i], f)).join(',')}${add ? `+${add}:${quote(add, addFix)}` : ''}`
    : m.kind === 'cards' ? `cards:${m.buyer}` : m.kind === 'comm' ? `comm:${m.key}` : m.kind;
  const was$ = +(el.dataset.cost || 0), outgrown = was$ > 0 && cost >= 2 * was$ + 1;
  if (!was && el.dataset.ident === ident && was$ <= G.state.cash && !outgrown) { refreshBill(el); return; } // keep quantities, refresh the bill balance
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
  if (m.kind === 'comm') {
    const c = G.state.comm; if (!c) return; // gone since it was queued: watchShop takes the note off the list next
    const here = m.key.endsWith(':have'), left = Math.max(1, Math.ceil(G.commLeft() / 60));
    render(keyed(ident, here ? html`<div class="mm-box"><h2>委托要的卡到了</h2>
      <p>卡本里有了 <b>${c.name}</b>，交给委托人 <b class="gain">${money(c.reward, 'exact')}</b>（市价 ${money(c.price, 'exact')}）· 还剩不到 ${left} 分钟</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${() => { close(); G.deliverCommission(); }}>交付 ${money(c.reward, 'exact')}</button><button type="button" @click=${close}>先留着</button></div></div>`
      : html`<div class="mm-box"><h2>有人来找卡</h2>
      <p><b>${c.name}</b> · 报酬 <b class="gain">${money(c.reward, 'exact')}</b> · 还剩不到 ${left} 分钟</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${() => { close(); go('case'); }}>去展示柜看看</button><button type="button" @click=${close}>知道了</button></div></div>`), el);
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
    render(keyed('done', html`<div class="mm-box"><h2>引导完成</h2>
      <p>${location.hash === '#luck' ? '这页把你开出的卡和模拟玩家比；' : ''}以后货架卖空，这里会出现补货按钮，有闲钱可升级时「成长」页签会亮。</p>
      <p class="mm-say">账单到期自动付款；现金不足有 ${G.GRACE / 60} 分钟宽限，之后额度够则借款，不够则破产。</p>${ok}</div>`), el);
    return;
  }
  if (m.kind === 'hand') {
    render(keyed('hand', html`<div class="mm-box"><h2>手里这包还没翻完</h2><p class="mm-why">开包台上那包翻完之前，剧情、成就和新进卡册的卡都等着它。</p>
      <div class="mm-btns"><button type="button" class="primary" @click=${() => go('open')}>回开包台翻完</button></div></div>`), el);
    return;
  }
  const ids = sets, id = ids[0], set = G.setById(id), f = fixes[0], names = ids.map(x => G.setById(x).name).join('、');
  el.dataset.cost = String(cost);
  const key = ids.length > 1 ? html`<button type="button" class="primary" data-act="refill" data-id="${ids.join(',')}" data-n="${fixes.map(f => f?.n ?? 0).join(',')}" title="${fixes.map((f, i) => `${G.setById(ids[i]).name}：${f?.title ?? '暂时无法补货'}`).join('；')}">按报价补货${cost ? ` ${money(cost, 'exact')}` : ''}</button>`
    : f ? fixKey(id, f, true) : html`<a class="mm-go" href="#shelf">去货柜看看</a>`;
  const x = () => { for (const i of ids) out.delete(i); if (add) fresh.delete(add); memo = null; watchShop(); };
  render(keyed(ident, html`<div class="mm-box"><h2>${names}卖空了</h2><p class="mm-why">货架空着不进钱，来买${ids.length > 1 ? '这几个系列' : set.name}的顾客一半空手走。</p><div class="mm-budget"></div>
    ${add && addFix ? html`<p class="mm-say">新到：${G.setById(add).name}，营收够了，还有一个空货架。</p>` : ''}
    <div class="mm-btns">${key}${add && addFix ? fixKey(add, addFix, false, `${G.setById(add).name} `) : ''}<button type="button" class="mm-x" aria-label="先不管" @click=${x}>先不管</button></div></div>`), el);
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
  addEventListener('hashchange', watchShop); // the 委托 note goes once the player is on 展示柜
}
