// 新手引导: one popover at a time, pinned next to the button the step is about (DESIGN.md「引导」). The step is read off the game
// state (stock, shelves, packs opened, bills paid) plus four flags state cannot tell (price looked at, bill explained, 欧气 visited,
// skipped), kept in localStorage like the mute switch. It covers the first week, not just five buttons: once the first pack is
// open it comes back whenever the shelves sell out (补货), and it shows what the top bar's countdown is (账单). When the step's
// button is on another page it points at that page's tab instead. Hidden while a pack is being revealed. A save that has plainly
// played past it (GRAD) never sees it. The footer's 新手引导 replays every step with a 下一步 button.
import { html, render, nothing } from 'lit-html';
import { G, $, money } from './common.ts';
import { SETS } from '../sets.ts';
import { hold } from './mat.ts';
import { go } from './layout.ts';
import { storyOpen } from './story.ts';

const KEY = 'ptcg.guide';
type Rec = { price?: 1; bill?: 1; luck?: 1; off?: 1; share?: 1; done?: 1; badges?: 1 }; // done: every guide step reached; badges: the missed-customer explanation was visible when the player acted
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
// the sets a new shop opens with (two, no revenue needed): 进货 and 摆上货架 walk each of them to a full shelf — a customer whose set
// isn't on the shelf leaves half the time, so one stocked set of two lost about a third of the walk-ins (GAMEPLAY.md §8 开张期). One
// unlocked mid-guide is notice.ts's 「新到」 box after the guide, not the guide starting over at 1/6 (the numbers went 1/6 → 5/6)
const sellable = () => SETS.filter(x => G.unlocked(x.id) && !G.unlockAt(x.id));
const racked = (id: string) => G.shelves().some(r => r.id === id);
const toStock = () => sellable().find(x => !(G.state.stock[x.id] || 0) && !racked(x.id) && G.state.cash >= G.wholesale(x.id) * 10);
const toRack = () => sellable().find(x => (G.state.stock[x.id] || 0) > 1 && !racked(x.id) && G.shelves().some(r => !r.id));
const inRow = (id: string, q: string) => pick(`#shelf .set[data-spot="set:${id}"] ${q}`);
const mins = (s: number) => Math.max(1, Math.floor(s / 60)); // 17:11 on the chip is 「约 17 分钟」, not 18
// 账单 is read, not pressed: after BILL_READ on screen it gives way to 补货 when a shelf is empty (the guide's clock, not a game setting)
const BILL_READ = 8000;
let billAt = 0;
// an old or imported save (every screenshot of a late game still had 「新手 5/5」 on it): two bills paid, or 30 packs opened once
// the first bill has landed (a pack-happy newcomer opens 30 in three minutes and still needs 账单), or a second shop / a
// bankruptcy (billsPaid counts this shop only) means the loop is known, whatever the flags say
const GRAD = { bills: 2, packs: 30 };
const graduated = () => { const s = G.state;
  return s.billsPaid >= GRAD.bills || (sum(s.opened) >= GRAD.packs && (s.billsPaid > 0 || !G.nextBill())) || s.branch.n > 0 || !!s.branch.broke; };

