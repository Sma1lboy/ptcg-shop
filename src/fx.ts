// Sound (WebAudio, all synthesized, unlocked by a user gesture), plus the opening mat's hit bursts and holo tilt.
// Pure presentation: never reads game state, never influences what a pack contains. src/ui/sound.ts decides when the shop,
// story and interface sounds play; the mat (ui/mat.ts, table3d.js) calls the opening sounds directly.
// Signal path: every sound → a bus (mat: the opening; shop: customers, bills, the interface; amb: the looping beds) → master
// (volume, mute) → a compressor, so a burst of sounds on top of each other can't clip.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
type Bus = 'mat' | 'shop' | 'amb';
let ctx: AudioContext | null = null, master: GainNode, buses: Record<Bus, GainNode>, silent = false, vol = 1, amb = true;
const get = (k: string) => { try { return localStorage.getItem(k); } catch (e) { return null; } }; // storage blocked: defaults
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
silent = get('ptcg.mute') === '1'; vol = Math.min(1, Math.max(0, +(get('ptcg.vol') ?? 1) || 0)); amb = get('ptcg.amb') !== '0';
const level = () => (silent ? 0 : vol * vol); // perceived loudness is roughly the square of the slider
const changed = () => document.dispatchEvent(new Event('ptcg:sound')); // the sound panel and the mat's 音效 button redraw

// Must be called synchronously from a click/key handler; timers later can't create a running context.
export function unlock() {
  if (silent) return;
  const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!A) return;
  if (!ctx) {
    ctx = new A();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -3; comp.knee.value = 3; comp.ratio.value = 12; // a limiter: transparent below −3 dB, so the opening keeps its dynamics comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = level(); master.connect(comp);
    buses = { mat: ctx.createGain(), shop: ctx.createGain(), amb: ctx.createGain() };
    buses.amb.gain.value = 0; Object.values(buses).forEach(b => b.connect(master));
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().then(bed); else bed();
}
const live = () => (!silent && ctx && ctx.state === 'running' ? ctx : null);

