// 债务 on screen (rules and numbers: GAMEPLAY.md, game.ts). Three pieces:
// - the due chip in the top bar (#due): which week, when 九姐 comes, how much; louder in the last 5 minutes, when cash falls
//   short of the bill, or while a bill is overdue. It ticks every second on its own, since a quiet second emits nothing.
// - 账本 (#ledger, top of 成长): what is still owed (installments / loan), the next bill and the ones after it, the credit line,
//   and the three actions: pay an overdue bill, borrow (two clicks: the first shows what it grows to), repay.
// - 凑钱 (#raise): while a bill is overdue, a sheet under the chip with every way to cover it in the grace — what each brings, what it
//   costs, one button each (below renderRaise).
// - 破产结算 (#wreck): a <dialog> listing what 九姐 took and what stayed, open until acknowledged.
import { html, render, nothing } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';
import { sellPlan } from '../debt.ts';
import { refundBtn } from './upgrades.ts';

const clock = (s: number) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const pct = (r: number) => `${Math.round(r * 100)}%`;
const weeks = (n: number) => { const m = n * G.WEEK / 60; return n >= 99 ? '很多周' : `${n} 周（开着店 ${m >= 60 ? `${(m / 60).toFixed(1)} 小时` : `${m} 分钟`}）`; };

// Borrowing takes two clicks within 4 s on the same amount: the first one only shows what the loan becomes.
let armed = { n: 0, at: 0 };
export function loanClick(n: number) {
  if (armed.n === n && Date.now() - armed.at < 4000) { armed = { n: 0, at: 0 }; G.takeLoan(n); return; }
  armed = { n, at: Date.now() }; renderLedger(); setTimeout(renderLedger, 4100); // renderLedger redraws the 凑钱 sheet too
}
const isArmed = (n: number) => armed.n === n && Date.now() - armed.at < 4000;

export function renderDue() {
  const el = $('due'), s = G.state, o = s.overdue, b = G.nextBill();
  if (!o && !b) { el.hidden = true; return; }
  el.hidden = false;
  const left = o ? o.until - s.shopT : G.dueIn(), hot = !!o || left < 300 || (b != null && s.cash < b.amount);
  el.className = `due${o ? ' late' : hot ? ' hot' : ''}`;
  el.title = o ? `第 ${o.week} 周的账逾期，宽限 ${clock(left)}` : `第 ${b!.week} 周的账 ${money(b!.amount)}，${clock(left)} 后九姐来收`;
  render(o ? html`<span class="k">逾期</span><b>${clock(left)}</b><small>差 ${money(Math.max(0, o.amount - s.cash))}</small>`
    : html`<span class="k">第 ${b!.week} 周</span><b>${clock(left)}</b><small>${money(b!.amount)}</small>`, el);
}

// 退回: this week's upgrades and skills, back at G.REFUND of the price while the till is short of the bill (G.refundable).
function backs() {
  const r = G.refundable(); if (!r.length) return nothing;
  const name = (k: string) => (G.UPGRADES[k] || G.SKILLS[k]).name, lv = (k: string) => k in G.UPGRADES ? G.lvl(k) : G.skill(k);
  return html`<div class="lg-back"><p>这周买的升级可以退（扣一成，不像借款会滚利息）：</p>${r.map(x => refundBtn(x.k, name(x.k), lv(x.k), x.cost, false))}</div>`;
}

