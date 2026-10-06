// Six pages (货柜 in two views) kept in the DOM, one shown per normalized URL hash; also owns the 成长 nav badge.
// Pages are only hidden, never re-rendered, so a pack mid-reveal on 开包 is exactly where it was when the player comes back.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $ } from './common.ts';
import { growCount } from './upgrades.ts';

const PAGES = ['open', 'shelf', 'case', 'luck', 'grow', 'ach', 'board'];
// a view that lives on another page's section: #case is 货柜's 展示柜 view (index.html data-view), the nav lamp stays on 货柜
const HOME: Record<string, string> = { case: 'shelf' };
// retired hashes still in players' bookmarks: the 收藏室 page became the room above the 展示柜
const ALIAS: Record<string, string> = { collection: 'case' };
const hashPage = () => { const h = location.hash.slice(1); return ALIAS[h] ?? h; };
export const currentPage = () => (PAGES.includes(hashPage()) ? hashPage() : 'open');

// Page ids are page-<name>, not <name>: #shelf and #luck are also panel ids, and a same-named target would make the browser scroll to it.
function route() {
  if (ALIAS[location.hash.slice(1)]) history.replaceState(null, '', `#${hashPage()}`);
  const id = currentPage();
  if (document.documentElement.dataset.page === id) return;
  document.documentElement.dataset.page = id; // the view: guide.ts reads it, style.css shows that view's panels
  const home = HOME[id] ?? id;
  document.querySelectorAll<HTMLElement>('.page').forEach(p => { p.hidden = p.id !== `page-${home}`; });
  document.querySelectorAll('.nav a').forEach(a => { if (a.getAttribute('href') === `#${home}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.querySelectorAll('.subnav a').forEach(a => { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (home === 'shelf') { seen = G.now(); shopLog(id); }
  renderTabs(); scrollTo(0, 0);
}
// 店内动态 is the whole till roll, packs and case cards: it follows the player to the bottom of whichever 货柜 view is open, so the
// 展示柜 view shows its sales too. The <ol> stays lit's render target (log.ts); only its section moves.
function shopLog(view: string) {
  const cols = document.querySelectorAll(`.page-shelf > .col[data-view="${view}"]`), sec = $('log').parentElement!;
  if (cols.length && sec.parentElement !== cols[cols.length - 1]) cols[cols.length - 1].append(sec);
}
export const go = (id: string) => { if (currentPage() !== id) { location.hash = id; route(); } };

// 货柜 dot: while the player is on another page, someone came for a pack that was on no shelf, or balked at a price. It lights only
// for what happened since they last looked at 货柜, and the number is the one the shelf page shows (G.missed over the window).
let seen = G.now();
function shelfDot() {
  const el = $('shelf-n'), s = G.state;
  const fresh = (HOME[currentPage()] ?? currentPage()) !== 'shelf' && (Object.values(s.miss).some(ts => ts.some(t => t > seen)) || s.recent.some(v => v.at > seen && v.r === 'pricey'));
  const n = SETS.reduce((a, x) => a + G.missed(x.id), 0);
  el.hidden = !fresh; el.classList.toggle('bare', !n);
  el.title = n ? `最近 ${G.MISS_WINDOW / 60} 分钟，${n} 位顾客想买的整包没上架；不是库存数量` : '有顾客嫌标价贵，去货柜查看价格反馈';
  render(html`${n || ''}<span class="visually-hidden">${n ? ` 位顾客没买到` : ' 有顾客嫌贵走了'}</span>`, el);
}

// 成长 badge: how many things on 成长 are yellow right now (upgrades.ts growCount: levels 闲钱 covers — cash beyond the next bill,
// counting bare cash beckoned first-timers into spending the first bill's money — perks the 名气 on hand covers, and 开分店).
export function renderTabs() {
  const n = growCount(), el = $('grow-n');
  el.hidden = !n; render(html`${n}<span class="visually-hidden"> 项买得起</span>`, el);
  el.title = `成长页有 ${n} 项可选；升级只计留好账款后买得起的项目`;
  shelfDot();
}

export function bindLayout() {
  addEventListener('hashchange', route); route();
  // Opening a pack from any page lands on 开包 first. Capture phase: the page must be visible before events.ts mounts the 3D table,
  // or the table would be sized against a hidden (0×0) host.
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (b && /^(open1|open10|fill10|buyopen|autorun)$/.test(b.dataset.act!)) go('open');
  }, true);
}
