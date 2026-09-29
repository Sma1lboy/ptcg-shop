// 新手引导: one popover at a time, pinned next to the button the step is about (DESIGN.md「引导」). The step is read off the game
// state (stock, shelves, packs opened) plus three flags state cannot tell (price looked at, 欧气 visited, skipped), kept in
// localStorage like the mute switch. When the step's button is on another page it points at that page's tab instead. Hidden while
// a pack is being revealed. The footer's 新手引导 replays every step with a 下一步 button.
import { html, render, nothing } from 'lit-html';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';
import { go } from './layout.ts';
import { storyOpen } from './story.ts';

const KEY = 'ptcg.guide';
type Rec = { price?: 1; luck?: 1; off?: 1; share?: 1 };
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
  { page: 'luck', h: '测欧气', done: () => !!rec.luck, at: () => pick('#luck h2', '#luck'),
    alt: () => (rec.share || page() !== 'open' ? null : pick('#mat .summary [data-act="sharemat"]')),
    p: el => ((el as HTMLElement | null)?.dataset.act === 'sharemat' ? '点「分享这次开包」，把这包的价值和排名做成一张图；想看你在几千个模拟玩家里排第几，去「欧气」页。'
      : '看看这包的运气在几千个模拟玩家里排第几，还能生成分享图。') },
];

const TAB: Record<string, string> = { open: '开包', shelf: '货柜', luck: '欧气', grow: '成长' };
let replay = -1; // index while replaying from the footer, else -1
const current = () => (replay >= 0 ? replay : rec.off ? -1 : STEPS.findIndex(s => !s.done()));

let anchor: Element | null = null;
function place() {
  const pop = $('coach');
  if (!pop.matches(':popover-open') || !anchor) return;
  // a button in a pack's summary: open above the whole summary, so the pack's value and rank stay readable
  const a = anchor.getBoundingClientRect(), top = (anchor.closest('.summary') ?? anchor).getBoundingClientRect().top;
  const w = pop.offsetWidth, h = pop.offsetHeight, gap = 12, vw = innerWidth, vh = innerHeight;
  const below = a.bottom + gap + h <= vh - 8 || top - gap - h < 8; // phones: the tabs sit at the bottom, so tab steps open upward
  const x = Math.min(vw - w - 8, Math.max(8, a.left + a.width / 2 - w / 2));
  pop.style.left = `${x}px`; pop.style.top = `${below ? a.bottom + gap : top - gap - h}px`;
  pop.dataset.side = below ? 'below' : 'above';
  pop.style.setProperty('--ax', `${Math.min(w - 16, Math.max(16, a.left + a.width / 2 - x))}px`);
}

let last = -2;
export function renderGuide() {
  const pop = $('coach'), i = current(), step = STEPS[i];
  anchor?.classList.remove('coach-on'); anchor = null;
  if (!step || hold || storyOpen()) { if (pop.matches(':popover-open')) pop.hidePopover(); return; } // leave `last` alone: the step that turns up during a pack still gets scrolled to on release
  // the step's own button when it is on this page, else that page's tab
  const here = page() === step.page ? step.at() : step.alt?.() ?? null;
  anchor = here ?? pick(`.nav a[href="#${step.page}"]`);
  if (!anchor) { if (pop.matches(':popover-open')) pop.hidePopover(); return; }
  anchor.classList.add('coach-on');
  const n = replay >= 0, end = i === STEPS.length - 1;
  render(html`<p class="co-k">新手 ${i + 1}/${STEPS.length}</p>
    <h3>${step.h}${here || page() === step.page ? nothing : html`<small>：到「${TAB[step.page]}」页</small>`}</h3>
    <p>${step.p(here)}</p>
    <div class="co-btns"><button type="button" class="ghost" data-coach="off">${n ? '关掉' : '跳过引导'}</button>
      ${n ? html`<button type="button" class="ghost" data-coach="next">${end ? '完成' : '下一步'}</button>`
        : step.h === '定价' && here ? html`<button type="button" class="ghost" data-coach="price">先按这个价卖</button>` : nothing}</div>`, pop);
  if (!pop.matches(':popover-open')) pop.showPopover();
  place();
  // a new step whose button is below the fold: bring it into view once
  if (i !== last && here) { const r = anchor.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 70) anchor.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  last = i;
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
    else if (b.dataset.coach === 'off') { if (replay < 0) { rec.off = 1; save(); } replay = -1; }
    else if (b.dataset.coach === 'next') { replay = replay + 1 < STEPS.length ? replay + 1 : -1; if (replay >= 0) go(STEPS[replay].page); }
    else return;
    queueMicrotask(renderGuide);
  });
  G.on(renderGuide); renderGuide();
}
