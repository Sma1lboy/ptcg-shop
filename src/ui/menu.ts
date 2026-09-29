// BW menus on the keyboard (DESIGN.md「菜单与光标」). The arrow keys move a ▶ cursor between the controls of the layer on top — an
// open dialog or a light-dismiss popover, else the whole page showing (top bar, page, footer) — to the nearest control in that
// direction. Enter / Space / Z press what the cursor is on (Z is the A button next to the arrows); Esc / X back out: the layer on
// top closes (the browser does Esc itself; X goes through the same cancel), with no layer the cursor returns to the page's tab.
// A pointer press hides the cursor; the next arrow key brings it back on whatever has focus. Keys typed into a field, a slider
// (the price rail) or a select are left alone, and so is an arrow a panel already handled (the binder turns pages with ←/→).
// Sounds go through ptcg:ui (sound.ts plays them): cursor on a move, ok on a keyboard press, back on a close.
const ITEMS = 'button:not(:disabled), a[href], summary, [tabindex="0"], input[type="checkbox"]:not(:disabled)';
// controls that use the arrow keys themselves: text fields, the price rail and volume (range), selects
const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable=""], [role="slider"]');
const ui = (k: 'cursor' | 'ok' | 'back') => document.dispatchEvent(new CustomEvent('ptcg:ui', { detail: k }));

// the layer the keys belong to: the last modal dialog or light-dismiss popover that is open (the guide and 凑钱 are manual
// popovers that sit beside the page without taking it over, so they are not layers)
function layer(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>('dialog, [popover]:not([popover="manual"])')].filter(e => e.matches('dialog:modal, :popover-open'));
  return open[open.length - 1] ?? null;
}
const shown = (e: Element) => e.getClientRects().length > 0 && !e.closest('[hidden], [inert]') && getComputedStyle(e).visibility !== 'hidden';
const items = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(ITEMS)].filter(shown);

const cur = document.createElement('i');
cur.className = 'menu-cursor'; cur.setAttribute('aria-hidden', 'true'); cur.hidden = true;
function place() {
  const a = document.activeElement as HTMLElement | null;
  if (cur.hidden || !a || a === document.body || !a.isConnected) { cur.hidden = true; return; }
  // in the top layer the focus sits in (a dialog, any open popover — the guide too), or it would be drawn under it
  const host = a.closest<HTMLElement>('dialog[open], :popover-open') ?? document.body; if (cur.parentElement !== host) host.append(cur);
  const r = a.getBoundingClientRect(), mid = r.top + r.height / 2;
  // a tab (the menu's page tabs, 货柜's view tabs, the binder's pockets) shows where it is by its own focus ring, as BW frames the
  // tab under the cursor: a ▶ beside it would land on the neighbour tab's icon
  cur.classList.toggle('off', !!a.closest('.nav, .subnav, .bk-tabs'));
  // left of the control, the way BW points at a row; when another control sits right there (a row of buttons), inside its left
  // padding instead, so the ▶ never lands on the neighbour
  const next = r.left > 18 && document.elementFromPoint(r.left - 9, mid)?.closest(ITEMS);
  cur.style.left = `${next && next !== a ? r.left + 4 : Math.max(2, r.left - 16)}px`; cur.style.top = `${mid}px`;
}

// the nearest control in the arrow's direction: straight ahead counts more than off to the side
function step(from: HTMLElement, key: string, list: HTMLElement[]) {
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const [dx, dy] = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[key];
  let best: HTMLElement | null = null, bestScore = Infinity, cone = false;
  for (const el of list) {
    if (el === from) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const ahead = (bx - ax) * dx + (by - ay) * dy, side = Math.abs((bx - ax) * dy + (by - ay) * dx);
    if (ahead <= 4) continue;
    // inside a ~63° cone around the arrow beats anything outside it: → from a 3D pack label goes to the rail beside it, not to
    // the footer link that is barely to the right but far below
    const inCone = side <= ahead * 2, score = ahead + side * 2.5;
    if ((inCone && !cone) || (inCone === cone && score < bestScore)) { bestScore = score; best = el; cone = inCone; }
  }
  return best;
}

export function initMenu() {
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    const top = layer(), list = items(top ?? document), a = document.activeElement as HTMLElement | null;
    if (e.key.startsWith('Arrow')) {
      const here = a && list.includes(a) ? a : null;
      const start = () => list.find(el => el.matches('.page:not([hidden]) .primary')) ?? list.find(el => el.matches('.nav a[aria-current="page"]')) ?? list[0];
      const to = here ? step(here, e.key, list) : top ? list[0] : start(); // nothing under the cursor yet: the page's yellow key, else its tab
      e.preventDefault(); // the page does not scroll under the cursor; focus() scrolls the new control into view
      cur.hidden = false;
      if (to && to !== a) { to.focus(); ui('cursor'); }
      place();
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.key === 'Z') {
      if (!a || !a.matches(ITEMS)) return;
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); a.click(); }
      if (!a.closest('#mat, #story')) ui('ok'); // the mat and the story have their own sounds for a press (flip, page)
    } else if ((e.key === 'Escape' || e.key === 'x' || e.key === 'X') && !e.repeat) { // held down, it backs out one level, not all the way
      if (top) {
        ui('back');
        if (e.key !== 'Escape') { // Esc: the browser closes the layer itself (and fires cancel); X takes the same road
          const c = new Event('cancel', { cancelable: true }); top.dispatchEvent(c);
          if (!c.defaultPrevented) top instanceof HTMLDialogElement ? top.close() : top.hidePopover();
        }
      } else if (!cur.hidden) { // no layer: back out to the page's tab, only while the keys are driving (Esc from a mouse user does nothing)
        const tab = document.querySelector<HTMLElement>('.nav a[aria-current="page"]');
        if (tab && tab !== a) { tab.focus(); ui('back'); place(); }
      }
    }
  });
  document.addEventListener('pointerdown', () => { cur.hidden = true; }, true);
  document.addEventListener('focusin', () => requestAnimationFrame(place));
  // the pressed control can vanish (开包 re-renders the mat, a sheet closes): a removed element fires no blur, so the ▶ would stay
  // floating where it was. Re-place on DOM changes while the cursor shows, once a frame
  let queued = false;
  new MutationObserver(() => { if (cur.hidden || queued) return; queued = true; requestAnimationFrame(() => { queued = false; place(); }); })
    .observe(document.body, { childList: true, subtree: true });
  addEventListener('scroll', place, { passive: true, capture: true }); addEventListener('resize', place);
}