function tone(f: number, at: number, dur: number, { type = 'sine' as OscillatorType, gain = .12, to = 0, bus = 'mat' as Bus } = {}) {
  const c = live(); if (!c) return;
  const t = c.currentTime + at, o = c.createOscillator(), v = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain, t + .01); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v).connect(buses[bus]); o.start(t); o.stop(t + dur + .02);
}
function noise(at: number, dur: number, { gain = .1, from = 2000, to = 600, q = 1, bus = 'mat' as Bus } = {}) {
  const c = live(); if (!c) return;
  const t = c.currentTime + at, len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain, t + Math.min(.02, dur / 3)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(v).connect(buses[bus]); s.start(t);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;
const arp = (notes: number[], step: number, o: Parameters<typeof tone>[3]) => notes.forEach((f, i) => tone(f, i * step, .5, o));

// t = rarity tier from ui/common.ts (0 bulk … 5 SIR/HR)
export function flip(t: number) {
  noise(0, .09, { gain: .11, from: 2600, to: 700 });
  if (t === 1) tone(A5, .03, .25, { type: 'triangle', gain: .05 });
  if (t === 2) { tone(A5, 0, .5, { gain: .09 }); tone(E6, .09, .6, { gain: .08 }); noise(.12, .6, { gain: .03, from: 5000, to: 8000 }); } // the shimmer: the foil tilting into the lamp (table3d.js tilt)
  if (t === 3) { arp([C5, E5, G5, C6], .07, { type: 'triangle', gain: .1 }); noise(.1, .5, { gain: .05, from: 5000, to: 9000 }); }
  if (t >= 4) {
    arp([C5, E5, G5, C6, E6].concat(t === 5 ? [G6] : []), .075, { type: 'triangle', gain: .11 });
    tone(70, 0, .5, { gain: .25, to: 38 });
    noise(.05, .9, { gain: .07, from: 4000, to: 11000 });
    if (t === 5) [C6, E6, G6].forEach(f => tone(f, .5, 1.4, { gain: .06 }));
  }
}
export const tear = () => { noise(0, .3, { gain: .16, from: 3200, to: 900, q: .7 }); noise(.05, .12, { gain: .12, from: 6000, to: 2000 }); };
export const swell = (ms: number) => noise(0, ms / 1000, { gain: .06, from: 300, to: 3500, q: 2 }); // rising hiss under the slow last flip
export const crinkle = () => noise(0, .04 + Math.random() * .05, { gain: .06, from: 3500 + Math.random() * 3500, to: 1400, q: .8 }); // foil giving way under a drag
export const slide = () => noise(0, .14, { gain: .035, from: 1600, to: 4200, q: 1.3 }); // card sliding off the stack
export const miss = () => { tone(330, 0, .35, { type: 'sawtooth', gain: .05, to: 220 }); tone(247, .3, .5, { type: 'sawtooth', gain: .05, to: 150 }); };

// Sparkles fly out of `host` (must be position: relative); rays behind the card from tier 4.
export function burst(host: Element | null, t: number) {
  if (t < 2 || reduced() || !host) return;
  const b = document.createElement('div'); b.className = `fx-burst b${t}`;
  if (t >= 4) b.innerHTML = '<i class="rays"></i>';
  const n = [0, 0, 10, 16, 28, 40][t];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * (60 + t * 28);
    const s = document.createElement('span');
    s.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--s:${(3 + Math.random() * (2 + t)).toFixed(1)}px;--t:${(Math.random() * 160).toFixed(0)}ms`;
    b.append(s);
  }
  host.prepend(b);
  if (t >= 3) { host.classList.add('fx-shake'); setTimeout(() => host.classList.remove('fx-shake'), 500); }
  setTimeout(() => b.remove(), 1900);
}

// Holo tilt on the inspected card: sets --rx/--ry (rotation) and --mx/--my (sheen position).
const tilting = (e: Event) => (e.target as Element).closest?.<HTMLElement>('.stage .card.up');
document.addEventListener('pointermove', e => {
  const c = tilting(e); if (!c || reduced()) return;
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  c.style.setProperty('--ry', ((x - .5) * 24).toFixed(1) + 'deg'); c.style.setProperty('--rx', ((.5 - y) * 24).toFixed(1) + 'deg');
  c.style.setProperty('--mx', (x * 100).toFixed(0) + '%'); c.style.setProperty('--my', (y * 100).toFixed(0) + '%');
});
document.addEventListener('pointerout', e => {
  const c = tilting(e); if (!c || c.contains(e.relatedTarget as Node | null)) return;
  ['--rx', '--ry', '--mx', '--my'].forEach(p => c.style.removeProperty(p));
});

export const muted = () => silent;
export function setMuted(v: boolean) {
  silent = !!v; put('ptcg.mute', v ? '1' : '0');
  if (ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, .05); // a ramp, not a jump: a jump clicks
  if (!v) unlock(); changed();
}
export const volume = () => vol;
export function setVolume(v: number) { vol = Math.min(1, Math.max(0, v)); put('ptcg.vol', String(vol)); if (ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, .05); changed(); }
export const ambience = () => amb;
export function setAmbience(v: boolean) { amb = !!v; put('ptcg.amb', v ? '1' : '0'); bed(); changed(); }
// The tab hidden: stop the clock (the beds included); back: carry on. Resume needs no gesture once the page has had one.
export function pause(p: boolean) { if (!ctx || silent) return; if (p) ctx.suspend(); else ctx.resume().then(bed); }

// ---------- shop and interface (bus 'shop'; src/ui/sound.ts calls these and rate-limits them) ----------
const S = { bus: 'shop' as Bus };
// the interface speaks BW: short square-wave blips, not objects. Pitches sit on the chime's scale so the shop never clashes.
// ok: the A button — a quick rising pair; back: the B button — the same pair falling; cursor: the ▶ moving to another row or
// tab; page: a text box line advancing
export const ok = () => { tone(1568, 0, .035, { ...S, type: 'square', gain: .018 }); tone(2093, .035, .06, { ...S, type: 'square', gain: .018 }); };
export const back = () => { tone(1568, 0, .035, { ...S, type: 'square', gain: .016 }); tone(1175, .035, .06, { ...S, type: 'square', gain: .016 }); };
export const cursor = () => tone(1760, 0, .03, { ...S, type: 'square', gain: .014 });
export const page = () => tone(1318.5, 0, .045, { ...S, type: 'square', gain: .016 });
// the door's wind chime: three random rods of a pentatonic set, each with its inharmonic partial (×2.76), long ring
const ROD = [1568, 1760, 2093, 2349, 2637];
export function chime() {
  for (let i = 0; i < 3; i++) {
    const f = ROD[Math.floor(Math.random() * ROD.length)], at = i * (.06 + Math.random() * .1);
    tone(f, at, 1.6, { ...S, gain: .028 }); tone(f * 2.76, at, .6, { ...S, gain: .008 });
  }
}
// the till: drawer thunk, the bell (a high sine and its fifth), a couple of coins settling
export function till() {
  noise(0, .06, { ...S, gain: .06, from: 800, to: 350, q: .8 }); tone(120, 0, .08, { ...S, gain: .08, to: 70 });
  tone(2637, .05, .7, { ...S, gain: .045 }); tone(3951, .05, .35, { ...S, gain: .015 });
  [.14, .21].forEach(at => noise(at + Math.random() * .04, .03, { ...S, gain: .02, from: 7000, to: 5000, q: 6 }));
}
// 倒爷 sweeping a shelf: packs dragged off the shelf into a bag, then one big ring-up
export function sweep() {
  for (let i = 0; i < 6; i++) noise(i * .075, .07, { ...S, gain: .04, from: 2400 + Math.random() * 1800, to: 900, q: .7 });
  setTimeout(till, 480);
}
// calculator keys: short plastic clicks with the faint beep a cheap desk calculator gives
export function calc(n = 4) {
  for (let i = 0; i < n; i++) { const at = i * (.1 + Math.random() * .05); noise(at, .018, { ...S, gain: .04, from: 4200, to: 2600, q: 3 }); tone(2400, at, .04, { ...S, type: 'square', gain: .006 }); }
}
// knocking on the shutter: three knuckle raps on corrugated steel (thud + short rattle)
export function knock() {
  [0, .19, .36].forEach((at, i) => { tone(150, at, .09, { ...S, gain: .16 - i * .02, to: 90 }); noise(at, .09, { ...S, gain: .05, from: 1100, to: 400, q: 1.2 }); });
}
// 阿豆's hammer on the counter: a heavy thud, the head's crack, the metal ringing on; two blows
export function hammer() {
  [0, .5].forEach(at => { tone(95, at, .18, { ...S, gain: .3, to: 42 }); noise(at, .05, { ...S, gain: .1, from: 2600, to: 800, q: .8 }); tone(3100, at + .01, .45, { ...S, gain: .012 }); });
}
// the rolling shutter coming down: a rattle (noise chopped by a fast square wave) falling in pitch, then the bottom rail hits
export function shutter() {
  const c = live(); if (!c) return;
  const t = c.currentTime, dur = 1.6, len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain(), chop = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
  lfo.type = 'square'; lfo.frequency.setValueAtTime(22, t); lfo.frequency.linearRampToValueAtTime(14, t + dur); depth.gain.value = .5; chop.gain.value = .5;
  lfo.connect(depth).connect(chop.gain);
  v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(.09, t + .1); v.gain.setValueAtTime(.09, t + dur - .15); v.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(chop).connect(v).connect(buses.shop); s.start(t); lfo.start(t); lfo.stop(t + dur);
  tone(70, dur - .05, .35, { ...S, gain: .3, to: 38 }); noise(dur - .05, .12, { ...S, gain: .08, from: 900, to: 250 });
}
// 收齐 (ui/story.ts, the seal scene; times match the CSS in style.css「收齐」): the binder's padded cover landing shut at 0.85 s
// (a soft low thump and the air it pushes out), the hot-foil press coming down at 1.5 s (a heavier thud, the platen's hiss), then
// the foil catching the lamp: gold rings a four-note run, silver two notes
export function seal(gold: boolean) {
  tone(88, .85, .24, { ...S, gain: .22, to: 48 }); noise(.85, .2, { ...S, gain: .05, from: 520, to: 180, q: .6 });
  tone(120, 1.5, .16, { ...S, gain: .3, to: 45 }); noise(1.5, .05, { ...S, gain: .09, from: 2600, to: 700, q: .8 }); noise(1.55, .5, { ...S, gain: .022, from: 5000, to: 7500, q: .5 });
  (gold ? [C6, E6, G6, C6 * 2] : [G5, C6]).forEach((f, i) => tone(f, 1.85 + i * .1, 1.2, { ...S, type: 'triangle', gain: .06 }));
}
// a rubber stamp on paper (the loan's IOU)
export const stamp = () => { tone(160, 0, .09, { ...S, gain: .18, to: 60 }); noise(0, .045, { ...S, gain: .06, from: 3000, to: 800, q: .7 }); };
// 九姐's heels on the tiled floor: n clicks at a walking pace, each a hard tick over a small body
export function heels(n = 4) {
  for (let i = 0; i < n; i++) { const at = i * (.3 + Math.random() * .04), g = .03 + i * .008; noise(at, .025, { ...S, gain: g, from: 4200, to: 2800, q: 3 }); tone(340, at, .04, { ...S, gain: g, to: 220 }); }
}
// a burlap sack: coarse cloth rubbing, twice
export const sack = () => [0, .3].forEach(at => noise(at, .4, { ...S, gain: .05, from: 700, to: 1800, q: .6 }));
// the tube light struggling on: three buzzing blips (mains hum through a saw), the room tone takes over after
export const flicker = () => [0, .22, .38].forEach((at, i) => tone(100, at, i === 2 ? .2 : .07, { ...S, type: 'sawtooth', gain: .03 }));
// cash counted on a counter: quick flicks of paper
export const count = () => { for (let i = 0; i < 7; i++) noise(i * .09, .04, { ...S, gain: .03, from: 2600, to: 1500, q: 1.5 }); };

// ---------- looping beds (bus 'amb'): the shop's room tone, or the story scene's (rain on the street, the car in the sack) ----------
export type Scene = 'shop' | 'street' | 'dark';
let scene: Scene | null = 'shop', story = false, beds: Partial<Record<Scene, GainNode>> = {}, drops = 0;
const BED_GAIN: Record<Scene, number> = { shop: .5, street: 1, dark: .9 };
function loop(c: AudioContext, secs: number, brown: boolean) { // a looping noise buffer; brown = integrated (a deep rumble), else white
  const len = c.sampleRate * secs, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = brown ? (last = (last + .02 * w) / 1.02) * 3.5 : w; }
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s;
}
function build(c: AudioContext, k: Scene) {
  const g = c.createGain(); g.gain.value = 0; g.connect(buses.amb);
  const filt = (type: BiquadFilterType, f: number, q = .7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const src = (n: AudioScheduledSourceNode, ...chain: AudioNode[]) => { chain.reduce((a: AudioNode, b) => (a.connect(b), b), n).connect(g); n.start(); };
  const lvl = (v: number) => { const x = c.createGain(); x.gain.value = v; return x; };
  if (k === 'shop') { // a closed room at night: low air, the tube light's 100 Hz hum and its faint 200 Hz buzz
    src(loop(c, 3, true), filt('lowpass', 220), lvl(.05));
    const h = c.createOscillator(); h.frequency.value = 100; src(h, lvl(.006));
    const b = c.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 200; src(b, filt('lowpass', 900), lvl(.0015));
  } else if (k === 'street') { // rain: a wide hiss (white, band-limited) over a low wash; drops are ticked in by drip()
    src(loop(c, 3, false), filt('highpass', 900), filt('lowpass', 6500), lvl(.03));
    src(loop(c, 3, true), filt('lowpass', 500), lvl(.05));
  } else { // inside the sack in a moving car: engine rumble and road noise, muffled
    src(loop(c, 3, true), filt('lowpass', 160), lvl(.12));
    const e = c.createOscillator(); e.frequency.value = 42; src(e, lvl(.02));
  }
  return g;
}
const drip = () => { if (scene === 'street') noise(0, .02, { bus: 'amb', gain: .015 + Math.random() * .03, from: 3000 + Math.random() * 4000, to: 1500, q: 4 }); };
// Crossfades to whatever should be playing now: the story's scene while a story is on, else the room tone if 店内环境声 is on.
function bed() {
  const c = live(); if (!c) return;
  const want: Scene | null = story ? scene : amb ? 'shop' : null;
  (Object.keys(BED_GAIN) as Scene[]).forEach(k => {
    const on = k === want; if (on && !beds[k]) beds[k] = build(c, k);
    beds[k]?.gain.setTargetAtTime(on ? BED_GAIN[k] : 0, c.currentTime, on ? .6 : .3);
  });
  buses.amb.gain.setTargetAtTime(want ? 1 : 0, c.currentTime, .3);
  clearInterval(drops); if (want === 'street') drops = window.setInterval(() => { if (Math.random() < .6) drip(); }, 90);
}
// the story player's scene (null: the story closed, back to the shop)
export function setScene(k: Scene | null) { story = !!k; scene = k; bed(); }

// 成就: the grading label printing (a dot-matrix chatter), then pressed onto its slab: a dull thud and the paper's slap.
// A 金标 / 黑标 (big) also rings: a bright four-note bell run once the label is down.
export const award = (big = false) => {
  for (let i = 0; i < 8; i++) noise(i * .028, .02, { gain: .025, from: 2600, to: 2200, q: 5 });
  tone(110, .26, .18, { gain: .28, to: 45 }); noise(.26, .06, { gain: .1, from: 1200, to: 300, q: .6 });
  if (big) { [G5, C6, E6, G6].forEach((f, i) => tone(f, .5 + i * .09, .9, { type: 'triangle', gain: .07 })); noise(.6, .7, { gain: .03, from: 5000, to: 9000 }); }
};
