// 新手引导: one popover at a time, pinned next to the button the step is about (DESIGN.md「引导」). The step is read off the game
// state (stock, shelves, packs opened, bills paid) plus four flags state cannot tell (price looked at, bill explained, 欧气 visited,
// skipped), kept in localStorage like the mute switch. It covers the first week, not just five buttons: once the first pack is
// open it comes back whenever the shelves sell out (补货), and it shows what the top bar's countdown is (账单). When the step's
// button is on another page it points at that page's tab instead. Hidden while a pack is being revealed. A save that has plainly
// played past it (GRAD) never sees it. The footer's 新手引导 replays every step with a 下一步 button.
import { html, render, nothing } from 'lit-html';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';
import { go } from './layout.ts';
import { storyOpen } from './story.ts';

const KEY = 'ptcg.guide';
type Rec = { price?: 1; bill?: 1; luck?: 1; off?: 1; share?: 1 };
let rec: Rec = {};
try { rec = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* storage blocked: the guide just starts over each visit */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* ignore */ } };
export function resetGuide() { rec = {}; save(); replay = -1; }

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const page = () => document.documentElement.dataset.page;
const shown = (el: Element | null) => (el && el.getClientRects().length ? el : null);
// first visible match, in the order given (a comma selector would return document order)
const pick = (...sels: string[]) => { for (const q of sels) for (const el of document.querySelectorAll(q)) if (shown(el)) return el; return null; };
const firstShelved = () => G.shelves().find(r => r.id)?.id;
const mins = (s: number) => Math.max(1, Math.ceil(s / 60));
// an old or imported save (every screenshot of a late game still had 「新手 5/5」 on it): two bills paid, or 30 packs opened once
// the first bill has landed (a pack-happy newcomer opens 30 in three minutes and still needs 账单), or a second shop / a
// bankruptcy (billsPaid counts this shop only) means the loop is known, whatever the flags say
const GRAD = { bills: 2, packs: 30 };
const graduated = () => { const s = G.state;
  return s.billsPaid >= GRAD.bills || (sum(s.opened) >= GRAD.packs && (s.billsPaid > 0 || !G.nextBill())) || s.branch.n > 0 || !!s.branch.broke; };

// alt: a button off the step's page that answers it just as well (the share button under a finished pack, for 测欧气)
type Step = { page: string; h: string; p: (el: Element | null) => unknown; done: () => boolean; at: () => Element | null; alt?: () => Element | null };
const STEPS: Step[] = [
  { page: 'shelf', h: '进货', done: () => sum(G.state.stock) + sum(G.state.opened) > 0 || G.shelves().some(r => r.id), // a labelled shelf stays labelled once it sells out
    at: () => pick('#shelf .set .primary[data-act="buy"]', '#shelf .set [data-act="buy"][data-n="10"]:not(:disabled)'),
    p: el => { const id = (el as HTMLElement | null)?.dataset.id;
      return html`点「进 10」从批发商进一箱。${id ? `${G.setById(id).name}进货 ${money(G.wholesale(id))} 一包，市价 ${money(G.sealedPrice(id))}，` : '进货价比市价低，'}差价就是卖一包的毛利。`; } },
  { page: 'shelf', h: '摆上货架', done: () => G.shelves().some(r => r.id),
    at: () => pick('#shelf .set [data-act="shelve"]:not(:disabled)', '#shelf .set .primary'),
    p: () => (sum(G.state.stock) ? '点「摆上空货架」。仓库里的包顾客看不到，只有货架上的才卖得出去；仓库会留 1 包，待会儿你自己拆。' : '仓库空了：先进货，再点「摆上空货架」。只有货架上的包才卖得出去。') },
  { page: 'shelf', h: '定价', done: () => !!rec.price || Object.keys(G.state.price).length > 0,
    at: () => { const id = firstShelved(); return id ? shown(document.querySelector(`#shelf .pricer [data-id="${id}"]`)?.closest('.verb') ?? null) : null; },
    p: () => { const id = firstShelved(); return html`黄价签是你定的价，默认是市价的 ${Math.round(G.DEFAULT_PCT * 100)}%${id ? `（${money(G.ask(id))}）` : ''}。标高了嫌贵的顾客会走，标低了少赚；标在市价附近或更低，还可能碰上倒爷按这个价整架收走。每位顾客最多肯出多少，下面「顾客」里看得到。`; } },
  { page: 'open', h: '开一包', done: () => sum(G.state.opened) > 0,
    at: () => pick(`#page-${page()} [data-act="open1"]:not(:disabled)`, `#page-${page()} [data-act="buyopen"]:not(:disabled)`),
    p: el => (page() === 'open' && !el ? `钱不够进 1 包：等货架上的包卖出去，或者去「货柜」一键卖散卡。` : null) ?? `${(el as HTMLElement | null)?.dataset.act === 'buyopen' ? '货架上的包留给顾客，仓库空着：点这里进 1 包马上拆。' : '货架上的包留给顾客，自己拆仓库里的。'}撕开封口，一张张翻（空格也行）。卡价和开包概率都是真实统计。` },
  // the shelf sells out in about a minute at the start, usually before the first pack is flipped: the loop, not a one-off
  { page: 'shelf', h: '补货', done: () => G.shelves().some(r => r.qty > 0),
    at: () => pick('#shelf .set .primary:not(:disabled)', '#shelf .set [data-act="buy"][data-n="10"]:not(:disabled)'),
    p: () => (sum(G.state.stock) ? '仓库里有货，货架是空的：点「摆上空货架」。' : '货架卖空了。空货架不进钱，想买的顾客空手走（「货架」页签上的数字）。进一箱、摆上去，这就是每天的活。') },
  // on a phone the chip is only the countdown: nothing else says it is 九姐's clock
  { page: 'open', h: '账单', done: () => !!rec.bill || G.state.billsPaid > 0 || !!G.state.overdue || !G.nextBill(),
    at: () => shown(document.getElementById('due')),
    p: () => { const b = G.nextBill(); if (!b) return null;
      return html`顶栏这个倒计时是九姐来收账的时间：第 ${b.week} 周 ${money(b.amount)}，还有约 ${mins(G.dueIn())} 分钟。到点时收银机里够就自动付；不够有 ${G.GRACE / 60} 分钟宽限凑钱，再不够记成借款（每周 ${Math.round(G.loanRate() * 100)}% 利息）。所以货架别空着。`; } },
  { page: 'luck', h: '测欧气', done: () => !!rec.luck, at: () => pick('#luck h2', '#luck'),
    alt: () => (rec.share || page() !== 'open' ? null : pick('#mat .summary [data-act="sharemat"]')),
    p: el => ((el as HTMLElement | null)?.dataset.act === 'sharemat' ? '点「分享这次开包」，把这包的价值和排名做成一张图；想看你在几千个模拟玩家里排第几，去「欧气」页。'
      : '看看这包的运气在几千个模拟玩家里排第几，还能生成分享图。') },
];

