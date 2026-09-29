// When the shop, the story and the interface make a sound (the synthesis is src/fx.ts), and the 声音 panel in the footer.
// Only listens: G.on (customers, the debt beats through debt.ts), page switches, button presses, the story player's lines.
// Nothing here changes the game. Rules: nothing before the first gesture (browsers won't anyway); a pack being revealed or a
// story on screen silences the shop (the mat and the story have the stage); every sound has a minimum gap, so a busy shop
// rings the chime now and then, not per customer.
import { html, render } from 'lit-html';
import * as FX from '../fx.ts';
import { G, $ } from './common.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';
import { debtBeat } from '../debt.ts';

const last: Record<string, number> = {};
// true (and starts the clock) if `k` hasn't played in the last `ms`
const gate = (k: string, ms: number) => { const t = performance.now(); if (t - (last[k] ?? -1e9) < ms) return false; last[k] = t; return true; };
const play = (k: keyof typeof GAP, f: () => void) => { if (gate(k, GAP[k])) f(); };
// minimum gap per sound, ms. The rare dramatic ones are long so the event and the story line about it don't both play it.
const GAP = { ok: 50, back: 50, cursor: 40, page: 60, chime: 10000, till: 5000, sweep: 10000, knock: 20000, calc: 20000, hammer: 20000, shutter: 20000, stamp: 3000, heels: 1500, sack: 3000, flicker: 20000, count: 20000 };

// ---------- the shop: customers through state.recent (newest first), the debt through debt.ts ----------
let seenAt = 0;
const heard = new Set<string>();
function onEmit(ev?: Parameters<Parameters<typeof G.on>[0]>[0]) {
  const fresh = G.state.recent.filter(v => v.at > seenAt); seenAt = G.state.recent[0]?.at ?? seenAt;
  const quiet = hold || storyOpen();
  // more than a few at once is the shop catching up on time it was closed or in the background: one summary, not a peal
  if (!quiet && fresh.length && fresh.length <= 3) {
    const sold = fresh.filter(v => v.r === 'sold'), sweep = sold.some(v => v.t === 'flipper' && (v.n ?? 0) >= 4);
    const rang = gate('chime', GAP.chime); if (rang) FX.chime();
    if (sweep) play('sweep', FX.sweep);
    else if (sold.length && gate('till', GAP.till)) setTimeout(FX.till, rang ? 450 : 0); // the door first, then the till
  }
  const b = debtBeat(ev, G); if (hold || !b || (b.key && heard.has(b.key))) return; // held: bill_due comes again next tick, the rest play in their story
  heard.add(b.key); // bill_due fires every tick inside its window: one knock per bill ('' = loan/bankrupt, every time)
  if (b.kind === 'due') play('knock', FX.knock); // 九姐 at the shutter
  else if (b.kind === 'missed') play('hammer', FX.hammer);
  else if (b.kind === 'loan') play('stamp', FX.stamp);
  else if (b.kind === 'bankrupt') play('shutter', FX.shutter);
}

// ---------- the story: each scene's bed, and cues found in the line's text (so edits to the script keep their sounds) ----------
const CUES: [RegExp, keyof typeof GAP, () => void][] = [
  [/风铃/, 'chime', FX.chime], [/计算器/, 'calc', () => FX.calc(2)], [/锤子/, 'hammer', FX.hammer], [/卷帘门/, 'shutter', FX.shutter],
  [/灯管/, 'flicker', FX.flicker], [/麻袋/, 'sack', FX.sack], [/钞票/, 'count', FX.count], [/收银机叮|叮了一声/, 'till', FX.till], [/敲了/, 'knock', FX.knock],
];
let walked = ''; // the scene 九姐 last walked into
interface Line { id: string; scene: number; line: number; bg: FX.Scene; who: string; text: string }
function onLine(e: Event) {
  const l = (e as CustomEvent<Line>).detail;
  FX.setScene(l.bg);
  if (l.scene || l.line) play('page', FX.page); // the text box turning to its next line (the first line of a story is the story opening)
  const at = `${l.id}.${l.scene}`;
  if (l.who === 'jiu' && walked !== at) { walked = at; play('heels', () => FX.heels(3)); }
  for (const [re, k, f] of CUES) if (re.test(l.text)) play(k, f);
}

// ---------- the 声音 panel (footer button → popover) ----------
function renderPanel() {
  render(html`<h3>声音</h3>
    <label class="sd-row"><input type="checkbox" .checked=${FX.muted()} @change=${(e: Event) => FX.setMuted((e.target as HTMLInputElement).checked)}> 静音</label>
    <label class="sd-row">音量 <input type="range" min="0" max="100" step="5" .value=${String(Math.round(FX.volume() * 100))} ?disabled=${FX.muted()}
      @input=${(e: Event) => FX.setVolume(+(e.target as HTMLInputElement).value / 100)}></label>
    <label class="sd-row"><input type="checkbox" .checked=${FX.ambience()} ?disabled=${FX.muted()} @change=${(e: Event) => FX.setAmbience((e.target as HTMLInputElement).checked)}> 店里的环境声</label>
    <p class="sd-note">环境声是打烊后的店：灯管的嗡嗡声和一点空调风。剧情里的雨声、开包和顾客的声音不受这项影响。</p>`, $('sound'));
  $('sound-btn').textContent = FX.muted() ? '声音 关' : '声音';
}

export function initSound() {
  const wake = () => FX.unlock();
  document.addEventListener('pointerdown', wake, true); document.addEventListener('keydown', wake, true);
  document.addEventListener('visibilitychange', () => FX.pause(document.hidden));
  // the A button: every button outside the mat (its own sounds) and the story (its advance is the text box's page blip)
  document.addEventListener('pointerdown', e => {
    const b = (e.target as Element).closest('button, summary'); if (!b || (b as HTMLButtonElement).disabled || b.closest('#mat, #story')) return;
    play('ok', FX.ok);
  });
  addEventListener('hashchange', () => play('cursor', FX.cursor));
  // the keyboard menu (menu.ts): the cursor moving, a key press on a control, a layer backed out of
  document.addEventListener('ptcg:ui', e => { const k = (e as CustomEvent<'cursor' | 'ok' | 'back'>).detail; play(k, FX[k]); });
  seenAt = G.state.recent[0]?.at ?? 0; // after the boot tick: the time the shop was closed plays nothing
  G.on(onEmit);
  document.addEventListener('ptcg:line', onLine);
  document.addEventListener('ptcg:bought', () => play('stamp', FX.stamp)); // a level lands on the 成长树 (upgrades.ts stamps the node)
  document.addEventListener('ptcg:story', () => { if (!storyOpen()) { walked = ''; FX.setScene(null); } });
  document.addEventListener('ptcg:sound', renderPanel);
  // a week's receipt printing (notice.ts; the paid week's sound waits for it, so a reveal never swallows it): calculator, then till
  document.addEventListener('ptcg:slip', () => { play('calc', () => FX.calc(5)); setTimeout(() => play('till', FX.till), 700); });
  renderPanel();
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __snd: unknown }).__snd = FX;
}