export function renderLedger() {
  const s = G.state, o = s.overdue, b = G.nextBill(), d0 = G.debt0(), r = G.loanRate(), credit = G.credit(), broke = s.branch.broke || 0;
  const head = html`<h2>账本 <small>欠九姐的 · 第 ${s.branch.n + 1} 家店（${G.street().name}） · 第 ${s.week} 周${broke ? ` · 破产 ${broke} 次` : ''}</small></h2>`;
  if (!s.debt && !o) {
    render(html`${head}<div class="lg-free"><p><b>债还清了。</b>这家店是你的了，不再有账单。</p>
      <p>下面「开分店」能带走名气；九姐在${G.street(s.branch.n + 1).name}出下一家店的本钱（${money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * (s.branch.n + 1))))}）。</p></div>`, $('ledger'));
    return;
  }
  // what 顺手还 would take at the bill if the till stayed as it is now (game.ts payDown: only cash above the float)
  const take = b ? Math.max(0, Math.min(b.loanPay, s.cash - b.amount - G.loanFloat())) : 0;
  const paid = Math.max(0, Math.min(1, 1 - s.owe / d0)), short = o ? Math.max(0, o.amount - s.cash) : 0;
  const upcoming = Array.from({ length: 4 }, (_, i) => s.week + 1 + i).map(w => [w, G.installment(w)] as const).filter(([, v]) => v > 0);
  // what a loan of n grows to if left alone for 3 weeks (the number the confirm click shows)
  const grown = (n: number) => money(n * (1 + r) ** 3);
  const loanBtn = (n: number, label: string, primary = false) => html`<button type="button" class=${primary ? 'primary' : ''} data-act="loan" data-n=${n} ?disabled=${n <= 0 || n > credit}>
    ${isArmed(n) ? `再点一次：借 ${money(n)}，3 周不还是 ${grown(n)}` : label}</button>`;
  // repaying keeps back the next bill and $1,000 of stock money, so the button never empties the till
  const billLoan = b ? Math.min(credit, Math.ceil(b.amount)) : 0, repayable = Math.floor(Math.min(Math.max(0, s.cash - (b?.amount || 0) - 1000), s.loan > 0 ? s.loan : s.debt));
  render(html`${head}
    <div class="lg">
      <div class="lg-owe">
        <p class="lg-k">还欠</p><p class="lg-big">${money(s.debt)}</p>
        <dl><div><dt>开店欠款（分期，不计息）</dt><dd>${money(s.owe)} <small>/ ${money(d0)}</small></dd></div>
          <div><dt>借款（每周利滚利 ${pct(r)}）</dt><dd class=${s.loan > 0 ? 'lg-loan' : ''}>${money(s.loan)}</dd></div></dl>
        <span class="gh-bar" role="img" aria-label="开店欠款已还 ${pct(paid)}"><i style="--p:${paid}"></i></span>
        ${s.loan > 0 ? html`<p class="lg-note">借款每周付完账顺手还：九姐收回 1/${Math.round(1 / G.LOAN_PAY)}（最少 ${money(G.LOAN_MIN * (1 + G.DEBT_STEP * s.branch.n))}），只拿收银机里 ${money(G.loanFloat())} 以上的钱（补满货架的进货钱加下周的分期），不够就少收，不算逾期。照这样约 <b>${weeks(G.loanWeeks())}</b>还清。</p>` : ''}
      </div>
      <div class="lg-bill">
        ${o ? html`<p class="lg-k lg-late">第 ${o.week} 周的账逾期</p><p class="lg-big">${money(o.amount)}</p>
            <p>宽限还剩 <b>${clock(o.until - s.shopT)}</b>。${short ? html`手上 ${money(s.cash)}，还差 <b>${money(short)}</b>。` : '钱够了，付掉吧。'}</p>
            <div class="lg-act">${short ? html`<button type="button" class="primary" @click=${openRaise}>去凑钱</button>` : html`<button type="button" class="primary" data-act="paybill">付账 ${money(o.amount)}</button>`}</div>${backs()}`
        : b ? html`<p class="lg-k">第 ${b.week} 周的账 · ${clock(G.dueIn())} 后来收</p><p class="lg-big">${money(b.amount)}</p>
            <p>${s.cash >= b.amount ? html`手上 ${money(s.cash)}，到时自动付${take ? `，再顺手还借款 ${money(take)}` : ''}。` : html`手上 ${money(s.cash)}，<b>还差 ${money(b.amount - s.cash)}</b>。到时付不上有 ${G.GRACE / 60} 分钟宽限。`}</p>${backs()}
            ${upcoming.length ? html`<ol class="lg-next">${upcoming.map(([w, v]) => html`<li><span>第 ${w} 周</span><b>${money(v)}</b></li>`)}</ol>
              <p class="lg-note">每周 ×${G.BILL_G}，付到欠款为零为止。</p>` : ''}` : ''}
      </div>
      <div class="lg-credit">
        <p class="lg-k">借款额度</p><p class="lg-big">${money(credit)} <small>/ ${money(G.creditLimit())}</small></p>
        <p>额度 = 这家店最好一周的营业额（${money(s.best)}），最少 ${money(G.LOAN_FLOOR * (1 + G.DEBT_STEP * s.branch.n))}。周息 ${pct(r)}${broke ? `（破产 ${broke} 次，加了 ${pct(r - G.LOAN_RATE)}）` : ''}，滚过额度的部分并进下一张账。</p>
        <div class="lg-act">
          ${o ? '' : loanBtn(billLoan, `借 ${money(billLoan)}`)}
          ${repayable >= 1 ? html`<button type="button" data-act="repay" data-n=${repayable}>${s.loan > 0 ? `还借款 ${money(repayable)}` : `提前还 ${money(repayable)}`}</button>` : ''}
        </div>
      </div>
    </div>`, $('ledger'));
  renderRaise();
}

