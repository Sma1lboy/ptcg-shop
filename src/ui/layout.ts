// Page layout behaviour (DESIGN.md「布局」): five pages (货柜 in two views) kept in the DOM, one shown per URL hash, and the 成长 nav badge.
// Pages are only hidden, never re-rendered, so a pack mid-reveal on 开包 is exactly where it was when the player comes back.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $ } from './common.ts';

const PAGES = ['open', 'shelf', 'case', 'luck', 'grow', 'ach'];
// a view that lives on another page's section: #case is 货柜's 展示柜 view (index.html data-view), the nav lamp stays on 货柜
const HOME: Record<string, string> = { case: 'shelf' };
const current = () => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'open');

// Page ids are page-<name>, not <name>: #shelf and #luck are also panel ids, and a same-named target would make the browser scroll to it.
function route() {
  const id = current();
  if (document.documentElement.dataset.page === id) return;
  document.documentElement.dataset.page = id; // the view: guide.ts reads it, style.css shows that view's panels
  const home = HOME[id] ?? id;
  document.querySelectorAll<HTMLElement>('.page').forEach(p => { p.hidden = p.id !== `page-${home}`; });
  document.querySelectorAll('.nav a').forEach(a => { if (a.getAttribute('href') === `#${home}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.querySelectorAll('.subnav a').forEach(a => { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (home === 'shelf') { seen = Date.now(); shopLog(id); }
  renderTabs(); scrollTo(0, 0);
}
// 店内动态 is the whole till roll, packs and case cards: it follows the player to the bottom of whichever 货柜 view is open, so the
// 展示柜 view shows its sales too. The <ol> stays lit's render target (log.ts); only its section moves.
function shopLog(view: string) {
  const cols = document.querySelectorAll(`.page-shelf > .col[data-view="${view}"]`), sec = $('log').parentElement!;
  if (cols.length && sec.parentElement !== cols[cols.length - 1]) cols[cols.length - 1].append(sec);
}
export const go = (id: string) => { if (current() !== id) { location.hash = id; route(); } };

// 货柜 dot: while the player is on another page, someone came for a pack that was on no shelf, or balked at a price. It lights only
// for what happened since they last looked at 货柜, and the number is the one the shelf page shows (G.missed over the window).
let seen = Date.now();
function shelfDot() {
  const el = $('shelf-n'), s = G.state;
  const fresh = (HOME[current()] ?? current()) !== 'shelf' && (Object.values(s.miss).some(ts => ts.some(t => t > seen)) || s.recent.some(v => v.at > seen && v.r === 'pricey'));
  const n = SETS.reduce((a, x) => a + G.missed(x.id), 0);
  el.hidden = !fresh; el.classList.toggle('bare', !n);
  render(html`${n || ''}<span class="visually-hidden">${n ? ` 位顾客没买到` : ' 有顾客嫌贵走了'}</span>`, el);
}

// 成长 badge: how many upgrades / skills the cash on hand can buy right now (the incremental loop's nudge), plus 开分店 once the
// debt is paid (it costs nothing, and 成长's 下一步 names it then).
export function renderTabs() {
  const cash = G.state.cash, el = $('grow-n');
  const n = Object.keys(G.UPGRADES).filter(k => { const c = G.upgradeCost(k); return c != null && cash >= c; }).length
    + Object.keys(G.SKILLS).filter(k => { const c = G.skillCost(k); return c != null && G.canLearn(k) && cash >= c; }).length
    + (G.canBranch() ? 1 : 0);
  el.hidden = !n; render(html`${n}<span class="visually-hidden"> 项买得起</span>`, el);
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