// alt: a button off the step's page that answers it just as well (the share button under a finished pack, for 测欧气)
type Step = { page: string; h: string; p: (el: Element | null) => unknown; done: () => boolean; at: () => Element | null; alt?: () => Element | null };
const STEPS: Step[] = [
  { page: 'shelf', h: '进货', done: () => !toStock() && (sum(G.state.stock) + sum(G.state.opened) > 0 || G.shelves().some(r => r.id)), // a labelled shelf stays labelled once it sells out
    at: () => { const x = toStock(); return x ? inRow(x.id, '.primary[data-act="buy"]') ?? inRow(x.id, '[data-act="buy"][data-n="10"]:not(:disabled)') : null; },
    p: el => { const b = el as HTMLElement | null, id = b?.dataset.id, first = !sum(G.state.stock) && !G.shelves().some(r => r.id), key = `「${b?.textContent?.trim() || '进 10'}」`;
      if (!id) return '进货价比市价低，差价就是卖一包的毛利。';
      return first ? html`点${key}从批发商进货：${G.setById(id).name}进货 ${money(G.wholesale(id))} 一包，市价 ${money(G.sealedPrice(id))}，差价就是卖一包的毛利。一个货架放 ${G.depth()} 包；只进 10 包很快就卖光，货架空着就没有进账。`
        : html`${G.setById(id).name}也进一架（点${key}）。来的顾客想买的系列不一样，货架上没有他要的那个，一半人直接走。`; } },
  { page: 'shelf', h: '摆上货架', done: () => G.shelves().some(r => r.id) && !toRack(),
    at: () => { const x = toRack(); return x ? inRow(x.id, '[data-act="shelve"]:not(:disabled)') : pick('#shelf .set [data-act="shelve"]:not(:disabled)', '#shelf .set .primary'); },
    // quote the button as it reads right now (「摆上空货架 9 包」the first time, 「上架 1 包」once the set has a shelf): a new player looks for those words
    p: el => { const b = `「${el?.matches('[data-act="shelve"]') ? el.textContent!.trim() : '摆上空货架'}」`; return sum(G.state.stock) ? `点${b}。仓库里的包顾客看不到，只有货架上的才卖得出去；仓库会留 1 包给你自己拆。` : `仓库空了：先进货，再点${b}。只有货架上的包才卖得出去。`; } },
  { page: 'shelf', h: '定价', done: () => !!rec.price || Object.keys(G.state.price).length > 0,
    at: () => { const id = firstShelved(); return id ? shown(document.querySelector(`#shelf .pricer [data-id="${id}"]`)?.closest('.verb') ?? null) : null; },
    // the 倒爷 line quotes their own ceiling (game.ts TYPES.flipper.tol): 「市价附近」 read like the default 95%, and at 95% they walked out
    p: () => { const id = firstShelved(), flip = Math.round(G.TYPES.flipper.tol * 100); return html`黄价签是你定的价，默认市价的 ${Math.round(G.DEFAULT_PCT * 100)}%${id ? `（${money(G.ask(id))}）` : ''}：虚线框里 − / + 调，不想调就点「先按这个价卖」。标高了嫌贵的顾客会走，标低了少赚；倒爷肯出的上限平均约市价的 ${flip}%（每人不同），标价在它以下，开张 10 分钟后他们会一次买走一批。`; } },
  { page: 'open', h: '开一包', done: () => sum(G.state.opened) > 0,
    at: () => pick(`#page-${page()} [data-act="open1"]:not(:disabled)`, `#page-${page()} [data-act="buyopen"]:not(:disabled)`),
    p: el => (page() === 'open' && !el ? `钱不够进 1 包：等货架上的包卖出去，或者去「货柜」一键卖散卡。` : null) ?? `${(el as HTMLElement | null)?.dataset.act === 'buyopen' ? '货架上的包留给顾客，仓库空着：点这里进 1 包马上拆。' : '货架上的包留给顾客，自己拆仓库里的。'}撕开封口，一张张翻${matchMedia('(pointer: coarse)').matches ? '' : '（空格也行）'}。卡价和基础开包概率来自 TCGplayer 市价及实开统计，手气是另算的游戏加成。` },
  // on a phone the chip is only the countdown: nothing else says it is 九姐's clock
  { page: 'open', h: '账单', done: () => {
      // read for 8 s and a shelf is empty: 补货 comes first (a shelf stood empty ~50 s behind 知道了) — and that counts as read, for good:
      // it came back after the restock and wanted 知道了 a second time
      if (!rec.bill && billAt > 0 && Date.now() - billAt > BILL_READ && G.shelves().some(r => r.id && !r.qty)) { rec.bill = 1; save(); }
      return !!rec.bill || G.state.billsPaid > 0 || !!G.state.overdue || !G.nextBill(); },
    at: () => shown(document.getElementById('due')),
    p: () => { const b = G.nextBill(); if (!b) return null;
      return html`顶栏这个倒计时是九姐来收账的时间：第 ${b.week} 周 ${money(b.amount)}，还有约 ${mins(G.dueIn())} 分钟。到点时收银机里够就自动付；不够有 ${G.GRACE / 60} 分钟宽限凑钱，再不够，额度够就记成借款（每周 ${Math.round(G.loanRate() * 100)}% 利息），额度不够就破产。所以货架别空着。`; } },
  // the shelf sells out in about a minute at the start, usually before the first pack is flipped: the loop, not a one-off. Not a
  // numbered step (it comes and goes with the shelves); the key and the text are one: the sold-out set's own row — 上架 N 包 when
  // the back room holds more than the one pack kept to open, else its 进一架
  { page: 'shelf', h: '补货', done: () => !G.shelves().some(r => r.id && !r.qty), // every labelled shelf, not just one: the rest waited for a note after the guide
    at: () => { const id = G.shelves().find(r => r.id && !r.qty)?.id; if (!id) return null;
      return (G.state.stock[id] || 0) > 1 ? inRow(id, '[data-act="shelve"]:not(:disabled)') : inRow(id, '.primary[data-act="buy"]') ?? inRow(id, '[data-act="buy"]:not(:disabled)'); },
    p: el => { const key = `「${el?.textContent?.trim() || '进一架'}」`;
      return el?.matches('[data-act="shelve"]') ? `仓库里有货，货架是空的：点${key}。` : `货架卖空了。空货架不进钱，想买的顾客空手走（「货柜」页签上的数字）。点${key}进一架，再摆上货架。`; } },
  { page: 'luck', h: '测欧气', done: () => !!rec.luck, at: () => pick('#luck h2', '#luck'),
    alt: () => (rec.share || page() !== 'open' ? null : pick('#mat .summary [data-act="sharemat"]')),
    p: el => ((el as HTMLElement | null)?.dataset.act === 'sharemat' ? '点「分享这次开包」，把这包的价值和排名做成一张图；想看你在几千个模拟玩家里排第几，去「欧气」页。'
      : '看看你累计开的包在几千个模拟玩家里排第几，还能生成分享图。') },
];

