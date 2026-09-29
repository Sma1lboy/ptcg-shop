// 店里的人 (DESIGN.md「店里的人」): a strip of BW indoor floor at the top of 货柜 where the shop's people walk as pixel sprites —
// the owner behind the counter, the clerk once hired, each customer who comes in (from the door on the right to a shelf, a
// balloon over the head: ♪ bought, … too dear, ? found nothing, then back out), and 九姐 with 阿豆 when a bill is settled or
// missed. Pure presentation: reads G.state.recent and the debt beats, never the other way. aria-hidden: the 顾客 panel beside
// it says the same in words. Only while 货柜 is showing and the page is visible; a burst (the shop catching up on time it was
// closed) walks nobody in. Reduced motion: people appear where they stop, say their piece, and fade.
import { G, $ } from './common.ts';
import { debtBeat } from '../debt.ts';

// frame size in sprite pixels (public/gen/walk/w-*.webp: 4 frames side by side — stand, step, stand, other step; facing right)
const SPRITE: Record<string, [number, number]> = { owner: [18, 32], clerk: [16, 31], jiu: [18, 31], adou: [30, 43], opener: [20, 32], seeker: [22, 31], collector: [20, 33], flipper: [28, 39] };
const SAY: Record<string, string> = { sold: '♪', pricey: '…' }; // anything else walked out with nothing: ?
const MAX = 6, SPEED = 110; // guests on the floor at once; screen px per second
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let floor: HTMLElement, seenAt = 0;

function sprite(who: string, cls = '') {
  const [w, h] = SPRITE[who], el = document.createElement('i');
  el.className = `walker ${cls}`; el.style.cssText = `--fw:${w};--fh:${h};background-image:url(gen/walk/w-${who}.webp)`;
  return el;
}
function say(el: HTMLElement, text: string, ms: number) {
  const b = document.createElement('b'); b.className = 'say'; b.textContent = text; el.append(b); setTimeout(() => b.remove(), ms);
}
// walk from where it stands to x (px from the floor's left), facing the way it goes, then next()
function walk(el: HTMLElement, x: number, next: () => void) {
  const from = parseFloat(el.style.left) || 0, secs = Math.abs(x - from) / SPEED;
  el.classList.toggle('left', x < from); el.classList.add('go');
  el.style.transition = `left ${secs}s linear`; el.style.left = `${x}px`;
  setTimeout(() => { el.classList.remove('go'); next(); }, secs * 1000 + 40);
}
// one person in through the door, to x, a line over the head, and out again
function visit(who: string, text: string, x: number, wait = 1100, cls = 'guest') {
  const el = sprite(who, cls), door = floor.clientWidth - 30;
  const gone = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  floor.append(el);
  if (still()) { el.style.left = `${x}px`; say(el, text, 1600); setTimeout(gone, 1800); return; }
  el.style.left = `${door}px`;
  requestAnimationFrame(() => walk(el, x, () => { say(el, text, wait); setTimeout(() => walk(el, door, gone), wait); }));
}

function staff() {
  if (!floor.querySelector('.walker.owner')) { const o = sprite('owner', 'owner'); o.style.left = '26px'; floor.append(o); }
  const clerk = floor.querySelector<HTMLElement>('.walker.clerk');
  if (G.lvl('clerk') && !clerk) { const c = sprite('clerk', 'clerk'); c.style.left = '96px'; floor.append(c); }
  else if (!G.lvl('clerk') && clerk) clerk.remove(); // a new shop (开分店) starts without one
}

function onEmit(ev?: Parameters<Parameters<typeof G.on>[0]>[0]) {
  const fresh = G.state.recent.filter(v => v.at > seenAt); seenAt = G.state.recent[0]?.at ?? seenAt;
  staff();
  if (document.hidden || $('page-shelf').hidden || !floor.clientWidth) return;
  const w = floor.clientWidth, room = w - 200; // the shelves: between the counter and the door
  if (fresh.length <= 3) for (const v of fresh.slice(0, 2)) {
    if (floor.querySelectorAll('.walker.guest').length >= MAX || !SPRITE[v.t]) break;
    visit(v.t, SAY[v.r] ?? '?', 140 + Math.random() * room);
  }
  const b = debtBeat(ev, G);
  if (b && (b.kind === 'paid' || b.kind === 'last' || b.kind === 'missed')) { // 九姐 at the counter, 阿豆 a step behind her
    visit('jiu', b.kind === 'missed' ? '!' : '$', 64, 1800, 'boss');
    setTimeout(() => visit('adou', '…', 104, 1400, 'boss'), 500);
  }
}

export function initWalk() {
  floor = $('floor');
  seenAt = G.state.recent[0]?.at ?? 0; // the time the shop was closed walks nobody in
  staff();
  G.on(onEmit);
}
