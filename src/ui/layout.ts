// Page layout behaviour (DESIGN.md「布局」): the right column's binder tabs, and on phones the playmat as a full-screen layer.
import { html, render } from 'lit-html';
import { G, $ } from './common.ts';

// Tabs: click or arrow keys; the selected tab is the only one in the tab order.
function bindTabs() {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')];
  const pick = (t: HTMLButtonElement, focus?: boolean) => tabs.forEach(x => {
    const on = x === t;
    x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
    $(x.getAttribute('aria-controls')!).hidden = !on;
    if (on && focus) x.focus();
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
}

// Phones: the mat takes no room until a pack opens, then covers the page under the top bar (which keeps cash and a way back).
// The rest of the page is inert and the scroll position is kept, so closing lands the player where they tapped.
const phone = matchMedia('(max-width: 779px)');
const behind = () => document.querySelectorAll<HTMLElement>('.shelf, .side, .foot');
let from: HTMLElement | null = null;
function openMat(trigger: HTMLElement) {
  const root = document.documentElement;
  if (!phone.matches || root.classList.contains('mat-open')) return;
  from = trigger; root.classList.add('mat-open'); behind().forEach(el => { el.inert = true; });
  document.querySelector<HTMLElement>('.mat-close')!.focus();
}
function closeMat() {
  const root = document.documentElement;
  if (!root.classList.contains('mat-open')) return;
  root.classList.remove('mat-open'); behind().forEach(el => { el.inert = false; });
  from?.focus({ preventScroll: true }); from = null;
}

// 成长 tab badge: how many upgrades / skills the cash on hand can buy right now (the incremental loop's nudge).
export function renderTabs() {
  const cash = G.state.cash, el = $('grow-n');
  const n = Object.keys(G.UPGRADES).filter(k => { const c = G.upgradeCost(k); return c != null && cash >= c; }).length
    + Object.keys(G.SKILLS).filter(k => { const c = G.skillCost(k); return c != null && G.canLearn(k) && cash >= c; }).length;
  el.hidden = !n; render(html`${n}<span class="visually-hidden"> 项买得起</span>`, el);
}

export function bindLayout() {
  bindTabs();
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]'); if (!b) return;
    if (/^(open1|open10|buyopen)$/.test(b.dataset.act!)) openMat(b);
    else if (b.dataset.act === 'closemat') closeMat();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMat(); });
  phone.addEventListener('change', () => { if (!phone.matches) closeMat(); });
}