const TAB: Record<string, string> = { open: '开包', shelf: '货柜', luck: '欧气', grow: '成长' };
let replay = -1; // index while replaying from the footer, else -1
const current = () => (replay >= 0 ? replay : rec.off || rec.done || graduated() ? -1 : STEPS.findIndex(s => !s.done()));
// the guide still has a step to show (notice.ts leaves a sold-out shelf to the guide's own 补货 until then)
export const guiding = () => current() >= 0;
// 新手 n/6: the numbered steps skip 补货, which only turns up when a shelf is empty (the numbers jumped 4 → 6 → 5 on a phone)
const NUMBERED = STEPS.filter(s => s.h !== '补货');

let anchor: Element | null = null;
const phone = () => innerWidth < 780;
// what the popover may not cover from below: the phone's bottom tabs
const floor = () => (phone() ? Math.min(innerHeight, document.querySelector('.nav')?.getBoundingClientRect().top ?? innerHeight) : innerHeight);
// On the mat the thing to look at sits above the button (the 3D pack above its label, the cards and the pack's value above the
// share button), so opening above would cover it. Desktop: on the mat beside the anchor, bottom edges level, and in a summary past
// its text too; a button on a page gets the docked message box (below). Phone: a strip without the heading, below the button,
// scrolled up to make room for it.
let seek = 0; // until when a new step may still scroll its button into view
function place() {
  const pop = $('coach');
  if (!pop.matches(':popover-open') || !anchor) return;
  const onMat = !!anchor.closest('#mat'), tab = !!anchor.closest('.nav');
  // before measuring: the strips are shorter, the side popover wider. A tab (the step is on another page) only needs its heading,
  // 「测欧气：到「欧气」页」, on every screen: the full text under a tab covered what the player was reading on this page (成长's
  // 账本, 成就's totals, the 开包 title) and had nothing to do with it.
  // A button on a page (货柜's 进 10 / 摆上空货架 / the price, 欧气's heading) on a desktop: the step is a BW message box docked at the
  // bottom of the screen, the way BW's tutorials talk in the text box, and the button (dashed ring) is scrolled into the upper part.
  // A bubble beside it always covered something the step was about: the row's name and stock, the next set's keys, the pickers.
  const dock = !phone() && !onMat && !tab && !anchor.matches('#due');
  if ((phone() && onMat) || tab) pop.dataset.strip = tab ? 'tab' : 'mat'; else if (dock) pop.dataset.strip = 'dock'; else delete pop.dataset.strip;
  if (onMat && !phone()) pop.dataset.side = 'right'; else pop.dataset.side = 'below'; // measured at the width it opens with
  const a = anchor.getBoundingClientRect(), gap = 12, vw = innerWidth, vh = floor();
  let w = pop.offsetWidth, h = pop.offsetHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // a new step's button off screen, or a strip with no room under its button: scroll, once. Kept pending for a moment, because
  // the 3D table places its labels (and fades them in) only after the page shows and its canvas resizes. place() runs again
  // on every scroll step.
  if (performance.now() < seek && !tab && !anchor.matches('.s3-shelf > :not(.in), #due')) { // a tab, #due: the fixed top bar, always in view
    const need = pop.dataset.strip === 'mat' ? a.bottom + gap + h + 24 - vh : 0; // 16px to spare: the 3D labels settle a few px after the scroll
    const room = dock ? Math.min(vh - h - 40, vh * .55) : innerHeight - 70; // docked: the button (and the row under it) stays well above the box
    if (need > 0) { seek = 0; scrollBy({ top: need, behavior: 'smooth' }); }
    else if (a.top < 70 || a.bottom > room) { seek = 0; scrollBy({ top: a.top - Math.max(90, (70 + room - a.height) / 2), behavior: 'smooth' }); }
  }
  if (dock) { pop.style.left = ''; pop.style.top = ''; return; } // style.css places it
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
  // a button in a pack's summary: open above the whole summary, so the pack's value and rank stay readable. The bill chip on a phone:
  // above the bottom tabs, not under the chip (it lay over the first row of the cards just turned)
  const bill = phone() && anchor.matches('#due');
  const top = (onMat && phone() ? anchor : anchor.closest('.summary') ?? anchor).getBoundingClientRect().top;
  const below = !bill && (a.bottom + gap + h <= vh - 8 || top - gap - h < 8); // phones: the tabs sit at the bottom, so tab steps open upward
  const x = clamp(a.left + a.width / 2 - w / 2, 8, vw - w - 8);
  pop.style.left = `${x}px`; pop.style.top = `${bill ? vh - h - 8 : below ? a.bottom + gap : top - gap - h}px`;
  pop.dataset.side = bill ? 'free' : below ? 'below' : 'above'; // free: no arrow (the chip is at the top, the box at the bottom; the dashed ring shows which)
  pop.style.setProperty('--ax', `${clamp(a.left + a.width / 2 - x, 16, w - 16)}px`);
}

