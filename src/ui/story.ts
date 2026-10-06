// 剧情 player (DESIGN.md「剧情」): a full-screen native <dialog> in the skin — the scene illustration behind, the two portraits
// standing at the edges (the one speaking at full light, the other in shade), and BW's white text box at the bottom with the
// speaker on a dark name plate. Click / Space / Enter advances (the first press finishes the
// typing), Esc or 跳过 ends the scene. Beats are queued and only play when no pack is being revealed, one scene at a time; the
// new-player guide waits until the story is closed (guide.ts listens for ptcg:story).
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money } from './common.ts';
import { SETS } from '../sets.ts';
import { hold } from './mat.ts';
import { SCENES, NAMES, END, BIG_PULL, sceneFor, slipFor, SLIP_NOTES, SLIP_LOAN, SLIP_LATE, type Ctx, type Seen, type Who } from '../story.ts';
import { bill, inDebt, debtBeat } from '../debt.ts';
import { printSlip } from './notice.ts';
import { closing } from './binder.ts';
import * as FX from '../fx.ts';

// Which scenes were seen lives in the save (G.state.feat, keys 'story:<id>'), so a save moved to another browser doesn't replay them
// (a reviewer's moved save replayed 「return」). Saves from before keep their progress in localStorage 'ptcg.story': read once into
// the save, then the old key goes.
const KEY = 'ptcg.story', PRE = 'story:';
let seen: Seen = {};
for (const [k, v] of Object.entries(G.state.feat)) if (k.startsWith(PRE)) seen[k.slice(PRE.length)] = v;
try {
  if (!Object.keys(seen).length) seen = JSON.parse(localStorage.getItem(KEY) || '{}');
  localStorage.removeItem(KEY);
} catch (e) { /* storage blocked: whatever the save holds */ }
const save = () => { const f = G.state.feat; for (const k of Object.keys(f)) if (k.startsWith(PRE)) delete f[k]; for (const [k, v] of Object.entries(seen)) f[PRE + k] = +v || 0; };
save();

const queue: { id: string; ctx: Ctx; key?: string }[] = [];
let cur: { id: string; ctx: Ctx; scene: number; line: number; typed: number } | null = null, timer = 0;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const dlg = () => $('story') as HTMLDialogElement;
export const storyOpen = () => !!cur;

const billCtx = (): Ctx => { const b = bill(G); return b ? { bill: money(b.amount), week: b.week } : {}; };
const text = (c: NonNullable<typeof cur>) => { const t = SCENES[c.id][c.scene].lines[c.line].t; return typeof t === 'string' ? t : t(c.ctx); };

export function play(id: string, ctx: Ctx = {}, key?: string) {
  if (!SCENES[id] || cur?.id === id || queue.some(q => q.id === id)) return; // e.g. the lapse's loan and the bailout's right after it: one scene
  queue.push({ id, ctx, key }); flush();
}
function flush() {
  if (cur || hold || !queue.length) return;
  const q = queue.shift()!;
  if (q.id === 'missed') { // read when it starts (a reveal may have held it): already paid or borrowed → nothing to say
    const o = G.state.overdue; if (!o) return flush();
    q.ctx = { ...q.ctx, short: money(Math.max(0, o.amount - G.state.cash)), rate: `${Math.round(G.loanRate() * 100)}%` };
  }
  seen[q.id] = 1; if (q.key) seen[q.key] = 1; save(); // marked on start, so skipping counts as seen
  cur = { id: q.id, ctx: q.ctx, scene: 0, line: 0, typed: 0 };
  G.pause(true); // the shop's clock stops while a scene plays: no walk-ins, no bill countdown (game.ts pause)
  draw(); dlg().showModal(); type(); watchIdle();
  document.dispatchEvent(new Event('ptcg:story'));
}
function type() {
  clearInterval(timer);
  if (!cur) return;
  const sc = SCENES[cur.id][cur.scene]; // a new line: src/ui/sound.ts plays its scene's bed and the cues in its text
  if (sc.seal && cur.line === 0 && !cur.typed) FX.seal(sc.seal === 'gold'); // the cover shutting and the stamp, in time with the CSS
  document.dispatchEvent(new CustomEvent('ptcg:line', { detail: { id: cur.id, scene: cur.scene, line: cur.line, bg: sc.bg, who: sc.lines[cur.line].who, text: text(cur) } }));
  const full = text(cur).length;
  if (still()) { cur.typed = full; draw(); return; }
  timer = setInterval(() => { if (!cur) return clearInterval(timer); cur.typed = Math.min(full, cur.typed + 1); draw(); if (cur.typed >= full) clearInterval(timer); }, 32);
}
function next() {
  if (!cur) return;
  watchIdle();
  if (cur.typed < text(cur).length) { cur.typed = text(cur).length; clearInterval(timer); draw(); return; }
  const sc = SCENES[cur.id];
  if (++cur.line >= sc[cur.scene].lines.length) { cur.line = 0; if (++cur.scene >= sc.length) return end(); }
  cur.typed = 0; draw(); type();
}
// A scene nobody answers for IDLE_RESUME lets the shop trade on underneath (an idle player on another monitor came back to a shop
// frozen for four minutes by an unlock scene); the next press pauses it again and the scene goes on where it was.
const IDLE_RESUME = 60e3;
let idleT = 0, left = false;
function watchIdle() {
  clearTimeout(idleT);
  if (left) { left = false; G.pause(true); draw(); }
  idleT = window.setTimeout(() => { if (!cur) return; left = true; G.pause(false); draw(); }, IDLE_RESUME);
}
function end() { clearInterval(timer); clearTimeout(idleT); left = false; cur = null; G.pause(false); if (dlg().open) dlg().close(); document.dispatchEvent(new Event('ptcg:story')); setTimeout(flush, 400); }

