// 剧情 player (DESIGN.md「剧情」): a full-screen native <dialog> in the skin — the scene illustration behind, the two portraits
// standing at the edges (the one speaking lit by the shop lamp, the other in shade), and the dialogue box at the bottom, a case
// compartment (frame + panel) with the speaker on a name plate. Click / Space / Enter advances (the first press finishes the
// typing), Esc or 跳过 ends the scene. Beats are queued and only play when no pack is being revealed, one scene at a time; the
// new-player guide waits until the story is closed (guide.ts listens for ptcg:story).
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money } from './common.ts';
import { SETS } from '../sets.ts';
import { hold } from './mat.ts';
import { SCENES, NAMES, END, BIG_PULL, sceneFor, type Ctx, type Seen, type Who } from '../story.ts';
import { bill, inDebt, debtBeat } from '../debt.ts';

const KEY = 'ptcg.story';
let seen: Seen = {};
try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* storage blocked: the opening plays each visit */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* ignore */ } };

const queue: { id: string; ctx: Ctx; key?: string }[] = [];
let cur: { id: string; ctx: Ctx; scene: number; line: number; typed: number } | null = null, timer = 0;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const dlg = () => $('story') as HTMLDialogElement;
export const storyOpen = () => !!cur;

const billCtx = (): Ctx => { const b = bill(G); return b ? { bill: money(b.amount), week: b.week } : {}; };
const text = (c: NonNullable<typeof cur>) => { const t = SCENES[c.id][c.scene].lines[c.line].t; return typeof t === 'string' ? t : t(c.ctx); };

export function play(id: string, ctx: Ctx = {}, key?: string) {
  if (!SCENES[id] || queue.some(q => q.id === id)) return;
  queue.push({ id, ctx, key }); flush();
}
function flush() {
  if (cur || hold || !queue.length) return;
  const q = queue.shift()!;
  seen[q.id] = 1; if (q.key) seen[q.key] = 1; save(); // marked on start, so skipping counts as seen
  cur = { id: q.id, ctx: q.ctx, scene: 0, line: 0, typed: 0 };
  draw(); dlg().showModal(); type();
  document.dispatchEvent(new Event('ptcg:story'));
}
function type() {
  clearInterval(timer);
  if (!cur) return;
  const sc = SCENES[cur.id][cur.scene]; // a new line: src/ui/sound.ts plays its scene's bed and the cues in its text
  document.dispatchEvent(new CustomEvent('ptcg:line', { detail: { id: cur.id, scene: cur.scene, bg: sc.bg, who: sc.lines[cur.line].who, text: text(cur) } }));
  const full = text(cur).length;
  if (still()) { cur.typed = full; draw(); return; }
  timer = setInterval(() => { if (!cur) return clearInterval(timer); cur.typed = Math.min(full, cur.typed + 1); draw(); if (cur.typed >= full) clearInterval(timer); }, 32);
}
function next() {
  if (!cur) return;
  if (cur.typed < text(cur).length) { cur.typed = text(cur).length; clearInterval(timer); draw(); return; }
  const sc = SCENES[cur.id];
  if (++cur.line >= sc[cur.scene].lines.length) { cur.line = 0; if (++cur.scene >= sc.length) return end(); }
  cur.typed = 0; draw(); type();
}
function end() { clearInterval(timer); cur = null; if (dlg().open) dlg().close(); document.dispatchEvent(new Event('ptcg:story')); setTimeout(flush, 400); }

const SIDE: Partial<Record<Who, string>> = { adou: 'left', jiu: 'right' };
function draw() {
  if (!cur) return;
  const sc = SCENES[cur.id][cur.scene], line = sc.lines[cur.line], full = text(cur), done = cur.typed >= full.length;
  const cast = [...new Set(sc.lines.map(l => l.who))].filter(w => SIDE[w]) as Who[];
  const last = cur.scene === SCENES[cur.id].length - 1 && cur.line === sc.lines.length - 1;
  render(html`${keyed(`${cur.id}.${cur.scene}`, html`<div class="st-scene" data-bg=${sc.bg}></div>`)}
    ${cast.map(w => html`<img class="st-who ${SIDE[w]} ${w === line.who ? 'on' : ''}" src="gen/story/${w}.webp" alt="" @error=${(e: Event) => ((e.target as HTMLElement).hidden = true)}>`)}
    <button type="button" class="ghost st-skip" @click=${(e: Event) => { e.stopPropagation(); end(); }}>跳过</button>
    <div class="st-box ${line.who ? '' : 'narr'}">
      ${line.who ? html`<p class="st-name ${SIDE[line.who] ?? ''}">${NAMES[line.who]}</p>` : nothing}
      <p class="st-text" aria-label=${full}><span aria-hidden="true">${full.slice(0, cur.typed)}</span><span class="st-rest" aria-hidden="true">${full.slice(cur.typed)}</span></p>
      <button type="button" class="st-next ${done ? 'ready' : ''}" autofocus @click=${(e: Event) => { e.stopPropagation(); next(); }}>${last && done ? END[cur.id] ?? '回店里' : '继续'}</button>
    </div>`, dlg());
}

// milestones that need no debt: the first 大货 pulled, and each set newly unlocked (baseline taken at start, so old saves don't replay)
function onEmit(ev?: Parameters<Parameters<typeof G.on>[0]>[0]) {
  const b = debtBeat(ev, G), id = sceneFor(b, seen);
  if (id === 'branch') { seen.sets = unlockedSets().length; save(); } // the new shop relocks the later sets: each unlock plays again
  if (b && id) play(id, b.kind === 'story' ? storyCtx() : { ...billCtx(), ...(b.amount != null ? { bill: money(b.amount) } : {}), ...(b.week ? { week: b.week } : {}) }, b.key || undefined);
  const big = ev?.open?.flat().filter(c => c.price >= BIG_PULL).sort((a, c) => c.price - a.price)[0];
  if (big && !seen.bigpull) play('bigpull', { card: big.name, price: money(big.price) });
  const nowUnlocked = unlockedSets();
  if (nowUnlocked.length > (seen.sets ?? 0)) {
    const fresh = nowUnlocked[nowUnlocked.length - 1]; seen.sets = nowUnlocked.length; save();
    play('unlock', { set: G.setById(fresh).name });
  }
}
// 还清 / 开分店, read at the moment: before branching, the 名气 this shop would take and the next shop's debt; after, this shop's
const storyCtx = (): Ctx => {
  const s = G.state, n = s.debt ? s.branch.n : s.branch.n + 1;
  return { ...billCtx(), bills: s.billsPaid, fame: G.fameFor(), shop: s.branch.n + 1, debt: money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * n))) };
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
  d.addEventListener('cancel', e => { e.preventDefault(); end(); }); // Esc = skip
  d.addEventListener('close', () => { if (cur) end(); }); // closed some other way: still release the guide
  G.on(onEmit);
  document.addEventListener('ptcg:release', () => setTimeout(flush, 600)); // after the pack's summary is on the mat
  document.addEventListener('click', e => { if ((e.target as Element).closest('[data-act="story"]')) play('opening', billCtx()); });
  start();
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __story: unknown }).__story = { play, SCENES };
}