const TAB: Record<string, string> = { open: '开包', shelf: '货柜', luck: '欧气', grow: '成长' };
let replay = -1; // index while replaying from the footer, else -1
const current = () => (replay >= 0 ? replay : rec.off || graduated() ? -1 : STEPS.findIndex(s => !s.done()));

let anchor: Element | null = null;
const phone = () => innerWidth < 780;
// what the popover may not cover from below: the phone's bottom tabs
const floor = () => (phone() ? Math.min(innerHeight, document.querySelector('.nav')?.getBoundingClientRect().top ?? innerHeight) : innerHeight);
// On the mat the thing to look at sits above the button (the 3D pack above its label, the cards and the pack's value above the
// share button), so opening above would cover it. Desktop: beside the anchor, bottom edges level, and in a summary past its
// text too. Phone: a strip without the heading, below the button, scrolled up to make room for it.
let seek = 0; // until when a new step may still scroll its button into view
function place() {
  const pop = $('coach');
  if (!pop.matches(':popover-open') || !anchor) return;
  const onMat = !!anchor.closest('#mat'), tab = !!anchor.closest('.nav');
  // before measuring: the strips are shorter, the side popover wider. A tab (the step is on another page) only needs its heading,
  // 「测欧气：到「欧气」页」: the full text over the bottom tabs covered what the player was reading (成长's 借款额度)
  if (phone() && (onMat || tab)) pop.dataset.strip = onMat ? 'mat' : 'tab'; else delete pop.dataset.strip;
  if (onMat && !phone()) pop.dataset.side = 'right';
  const a = anchor.getBoundingClientRect(), gap = 12, vw = innerWidth, vh = floor();
  let w = pop.offsetWidth, h = pop.offsetHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // a new step's button off screen, or a strip with no room under its button: scroll, once. Kept pending for a moment, because
  // the 3D table places its labels (and fades them in) only after the page shows and its canvas resizes. place() runs again
  // on every scroll step.
  if (performance.now() < seek && !anchor.matches('.s3-shelf > :not(.in), #due')) { // #due: the fixed top bar, always in view
    const need = pop.dataset.strip === 'mat' ? a.bottom + gap + h + 24 - vh : 0; // 16px to spare: the 3D labels settle a few px after the scroll
    if (need > 0) { seek = 0; scrollBy({ top: need, behavior: 'smooth' }); }
    else if (a.top < 70 || a.bottom > innerHeight - 70) { seek = 0; anchor.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  if (onMat && !phone()) {
    let right = a.right; const sum = anchor.closest('.summary');
    if (sum) for (const el of sum.querySelectorAll('p, button')) {
      const r = document.createRange(); r.selectNodeContents(el); // a <p> is full width; its line boxes are where the text ends
      for (const q of el.tagName === 'P' ? r.getClientRects() : [el.getBoundingClientRect()]) right = Math.max(right, q.right);
    }
    const x = right + gap + w <= vw - 8 ? right + gap : a.left - gap - w >= 8 ? a.left - gap - w : null;
    if (x != null) {
      const y = clamp(a.bottom - h, 8, vh - h - 8);
      pop.style.left = `${x}px`; pop.style.top = `${y}px`; pop.dataset.side = x > a.left ? 'right' : 'left';
      pop.style.setProperty('--ay', `${clamp(a.top + a.height / 2 - y, 16, h - 16)}px`);
      return;
    }
    pop.dataset.side = 'below'; w = pop.offsetWidth; h = pop.offsetHeight; // no room beside it (tablets): the narrow popover, measured again
  }
  // a button in a pack's summary: open above the whole summary, so the pack's value and rank stay readable
  const top = (onMat && phone() ? anchor : anchor.closest('.summary') ?? anchor).getBoundingClientRect().top;
  const below = a.bottom + gap + h <= vh - 8 || top - gap - h < 8; // phones: the tabs sit at the bottom, so tab steps open upward
  const x = clamp(a.left + a.width / 2 - w / 2, 8, vw - w - 8);
  pop.style.left = `${x}px`; pop.style.top = `${below ? a.bottom + gap : top - gap - h}px`;
  pop.dataset.side = below ? 'below' : 'above';
  pop.style.setProperty('--ax', `${clamp(a.left + a.width / 2 - x, 16, w - 16)}px`);
}

// the 3D table moves its labels with an inline transform, after this renders and whenever the camera settles: follow them
const follow = new MutationObserver(place);
let last = -2;
export function renderGuide() {
  const pop = $('coach'), i = current(), step = STEPS[i];
  anchor?.classList.remove('coach-on'); anchor = null; follow.disconnect();
  if (!step || hold || storyOpen()) { if (pop.matches(':popover-open')) pop.hidePopover(); return; } // leave `last` alone: the step that turns up during a pack still gets scrolled to on release
  // the step's own button wherever it is visible (at() only finds shown ones: 开一包's 「开 1 包」 right there on 货柜, the top bar's
  // bill chip on any page), else that page's tab (货柜's 货架 view tab when the player is on its 展示柜 view)
  const here = step.at() ?? step.alt?.() ?? null;
  anchor = here ?? pick(`.subnav a[href="#${step.page}"]`, `.nav a[href="#${step.page}"]`);
  if (!anchor) { if (pop.matches(':popover-open')) pop.hidePopover(); return; }
  anchor.classList.add('coach-on');
  const n = replay >= 0, end = i === STEPS.length - 1;
  render(html`<p class="co-k">新手 ${i + 1}/${STEPS.length}</p>
    <h3>${step.h}${here || page() === step.page ? nothing : html`<small>：到${page() === 'case' && step.page === 'shelf' ? '「货架」' : `「${TAB[step.page]}」页`}</small>`}</h3>
    <p>${step.p(here)}</p>
    <div class="co-btns"><button type="button" class="ghost" data-coach="off">${n ? '关掉' : '跳过引导'}</button>
      ${n ? html`<button type="button" class="ghost" data-coach="next">${end ? '完成' : '下一步'}</button>`
        : step.h === '定价' && here ? html`<button type="button" class="ghost" data-coach="price">先按这个价卖</button>`
        : step.h === '账单' && here ? html`<button type="button" class="ghost" data-coach="bill">知道了</button>` : nothing}</div>`, pop);
  if (!pop.matches(':popover-open')) pop.showPopover();
  if (i !== last && here) seek = performance.now() + 1500;
  if (here) last = i; // a step first shown as its page's tab still gets scrolled to on arriving there
  place();
  follow.disconnect(); if (anchor.closest('#mat')) follow.observe(anchor, { attributes: true, attributeFilter: ['style'] });
  // a new step whose button is below the fold: bring it into view once
}

export function bindGuide() {
  const sawLuck = () => { if (page() === 'luck' && !rec.luck && sum(G.state.opened)) { rec.luck = 1; save(); } };
  sawLuck(); // a reload straight onto #luck counts too
  addEventListener('hashchange', () => { sawLuck(); renderGuide(); });
  addEventListener('resize', place); addEventListener('scroll', place, { passive: true });
  document.addEventListener('ptcg:release', renderGuide); document.addEventListener('ptcg:story', renderGuide);
  document.addEventListener('click', e => {
    const t = e.target as Element, b = t.closest<HTMLElement>('[data-coach], [data-act]'); if (!b) return;
    if (b.dataset.act === 'guide') { replay = 0; go(STEPS[0].page); }
    else if (b.dataset.act === 'sharemat') { if (!rec.share) { rec.share = 1; save(); } }
    else if (b.dataset.coach === 'price') { rec.price = 1; save(); }
    else if (b.dataset.coach === 'bill') { rec.bill = 1; save(); }
    else if (b.dataset.coach === 'off') { if (replay < 0) { rec.off = 1; save(); } replay = -1; }
    else if (b.dataset.coach === 'next') { replay = replay + 1 < STEPS.length ? replay + 1 : -1; if (replay >= 0) go(STEPS[replay].page); }
    else return;
    queueMicrotask(renderGuide);
  });
  G.on(renderGuide); renderGuide();
}