const SIDE: Partial<Record<Who, string>> = { adou: 'left', jiu: 'right' };
function draw() {
  if (!cur) return;
  const sc = SCENES[cur.id][cur.scene], line = sc.lines[cur.line], full = text(cur), done = cur.typed >= full.length;
  const cast = [...new Set(sc.lines.map(l => l.who))].filter(w => SIDE[w]) as Who[];
  const last = cur.scene === SCENES[cur.id].length - 1 && cur.line === sc.lines.length - 1;
  render(html`${keyed(`${cur.id}.${cur.scene}`, html`<div class="st-scene" data-bg=${sc.bg}></div>`)}
    ${sc.seal && cur.ctx.setId ? keyed(`${cur.id}.${cur.scene}.book`, closing(cur.ctx.setId, sc.seal)) : nothing}
    ${cast.map(w => html`<img class="st-who ${SIDE[w]} ${w === line.who ? 'on' : ''}" src="gen/story/${w}.webp" alt="" @error=${(e: Event) => ((e.target as HTMLElement).hidden = true)}>`)}
    <p class="st-pause">${left ? `一分钟没人看，店照常营业；点一下接着看，再暂停` : '对话期间暂停经营与账单计时'}</p>
    <button type="button" class="ghost st-skip" @click=${(e: Event) => { e.stopPropagation(); end(); }}>跳过</button>
    <div class="st-box ${line.who ? '' : 'narr'}">
      ${line.who ? html`<p class="st-name ${SIDE[line.who] ?? ''}">${NAMES[line.who]}</p>` : nothing}
      <p class="st-text" aria-label=${full}><span aria-hidden="true">${full.slice(0, cur.typed)}</span><span class="st-rest" aria-hidden="true">${full.slice(cur.typed)}</span></p>
      <button type="button" class="st-next ${done ? 'ready' : ''}" autofocus aria-label=${last && done ? END[cur.id] ?? '回店里' : '继续'} @click=${(e: Event) => { e.stopPropagation(); next(); }}>${last && done ? END[cur.id] ?? '回店里' : nothing}</button>
    </div>`, dlg());
}

