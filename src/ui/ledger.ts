// 债务 on screen (rules and numbers: GAMEPLAY.md, game.ts). Three pieces:
// - the due chip in the top bar (#due): which week, when 九姐 comes, how much; louder in the last 5 minutes, when cash falls
//   short of the bill, or while a bill is overdue. It ticks every second on its own, since a quiet second emits nothing.
// - 账本 (#ledger, top of 成长): what is still owed (installments / loan), the next bill and the ones after it, the credit line,
//   and the three actions: pay an overdue bill, borrow (two clicks: the first shows what it grows to), repay.
// - 破产结算 (#wreck): a <dialog> listing what 九姐 took and what stayed, open until acknowledged.
import { html, render } from 'lit-html';
import { G, $, money } from './common.ts';

const clock = (s: number) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const pct = (r: number) => `${Math.round(r * 100)}%`;

// Borrowing takes two clicks within 4 s on the same amount: the first one only shows what the loan becomes.
let armed = { n: 0, at: 0 };
export function loanClick(n: number) {
  if (armed.n === n && Date.now() - armed.at < 4000) { armed = { n: 0, at: 0 }; G.takeLoan(n); return; }
  armed = { n, at: Date.now() }; renderLedger(); setTimeout(renderLedger, 4100);
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

export function renderLedger() {
  const s = G.state, o = s.overdue, b = G.nextBill(), d0 = G.debt0(), r = G.loanRate(), credit = G.credit(), broke = s.branch.broke || 0;
  const head = html`<h2>账本 <small>欠九姐的 · 第 ${s.branch.n + 1} 家店 · 第 ${s.week} 周${broke ? ` · 破产 ${broke} 次` : ''}</small></h2>`;
  if (!s.debt && !o) {
    render(html`${head}<div class="lg-free"><p><b>债还清了。</b>这家店是你的了，不再有账单。</p>
      <p>下面「开分店」能带走名气；九姐出下一家店的本钱（${money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * (s.branch.n + 1))))}）。</p></div>`, $('ledger'));
    return;
  }
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
      </div>
      <div class="lg-bill">
        ${o ? html`<p class="lg-k lg-late">第 ${o.week} 周的账逾期</p><p class="lg-big">${money(o.amount)}</p>
            <p>宽限还剩 <b>${clock(o.until - s.shopT)}</b>。${short ? html`手上 ${money(s.cash)}，还差 <b>${money(short)}</b>：卖卡、开包赌一把，或者借。宽限到了九姐会替你借上${short > credit ? html`——<b>额度只剩 ${money(credit)}，不够就是破产</b>` : ''}。` : '钱够了，付掉吧。'}</p>
            <div class="lg-act">${short ? loanBtn(Math.ceil(short), `借 ${money(Math.ceil(short))} 付账`, short <= credit) : html`<button type="button" class="primary" data-act="paybill">付账 ${money(o.amount)}</button>`}</div>`
        : b ? html`<p class="lg-k">第 ${b.week} 周的账 · ${clock(G.dueIn())} 后来收</p><p class="lg-big">${money(b.amount)}</p>
            <p>${s.cash >= b.amount ? html`手上 ${money(s.cash)}，到时自动付。` : html`手上 ${money(s.cash)}，<b>还差 ${money(b.amount - s.cash)}</b>。到时付不上有 ${G.GRACE / 60} 分钟宽限。`}</p>
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
  setInterval(renderDue, 1000);
  $('wreck').addEventListener('cancel', e => e.preventDefault()); // Esc does not dismiss the statement; 重新开张 does
}