// ---------- 凑钱: the grace minutes of an overdue bill, laid out as choices. Every way the till can reach the bill before 九姐 borrows
// it for you — sell cards to peers (散卡, 单卡库存, the case, the trophy), put the back room on the shelves, open a pack and hope,
// borrow — each with what it brings, what it costs and one button, and the cheapest one that covers it all in yellow. It is not a
// dialog: the player keeps shelving and selling around it. It opens by itself once per overdue week (after 九姐's scene), the red chip
// reopens it, and it hides while a pack is being revealed (the cards are already in 单卡库存 before they are flipped) or a scene plays.
// Nothing here is a new number: BUYLIST, the loan rate and the grace are the economy's (game.ts). ----------
const warm = new Set<string>(); // sets whose one-pack odds are ready
let shutWeek = -1, loanArmed = 0; // the week whose sheet the player closed (the chip opens it again); when 借 was first clicked
// Borrowing here also takes two clicks, but armed by time, not amount: customers keep buying, so what is short moves between the two
// clicks. The second one borrows what is short at that moment (takeLoan caps it at the credit left and pays the bill if it covers it).
function raiseLoan() {
  if (Date.now() - loanArmed > 4000) { loanArmed = Date.now(); renderRaise(); setTimeout(renderRaise, 4100); return; }
  loanArmed = 0; const o = G.state.overdue; if (o) G.takeLoan(Math.ceil(o.amount - G.state.cash));
}
export function openRaise() { shutWeek = -1; renderRaise(); }
// after a sale or a loan the bill is paid on the spot, not on the next second's tick
const act = (f: () => unknown) => () => { f(); const o = G.state.overdue; if (o && G.state.cash >= o.amount) G.payBill(); };
const recentTake = (secs: number) => G.state.recent.reduce((a, v) => a + (v.at > Date.now() - secs * 1000 ? v.gain || 0 : 0), 0);
function sellCase(idx: number[]) { for (const i of [...idx].sort((a, b) => b - a)) { const key = G.state.shown[i]?.key; G.unlist(i); if (key) G.sell(key, 1); } }
const cardsNote = (pick: { c: { name: string }; n: number }[]) => pick.length <= 2 ? pick.map(p => `${p.c.name}${p.n > 1 ? ` ×${p.n}` : ''}`).join('、') : `${pick[0].c.name} 等 ${pick.reduce((a, p) => a + p.n, 0)} 张`;