// the 3D table moves its labels with an inline transform, after this renders and whenever the camera settles: follow them
const follow = new MutationObserver(place);
let last = -2, lastAt = ''; // the step and the button it pointed at when last shown
export function renderGuide() {
  const pop = $('coach'), i = current(), step = STEPS[i];
  if (i < 0 && replay < 0 && !rec.off && !rec.done && !graduated() && sum(G.state.opened) > 0) { rec.done = 1; save(); document.dispatchEvent(new Event('ptcg:guidedone')); } // the last step just done: once, said by notice.ts
  anchor?.classList.remove('coach-on'); anchor = null; follow.disconnect();
  // an achievement label printing (4.8 s, #ach-pop) has the floor too: the bubble lay over it on 货柜; on a phone the shop's message box too
  const printing = document.getElementById('ach-pop')?.hidden === false || (phone() && document.getElementById('memo')?.hidden === false);
  if (!step || hold || storyOpen() || printing) { if (pop.matches(':popover-open')) pop.hidePopover(); return; } // leave `last` alone: the step that turns up during a pack still gets scrolled to on release
  // the step's own button wherever it is visible (at() only finds shown ones: 开一包's 「开 1 包」 right there on 货柜, the top bar's
  // bill chip on any page), else that page's tab (货柜's 货架 view tab when the player is on its 展示柜 view)
  const here = step.at() ?? step.alt?.() ?? null;
  anchor = here ?? pick(`.subnav a[href="#${step.page}"]`, `.nav a[href="#${step.page}"]`);
  if (!anchor) { if (pop.matches(':popover-open')) pop.hidePopover(); return; }
  anchor.classList.add('coach-on');
  if (step.h === '账单' && !billAt) billAt = Date.now();
  const n = replay >= 0, end = i === STEPS.length - 1;
  render(html`<p class="co-k">${step.h === '补货' ? '新手 · 提醒' : `新手 ${NUMBERED.indexOf(step) + 1}/${NUMBERED.length}`}</p>
    <h3>${step.h}${here || page() === step.page ? nothing : html`<small>：到${page() === 'case' && step.page === 'shelf' ? '「货架」' : `「${TAB[step.page]}」页`}</small>`}</h3>
    <p>${step.p(here)}</p>
    ${!rec.badges && here && SETS.some(s => G.missed(s.id) > 0) ? html`<p class="co-badge">货柜页签的数字不是库存：它记最近 ${G.MISS_WINDOW / 60} 分钟想买的整包没上架的顾客。进货后还要上架。</p>` : nothing}
    <div class="co-btns"><button type="button" class="ghost" data-coach="off">${n ? '关掉' : '跳过引导'}</button>
      ${n ? html`<button type="button" class="ghost" data-coach="next">${end ? '完成' : '下一步'}</button>`
        : step.h === '定价' && here ? html`<button type="button" class="ghost" data-coach="price">先按这个价卖</button>`
        : step.h === '账单' && here ? html`<button type="button" class="ghost" data-coach="bill">下一步</button>` : nothing}</div>`, pop);
  if (!pop.matches(':popover-open')) pop.showPopover();
  // a new step, or the same step on another button (进货 walks one set's 进一架, then the next set's): bring it into view once
  const at = here ? `${(here as HTMLElement).dataset.act ?? ''}:${(here as HTMLElement).dataset.id ?? ''}` : '';
  if ((i !== last || at !== lastAt) && here) seek = performance.now() + 1500;
  if (here) lastAt = at;
  // a key in the box pressed (先按这个价卖, 知道了) and the next step drawn over it: lit reuses the box's first button, so the focus
  // was left on 「跳过引导」 and the next Enter skipped the guide. A new step starts with the focus on the page, not in the box
  if (i !== last && pop.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
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
  document.addEventListener('ptcg:release', renderGuide); document.addEventListener('ptcg:story', renderGuide); document.addEventListener('ptcg:memo', renderGuide);
  document.addEventListener('click', e => {
    const t = e.target as Element, b = t.closest<HTMLElement>('[data-coach], [data-act]'); if (!b) return;
    const badged = !rec.badges && !!$('coach').querySelector('.co-badge')?.getClientRects().length;
    if (badged) { rec.badges = 1; save(); }
    if (b.dataset.act === 'guide') { replay = 0; go(STEPS[0].page); }
    else if (b.dataset.act === 'sharemat') { if (!rec.share) { rec.share = 1; save(); } }
    else if (b.dataset.coach === 'price') { rec.price = 1; save(); }
    else if (b.dataset.coach === 'bill') { rec.bill = 1; save(); }
    else if (b.dataset.coach === 'off') { if (replay < 0) { rec.off = 1; save(); } replay = -1; }
    else if (b.dataset.coach === 'next') { replay = replay + 1 < STEPS.length ? replay + 1 : -1; if (replay >= 0) go(STEPS[replay].page); }
    else { if (badged) queueMicrotask(renderGuide); return; }
    queueMicrotask(renderGuide);
  });
  G.on(renderGuide); renderGuide();
}
