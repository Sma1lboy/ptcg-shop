// 出错条: one panel that throws while drawing must not take the page down with it. safe() runs a render or an init and, if it throws,
// keeps going and says so in a bar at the top: what didn't draw, 重新载入, 导出存档. Uncaught errors and rejections land in the same
// bar. The shop's clock and every other panel go on. Plain DOM, not lit: it must work when a lit template is what broke.
import { downloadSave } from './backup.ts';

const seen = new Set<string>();
let bar: HTMLElement | null = null;

function show(what: string) {
  if (seen.has(what)) return; seen.add(what);
  if (!bar) {
    bar = document.getElementById('oops');
    if (!bar) return;
    bar.querySelector('[data-reload]')!.addEventListener('click', () => location.reload());
    bar.querySelector('[data-save]')!.addEventListener('click', () => downloadSave());
    bar.querySelector('[data-close]')!.addEventListener('click', () => { bar!.hidePopover(); });
  }
  bar.querySelector('.oops-what')!.textContent = `${[...seen].join('、')}出了错，没能正常显示。店里照常营业，进度已经存着。`;
  if (!bar.matches(':popover-open')) bar.showPopover();
}
export function report(e: unknown, what = '页面上有一处') { console.error(e); show(what); }

// Runs fn; a throw is reported under `what` (the panel's name as the player sees it) instead of stopping the caller.
export function safe(what: string, fn: () => void) { try { fn(); } catch (e) { report(e, what); } }

export function initOops() {
  addEventListener('error', e => { if (e.error) report(e.error); }); // resource load failures don't bubble to window; card art has its own fallback
  addEventListener('unhandledrejection', e => report(e.reason));
}