export function renderRaise() {
  const el = $('raise'), s = G.state, o = s.overdue;
  if (!o || hold || storyOpen() || shutWeek === o.week) { if (el.matches(':popover-open')) el.hidePopover(); return; }
  const rate = G.BUYLIST, cash = s.cash, short = Math.max(0, o.amount - cash), left = o.until - s.shopT, r = G.loanRate(), credit = G.credit();
  const loanN = Math.ceil(short), canLoan = loanN > 0 && loanN <= credit, part = Math.floor(Math.min(loanN, credit)), armedL = Date.now() - loanArmed <= 4000;
  // each route on its own, for the whole of what is short now
  const bulk = G.bulkValue();
  const hits = sellPlan(Object.entries(s.singles).filter(([, c]) => S.HITS.includes(c.kind)).map(([key, c]) => ({ key, name: c.name, price: c.price, count: c.count })), short, rate);
  const caseP = sellPlan(s.shown.map((c, i) => ({ i, name: c.name, price: c.price, count: 1, ask: G.cardAsk(c) })), short, rate);
  const t = s.trophy, tGet = t ? t.price * rate : 0;
  const backL = G.refundable(), backGet = backL.reduce((a, x) => a + x.cost * G.REFUND, 0), bname = (k: string) => (G.UPGRADES[k] || G.SKILLS[k]).name, blv = (k: string) => k in G.UPGRADES ? G.lvl(k) : G.skill(k);
  const stock = Object.entries(s.stock).filter(([, n]) => n > 0), back = stock.reduce((a, [, n]) => a + n, 0);
  const room = G.shelves().some(x => !x.id || x.qty < G.depth()), take5 = recentTake(300), onPace = take5 / 300 * Math.max(0, left);
  // opening: the back-room set whose one pack is likeliest to cover it all when its cards go to peers
  // (packPercentile builds a 60k-pack pool per set the first time, ~60 ms: one new set per render, so opening the sheet doesn't stall)
  let fresh = false;
  const odds = stock.map(([id]) => S.rateKey(id, G.luckMult())).filter(key => warm.has(key) || (!fresh && (fresh = true, warm.add(key), true)))
    .map(key => { const id = S.parseKey(key).id; return { id, ev: S.packEV(key) * rate, ask: G.ask(id), p: short ? 1 - S.packPercentile(key, short / rate) : 1 }; }).sort((a, b) => b.p - a.p)[0];
  // what a route gives up: sold cards the gap to what the case would ask; a loan a week's interest
  const lose = { hits: Math.max(0, hits.pick.reduce((a, p) => a + p.n * p.c.price * (G.casePct() - rate), 0)), case: Math.max(0, caseP.pick.reduce((a, p) => a + p.c.ask - p.c.price * rate, 0)), loan: part * r };
  // the yellow key, by what each dollar costs: 散卡 nothing, a loan a week's interest (10%), a card sold to peers what the case would
  // have paid on top (~57% of what it brings) — so bulk first, then borrow what is left, and only without credit sell the most you can
  const sells = ([['hits', hits.got], ['case', caseP.got], ['trophy', tGet]] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const best = !short ? undefined : bulk.v >= 1 ? 'bulk' : part >= 1 ? 'loan' : sells[0]?.[0];
  const cls = (k: string) => (k === best ? 'primary' : '');
  // get: cash it brings (进账 red); a loan's is plain ink — borrowed money is not income (game.ts logs it as 'loss')
  const row = (k: string, what: unknown, cost: unknown, get: number | null, btn: unknown, lent = false) => html`<li><div class="rs-t"><p class="rs-k">${k}</p><p>${what}</p><p class="rs-cost">${cost}</p></div>
    <b class="rs-get ${lent ? 'lent' : ''}">${get == null ? '' : `+${money(get)}`}</b>${btn}</li>`;
  // the cheapest route that covers it all comes first (on a phone the sheet shows three rows before it scrolls)
  const rows: [string, unknown][] = [
    ['bulk', bulk.n ? row(`卖散卡 ${bulk.n} 张`, '同行按市价的 ' + Math.round(rate * 100) + '% 收', '散卡本来就只能卖给同行', bulk.v, html`<button type="button" class=${cls('bulk')} @click=${act(() => G.sellBulk())}>卖散卡</button>`) : nothing],
    // 退回 (game.ts refundable): this week's levels back at REFUND — the same tenth a loan costs in a week, but it stops there
    ['refund', backL.length ? row(backL.length > 1 ? `退回这周买的 ${backL.length} 样` : '退回这周买的', backL.map(x => `${bname(x.k)} Lv ${blv(x.k)}`).join('、'), `扣一成（${money(backL.reduce((a, x) => a + x.cost * (1 - G.REFUND), 0))}），和借一周的利息一样多，但不会再滚`, backGet,
        html`${backL.map(x => html`<button type="button" data-act="refund" data-k="${x.k}">退回${bname(x.k)}</button>`)}`) : nothing], // events.ts routes data-act=refund
    ['hits', hits.pick.length ? row(hits.got >= short ? `卖 ${hits.pick.reduce((a, p) => a + p.n, 0)} 张闪卡给同行` : '卖掉全部闪卡', cardsNote(hits.pick), `从最便宜的卖起，比留在卡本里卖给找卡的（标 ${Math.round(G.casePct() * 100)}%）少卖 ${money(lose.hits)}`, hits.got,
        html`<button type="button" class=${cls('hits')} @click=${act(() => { for (const p of hits.pick) G.sell(p.c.key, p.n); })}>卖这些</button>`) : nothing],
    ['case', caseP.pick.length ? row(`撤下展示柜 ${caseP.pick.length} 张卖给同行`, cardsNote(caseP.pick), `柜台标价合计 ${money(caseP.pick.reduce((a, p) => a + p.c.ask, 0))}，少卖 ${money(lose.case)}`, caseP.got,
        html`<button type="button" class=${cls('case')} @click=${act(() => sellCase(caseP.pick.map(p => p.c.i)))}>撤下卖掉</button>`) : nothing],
    ['trophy', t ? row('卖掉镇店之宝', t.name, `收藏党不再多来、不再多付 ${Math.round(G.trophyBonus() * 60)}%`, tGet,
        html`<button type="button" class=${cls('trophy')} @click=${act(() => { G.clearTrophy(); G.sell(t.key, 1); })}>卖掉</button>`) : nothing],
    ['shelf', row('等货架卖', take5 ? html`过去 5 分钟店里进账 ${money(take5)}，照这个速度宽限内约再进 <b>${money(onPace)}</b>${onPace >= short ? '，自己就能凑齐' : ''}` : '过去 5 分钟店里没进账',
        back ? `仓库还有 ${back} 包没上架${room ? '' : '，货架满了'}` : '仓库空了；进货会花掉手上的钱', null,
        back && room ? html`<button type="button" @click=${act(() => { for (const [id, n] of stock) G.shelve(id, n); })}>仓库全部上架</button>` : nothing)],
    ['open', odds ? row(`开包赌一把 · ${G.setById(odds.id).name}`, html`一包就开出够数的机会 <b>${odds.p < 0.001 ? '不到 0.1%' : `${(odds.p * 100).toFixed(1)}%`}</b>`,
        `开出的卡卖给同行平均 ${money(odds.ev)} 一包，这包放货架能卖 ${money(odds.ask)}`, null,
        html`<button type="button" @click=${() => { location.hash = 'open'; }}>去开包</button>`) : nothing],
    ['loan', part >= 1 ? row(canLoan ? `借 ${money(loanN)}` : `借满额度 ${money(part)}`, `每周利息 ${money(lose.loan)}${canLoan ? '' : `，差的 ${money(loanN - part)} 还得卖`}`,
        `周息 ${Math.round(r * 100)}%，3 周不还滚到 ${money(part * (1 + r) ** 3)}${canLoan ? ` · 额度 ${money(credit)}` : ''}`, part,
        html`<button type="button" class=${cls('loan')} @click=${act(raiseLoan)}>${armedL ? `再点一次：借 ${money(Math.min(loanN, part))}` : canLoan ? `借 ${money(loanN)}` : '借满'}</button>`, true)
      : row('借', html`额度用完了`, '先还掉一些借款，额度才回来', null, nothing)],
  ];
  rows.sort((x, y) => +(y[0] === best) - +(x[0] === best));
  render(html`<h2>凑钱 <small>第 ${o.week} 周的账 ${money(o.amount)}</small><button type="button" class="rs-x" aria-label="收起" @click=${() => { shutWeek = o.week; renderRaise(); }}>×</button></h2>
    <div class="rs-head">
      <p class="rs-short">${short ? html`还差 <b>${money(short)}</b>` : html`<b>钱够了</b>`}</p>
      <p class="rs-clock"><span class="rs-k">宽限</span><b>${clock(left)}</b></p>
      <span class="gh-bar" role="img" aria-label="手上 ${money(cash)}，账 ${money(o.amount)}"><i style="--p:${Math.min(1, cash / o.amount)}"></i></span>
      <p class="rs-note">手上 ${money(cash)} / 账 ${money(o.amount)} · 钱一够就自动付掉 · 开包、离开时宽限不走</p>
    </div>
    ${short ? html`<ul class="rs-list">
      ${rows.map(x => x[1])}
    </ul>
    <p class="rs-foot">${canLoan ? `什么都不做：宽限到了，九姐替你借 ${money(loanN)}，周息 ${Math.round(r * 100)}%。` : html`<b>宽限到了还差的超过额度（${money(credit)}），店就收走。</b>${part >= 1 ? `再凑 ${money(loanN - part)}，差的就在额度里，到点九姐替你借上。` : ''}`}</p>`
    : html`<div class="rs-list"><button type="button" class="primary" @click=${() => G.payBill()}>付账 ${money(o.amount)}</button></div>`}`, el);
  if (!el.matches(':popover-open')) el.showPopover();
  const due = $('due').getBoundingClientRect(); // under the chip on wide screens (phones: a sheet above the tab bar, style.css)
  el.style.setProperty('--x', `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, due.left + due.width / 2 - el.offsetWidth / 2))}px`);
}

export function renderWreck() {
  const w = G.state.wreck, dlg = $('wreck') as HTMLDialogElement;
  if (!w) { if (dlg.open) dlg.close(); return; }
  const story = document.getElementById('story') as HTMLDialogElement | null; // 九姐's scene plays first; the statement comes after it
  if (story?.open) { story.addEventListener('close', renderWreck, { once: true }); return; }
  const s = G.state, dex = Object.keys(s.dexSeen).length, ach = Object.keys(s.ach).length;
  render(html`<h2>破产</h2>
    <p class="wr-say">第 ${w.shop + 1} 家店，撑到第 ${w.week} 周。欠九姐 ${money(w.debt)}，付不上了。</p>
    <dl class="wr-list">
      <div><dt>收走的现金</dt><dd>${money(w.cash)}</dd></div>
      <div><dt>收走的货（按进价）</dt><dd>${money(w.goods)}</dd></div>
      <div><dt>收走的卡（按市价）</dt><dd>${money(w.cards)}</dd></div>
      <div><dt>这家店的营业额</dt><dd>${money(w.revenue)}，不算名气</dd></div>
      <div><dt>升级、技能</dt><dd>清零</dd></div>
    </dl>
    <p class="wr-keep"><b>留下</b>图鉴 ${dex} 张、成就 ${ach} 个、欧气检测记录、名气 ${s.branch.fame}${s.branch.got ? ' 和名气加成' : ''}。</p>
    <p class="wr-keep"><b>往后</b>同一家店从第 1 周重来，欠 ${money(s.debt)}；借款周息 ${pct(G.loanRate())}（每破产一次 +${pct(G.LOAN_MARK)}）。</p>
    <button type="button" data-act="ackwreck">重新开张</button>`, dlg);
  if (!dlg.open) dlg.showModal();
}

// The chip counts down between renders (a quiet second emits nothing); it is a link to 成长, where the ledger is.
export function initLedger() {
  setInterval(() => { renderDue(); renderRaise(); }, 1000);
  $('due').addEventListener('click', e => { if (G.state.overdue) { e.preventDefault(); openRaise(); } }); // overdue: the chip opens 凑钱, not the ledger
  for (const ev of ['ptcg:story', 'ptcg:release']) document.addEventListener(ev, () => setTimeout(renderRaise, 450)); // after 九姐's scene / the pack
  $('wreck').addEventListener('cancel', e => e.preventDefault()); // Esc does not dismiss the statement; 重新开张 does
}
