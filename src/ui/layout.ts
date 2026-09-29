// Page layout behaviour (DESIGN.md「布局」): four pages kept in the DOM, one shown per URL hash, and the 成长 nav badge.
// Pages are only hidden, never re-rendered, so a pack mid-reveal on 开包 is exactly where it was when the player comes back.
import { html, render } from 'lit-html';
import { G, $ } from './common.ts';

const PAGES = ['open', 'shelf', 'luck', 'grow', 'ach'];
const current = () => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'open');

// Page ids are page-<name>, not <name>: #shelf and #luck are also panel ids, and a same-named target would make the browser scroll to it.
function route() {
  const id = current();
  if (document.documentElement.dataset.page === id) return;
  document.documentElement.dataset.page = id;
  document.querySelectorAll<HTMLElement>('.page').forEach(p => { p.hidden = p.id !== `page-${id}`; });
  document.querySelectorAll('.nav a').forEach(a => { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  scrollTo(0, 0);
}
export const go = (id: string) => { if (current() !== id) { location.hash = id; route(); } };

// 成长 badge: how many upgrades / skills the cash on hand can buy right now (the incremental loop's nudge).
export function renderTabs() {
  const cash = G.state.cash, el = $('grow-n');
  const n = Object.keys(G.UPGRADES).filter(k => { const c = G.upgradeCost(k); return c != null && cash >= c; }).length
    + Object.keys(G.SKILLS).filter(k => { const c = G.skillCost(k); return c != null && G.canLearn(k) && cash >= c; }).length;
  el.hidden = !n; render(html`${n}<span class="visually-hidden"> 项买得起</span>`, el);
}

export function bindLayout() {
  addEventListener('hashchange', route); route();
  // Opening a pack from any page lands on 开包 first. Capture phase: the page must be visible before events.ts mounts the 3D table,
  // or the table would be sized against a hidden (0×0) host.
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (b && /^(open1|open10|buyopen)$/.test(b.dataset.act!)) go('open');
  }, true);
}