// milestones that need no debt: the first 大货 pulled, and each set newly unlocked (baseline taken at start, so old saves don't replay)
// forced: a forced loan just settled the bill that is about to be paid (loan_taken comes right before bill_paid);
// missedWeek: the week whose bill went overdue, so its bill_paid is late
let forced = 0, missedWeek = 0;
function onEmit(ev?: Parameters<Parameters<typeof G.on>[0]>[0]) {
  const b = debtBeat(ev, G), late = b?.kind === 'paid' && !!b.week && b.week === missedWeek, id = sceneFor(b, seen, late);
  if (b?.kind === 'missed') missedWeek = b.week ?? 0;
  if (b?.kind === 'loan' && b.forced) forced = b.amount ?? 0;
  else if (b) {
    if (slipFor(b, seen, late)) printSlip({ week: b.week ?? 0, amount: b.amount ?? 0, borrowed: forced, note: forced ? SLIP_LOAN : late ? SLIP_LATE : SLIP_NOTES[(b.week ?? 0) % SLIP_NOTES.length] });
    if (b.kind === 'paid') forced = 0;
  }
  if (id === 'branch') { seen.sets = unlockedSets().length; save(); } // the new shop relocks the later sets: each unlock plays again
  if (b && id) play(id, b.kind === 'story' ? { ...storyCtx(), ...(b.set ? { set: G.setById(b.set).name, fame: G.HAND_FAME, setId: b.set, total: G.dexTotal(b.set), bought: G.dexTotal(b.set) - G.handCount(b.set), tol: `${Math.round(G.MASTER.tol * 100)}%` } : {}) } : { ...billCtx(), ...(b.amount != null ? { bill: money(b.amount) } : {}), ...(b.week ? { week: b.week } : {}) }, b.key || undefined);
  const big = ev?.open?.flat().filter(c => c.price >= BIG_PULL).sort((a, c) => c.price - a.price)[0];
  if (big && !seen.bigpull) play('bigpull', { card: big.name, price: money(big.price) });
  const nowUnlocked = unlockedSets();
  if (nowUnlocked.length > (seen.sets ?? 0)) {
    const fresh = nowUnlocked[nowUnlocked.length - 1]; seen.sets = nowUnlocked.length; save();
    play('unlock', { set: G.setById(fresh).name, nth: nowUnlocked.length });
  }
}
// 还清 / 开分店, read at the moment: before branching, the 名气 this shop would take and the next shop's debt; after, this shop's
const storyCtx = (): Ctx => {
  const s = G.state, n = s.debt ? s.branch.n : s.branch.n + 1;
  return { ...billCtx(), bills: s.billsPaid, fame: G.fameFor() + G.handFame(), shop: s.branch.n + 1, street: G.street(n).name, streetSay: n % G.STREETS.length ? G.street(n).say : undefined, debt: money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * n))) };
};
const unlockedSets = () => SETS.filter(s => G.unlocked(s.id)).map(s => s.id);

function start() {
  if (seen.sets == null) { seen.sets = unlockedSets().length; save(); }
  if (!seen.opening && !seen.return) {
    const old = Object.values(G.state.opened).some(n => n > 0);
    if (!old) play('opening', billCtx());
    else if (inDebt(G)) play('return', billCtx()); // an old save sees 九姐 only once the debt exists (after the economy lands)
  }
}
export function resetStory() { for (const k in seen) delete seen[k]; save(); queue.length = 0; if (cur) end(); setTimeout(start); }

export function initStory() {
  const d = dlg();
  d.addEventListener('click', e => { if (!(e.target as Element).closest('.st-skip')) next(); });
  // Esc / X (menu.ts sends X through the same cancel) is BW's B: finish the line or turn the page, never throw the whole scene
  // away — a first-time player presses it to hurry the text. Only 跳过 (reachable with the arrow keys) ends the scene
  d.addEventListener('cancel', e => { e.preventDefault(); next(); });
  // Escape itself is caught on keydown: Chrome closes a modal dialog on the second Esc without a click in between, whatever the
  // cancel handler says. A key held down (auto-repeat) only finishes the line being typed, like holding BW's B: it never turns a
  // run of pages, nor presses the scene's last key
  d.addEventListener('keydown', e => {
    if (e.repeat && ['Escape', 'Enter', ' ', 'z', 'Z', 'x', 'X'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); if (cur && cur.typed < text(cur).length) next(); return; }
    if (e.key === 'Escape') { e.preventDefault(); next(); }
  });
  d.addEventListener('close', () => { if (cur) end(); }); // closed some other way: still release the guide
  G.on(onEmit);
  document.addEventListener('ptcg:release', () => setTimeout(flush, 600)); // after the pack's summary is on the mat
  document.addEventListener('click', e => { if ((e.target as Element).closest('[data-act="story"]')) play('opening', billCtx()); });
  start();
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __story: unknown }).__story = { play, SCENES };
}
