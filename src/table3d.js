// Opening mat as a live three.js scene: a foil booster on a rubber playmat, tear the crimp, the stack slides out,
// slide the front card aside to uncover the next, foil shaders on the cards, a show scaled to the pull's rarity.
// Pure presentation: it renders exactly the cards it is handed (one pack, or up to ten plus which of their cards to show), and
// reports progress through callbacks. It never reads the game or src/sim.ts and has no say in what a pack contains.
// Before the first pack it shows every set's sealed packs on the mat (showShelf); which ones and how many is mat.ts's call.
// Plain JS (tsconfig allowJs, not type-checked). Interface, used by src/ui/mat.ts:
//   mountTable(el, { onTear, onFlip(i, card, quiet), onDone, onPick?(k), onLost?, onHold?, reducedMotion })
//     → { showShelf(items), hover(k), showPack(set, cards), showBatch(set, packs, picks), flip(i), flipAll(), resize(), dispose() } | null
//   (quiet: turned in a sweep with others, no caption or flip sound of its own; onHold: a batch's best card is being lifted face down, the caption of the previous one should go;
//    onPick(k): shelf item k's pack was tapped. showShelf items: [{ set, n (packs in the stack), off (can't be opened) }])
// three.js: node_modules in dev, the import map vite.config.ts injects in builds (CDN, same pinned version). mountTable returns
// null while three is still loading, if it failed to load, or without WebGL; mat.ts then keeps the 2D mat.
import * as fx from './fx.ts';
import * as ASSETS from './assets.ts';
import { SETS } from './sets.ts';
import { FOIL, cap, toHTML, back as backSVG, energy as energySVG, stock as stockSVG } from './ui/card.ts';
import { money } from './ui/common.ts';
// Animation-synced sounds (crinkle, slide, swell) come from src/fx.ts; flip and tear sounds are ui/mat.ts's, via the callbacks.
const FX = () => fx;
let T, M;
// Literal specifiers so Vite resolves them: node_modules in dev, the CDN import map in builds (still lazy: a failed CDN only costs the 3D mat).
// ready: true once three.js is in (mountTable can then run), false if it failed; ui/mat.ts waits on it to swap the idle mat to 3D.
export const ready = Promise.all([import('three'), import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
  import('three/addons/postprocessing/OutputPass.js'), import('three/addons/environments/RoomEnvironment.js'), import('three/addons/utils/BufferGeometryUtils.js')])
  .then(([three, ...addons]) => { T = three; M = Object.assign({}, ...addons); return true; })
  .catch(e => { console.warn('[table3d] three.js did not load; the 2D mat stays', e); return false; });
// Rarity tier drives the show: 0 bulk, 1 reverse/holo rare, 2 RR/ACE/Poké Ball/foil energy, 3 UR, 4 IR/Master Ball, 5 SIR/HR/MHR.
const TIER = { R: 1, REV: 1, RR: 2, ACE: 2, PB: 2, FE: 2, UR: 3, IR: 4, MB: 4, SIR: 5, HR: 5, MHR: 5 };
const tierOf = c => TIER[c.kind] || 0;
const small = () => matchMedia('(max-width: 779px), (pointer: coarse)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Real sizes in cm: a card is 63×88 mm with 3 mm corners; an SV booster is about 74×128 mm with ~9.5 mm crimps.
const CW = 6.3, CH = 8.8, CT = 0.032, CR = 0.32, PW = 7.4, PH = 12.8, CRIMP = 0.95, TEAR = PH / 2 - 1.25, PUFF = 0.42;
const MW = 64, MH = 54, MZ = -8; // playmat size and where its centre sits: the shelf, the single-pack spread and the fan stay on it; a ten-pack deal's back row reaches the counter
const CZ0 = 34, CZ1 = -60, CX = 72; // the counter top: near edge (under the player's hands), back edge, half width
const SW = 30, SH = 15, SD = 12, SX = 1, SZ = -46; // the glass showcase behind the mat: width, glass height (on a 2.2 plinth), depth, centre
const FOV = 30, TAN = Math.tan(FOV / 2 * Math.PI / 180), PITCH = 0.74, SPREAD_PITCH = .9, SPREAD_PITCH_TALL = 1.0;

let V3, renderer, scene, camera, probe, composer, bloom, canvas, host = null, raf = 0, last = 0, now = 0, seen = true;
// Render on demand: a frame is drawn only while something moves (tweens, drag, pointer tilt, particles, a show) and for IDLE ms
// after it, while the mat keeps breathing; then the idle-sway fades out and the loop stops. The shop runs for hours.
let awake = 0, breath = 0, aliveUntil = 0;
const IDLE = 2500, QUICK = .7; // QUICK: a 连开 round's tweens run at this share of their time
let hand, grip, L, parts, rays, veil, playmat, counter, shared, io, ro, drag = null, opts = null, speed = 1;
let R = null; // the pack on the mat right now
let lean = 0;
const ptr = { x: 0, y: 0, in: false }, tilt = { x: 0, y: 0 }, shake = { t0: 0, ms: 1, amp: 0 };
const cam = { t: null, p: PITCH, d: 36 };

// ---------- tweens: every motion is a promise, advanced once per frame ----------
const E = { io: p => (p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2), out: p => 1 - (1 - p) ** 3, in: p => p * p * p,
  back: p => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2, lin: p => p };
let tws = [];
const tween = (ms, fn, ease = E.io) => { wake(); return new Promise(res => tws.push({ t0: now, ms: ms * speed, fn, ease, res })); };
const wait = ms => tween(ms, () => {});
// Starts the loop if it is parked (and restarts the clock, so a tween made while idle starts now), and keeps it running ms more.
function wake(ms = 0) {
  const t = performance.now();
  if (!raf) { if (!host) return; now = last = t; raf = requestAnimationFrame(frame); }
  awake = Math.max(awake, t + ms);
}
function stepTweens() {
  const list = tws; tws = [];
  for (const w of list) { const p = w.ms > 0 ? clamp((now - w.t0) / w.ms, 0, 1) : 1; w.fn(w.ease(p)); if (p < 1) tws.push(w); else w.res(); }
}

// ---------- canvases → textures ----------
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function canvasTex(c, color = true) {
  const t = new T.CanvasTexture(c); t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
const loadImg = url => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
// The display face (--font-display, Noto Sans SC 900 from Google Fonts) is split into unicode-range slices: load the slices
// for every glyph painted with it before painting, or the canvas silently keeps the system fallback. Offline: give up after 2.5 s.
let fontsP = null;
const fonts = () => (fontsP ||= Promise.race([
  document.fonts?.load(`900 100px ${DISP()}`, '欧气卡铺' + SETS.map(s => s.name).join('')) || null,
  new Promise(r => setTimeout(r, 2500))]).catch(() => {}));
const DISP = () => css('--font-display'), BODY = () => css('--font-body');

// Height field → tangent-space normal map (used for foil crinkles and the rubber mat grain).
function blur(h, W, H, r) {
  const tmp = new Float32Array(h.length), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += h[y * W + clamp(x + k, 0, W - 1)]; tmp[y * W + x] = s / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, H - 1) * W + x]; h[y * W + x] = s / n; }
}
function normalMap(h, W, H, s, wrap) {
  const c = canvasOf(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const at = (i, j) => h[(wrap ? (j + H) % H : clamp(j, 0, H - 1)) * W + (wrap ? (i + W) % W : clamp(i, 0, W - 1))];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * s, dy = (at(i, j + 1) - at(i, j - 1)) * s, l = Math.hypot(dx, dy, 1), o = (j * W + i) * 4;
    d[o] = (-dx / l * .5 + .5) * 255; d[o + 1] = (dy / l * .5 + .5) * 255; d[o + 2] = (1 / l * .5 + .5) * 255; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
// Foil crinkles: random short creases, mostly across the pack like a squeezed bag, plus the crimp ridges.
function crinkleTex() {
  const W = 512, H = Math.round(W * PH / PW), c = canvasOf(W, H), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, W, H); x.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    let px = Math.random() * W, py = Math.random() * H, a = (Math.random() - .5) * 1.3 + (Math.random() < .25 ? Math.PI / 2 : 0);
    x.strokeStyle = Math.random() < .5 ? `rgba(255,255,255,${.2 + Math.random() * .35})` : `rgba(0,0,0,${.2 + Math.random() * .35})`;
    x.lineWidth = .8 + Math.random() * 2.4; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 3; k++) { a += (Math.random() - .5) * .8; const l = 10 + Math.random() * 45; px += Math.cos(a) * l; py += Math.sin(a) * l; x.lineTo(px, py); }
    x.stroke();
  }
  const src = x.getImageData(0, 0, W, H).data, h = new Float32Array(W * H);
  for (let i = 0; i < h.length; i++) h[i] = src[i * 4] / 255;
  blur(h, W, H, 2);
  const band = CRIMP / PH * H, per = W / PW * .24;
  for (let j = 0; j < H; j++) if (j < band || j > H - band) for (let i = 0; i < W; i++) h[j * W + i] = .5 + .5 * Math.sin(i / per * Math.PI * 2);
  return canvasTex(normalMap(h, W, H, 3, false), false);
}
function grainTex() {
  const W = 256, h = new Float32Array(W * W);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  blur(h, W, W, 1);
  const t = canvasTex(normalMap(h, W, W, 2.2, true), false); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}

// ---------- the booster pack ----------
// Colours read off each set's real booster art; chase = the card whose illustration fronts the pack.
const LOOK = {
  sv08: { chase: '238', c: ['#FFE15A', '#F39A1E', '#1E2C57'] },
  sv10: { chase: '231', c: ['#E4493C', '#6E1624', '#121019'] },
  'sv08.5': { chase: '161', c: ['#F6C2DB', '#7CC6DB', '#232845'] },
  'sv03.5': { chase: '199', c: ['#FF8B3D', '#C42B1C', '#1B1A20'] },
  sv09: { chase: '184', c: ['#F4B8C8', '#4D9C7D', '#1F2B33'] },
  me01: { chase: '178', c: ['#EFEBE5', '#8F6A85', '#2C2A33'] },
  me02: { chase: '125', c: ['#4FA2BB', '#2E648A', '#0E0C19'] },
  me03: { chase: '120', c: ['#F06BC8', '#2F9E6A', '#1A1328'] }, // me03–me05: colours from the chase card's art (Mega Zygarde / Greninja / Darkrai ex SIR)
  me04: { chase: '116', c: ['#7FD3F0', '#1F6FB5', '#0E1A33'] },
  me05: { chase: '116', c: ['#D9E07A', '#4A4F57', '#0B0B0E'] },
};
const K = 768 / PW; // pack-art pixels per cm
const artCache = {};
function crimps(x, W, H, col, stripe) {
  const cr = CRIMP * K;
  for (const y0 of [0, H - cr]) { x.fillStyle = col; x.fillRect(0, y0, W, cr); x.fillStyle = stripe; for (let i = 0; i < W; i += K * .24) x.fillRect(i, y0, K * .09, cr); }
}
function drawFront(x, look, set, logo, art) {
  const W = x.canvas.width, H = x.canvas.height, [c0, c1, c2] = look.c, cr = CRIMP * K;
  let gr = x.createLinearGradient(0, 0, W * .6, H); gr.addColorStop(0, c0); gr.addColorStop(.5, c1); gr.addColorStop(1, c2);
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H * .42); x.globalCompositeOperation = 'lighter'; // light burst behind the Pokémon
  for (let i = 0; i < 28; i++) { x.rotate(Math.PI / 14); x.fillStyle = `rgba(255,255,255,${i % 2 ? .04 : .08})`; x.beginPath(); x.moveTo(0, 0); x.lineTo(W * 1.3, -46); x.lineTo(W * 1.3, 46); x.fill(); }
  x.restore();
  if (art) { // the chase card's illustration, feathered into the foil
    const ah = 470, t = canvasOf(W, ah), c = t.getContext('2d');
    c.drawImage(art, 36, 128, 528, 528 * ah / W, 0, 0, W, ah); // below the name bar, above the attack text
    c.globalCompositeOperation = 'destination-in';
    let m = c.createLinearGradient(0, 0, 0, ah); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.2, '#000'); m.addColorStop(.78, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m; c.fillRect(0, 0, W, ah);
    m = c.createLinearGradient(0, 0, W, 0); m.addColorStop(0, 'rgba(0,0,0,.35)'); m.addColorStop(.12, '#000'); m.addColorStop(.88, '#000'); m.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = m; c.fillRect(0, 0, W, ah);
    x.drawImage(t, 0, 360);
  }
  if (logo) { const lh = Math.min(W * .8 * logo.height / logo.width, 250), lw = lh * logo.width / logo.height; x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 20; x.shadowOffsetY = 6; x.drawImage(logo, (W - lw) / 2, cr + 64, lw, lh); x.restore(); } // tall logos (151) are capped so the art still shows
  gr = x.createLinearGradient(0, H - cr - 360, 0, H - cr); gr.addColorStop(0, rgba(c2, 0)); gr.addColorStop(.55, rgba(c2, .85)); gr.addColorStop(1, c2);
  x.fillStyle = gr; x.fillRect(0, H - cr - 360, W, 360);
  x.textAlign = 'center'; x.fillStyle = '#FFFFFF'; x.font = `900 100px ${DISP()}`;
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 14; x.fillText(set.name, W / 2, H - cr - 118); x.restore();
  x.font = `500 30px ${BODY()}`; x.fillStyle = 'rgba(255,255,255,.82)'; x.fillText('补充包 · 每包 11 张', W / 2, H - cr - 58);
  crimps(x, W, H, c2, 'rgba(255,255,255,.16)');
  const ty = (PH / 2 - TEAR) * K; // where to tear, like the notch on a real pack
  x.setLineDash([10, 8]); x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, ty); x.lineTo(W, ty); x.stroke(); x.setLineDash([]);
  x.textAlign = 'left'; x.font = `500 20px ${BODY()}`; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText('◂ 由此撕开', 14, ty + 26);
}
function drawBack(x, look, set, logo) {
  const W = x.canvas.width, H = x.canvas.height, [, c1, c2] = look.c, cr = CRIMP * K;
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(W / 2 - 24, 0, 48, H); // the glued seam down the back
  x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(W / 2 - 24, 0, 3, H); x.fillRect(W / 2 + 21, 0, 3, H);
  if (logo) { const lh = Math.min(W * .5 * logo.height / logo.width, 200), lw = lh * logo.width / logo.height; x.drawImage(logo, (W - lw) / 2, cr + 70, lw, lh); }
  x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.9)'; x.font = `900 66px ${DISP()}`; x.fillText('欧气卡铺', 70, 560);
  x.font = `400 28px ${BODY()}`; x.fillStyle = 'rgba(255,255,255,.78)';
  [`${set.name} · 补充包`, '每包 11 张卡：', '1 张能量 · 4 张普通 · 3 张非普通', '2 张反闪位 · 1 张稀有位', '', '开包概率：TCGplayer 实开统计', '单卡价格：TCGplayer 市价'].forEach((l, i) => x.fillText(l, 70, 630 + i * 44));
  const bx = W - 70 - 250, by = H - cr - 230; // barcode
  x.fillStyle = '#F4F4F2'; x.fillRect(bx, by, 250, 150); x.fillStyle = '#111';
  for (let i = 0, px = bx + 16; px < bx + 234; i++) { const w = 2 + (i * 7919 % 5); x.fillRect(px, by + 14, w, 100); px += w + 2 + (i * 104729 % 4); }
  crimps(x, W, H, c2, 'rgba(255,255,255,.14)');
}
// One canvas drives both maps: three reads roughness from G and metalness from B.
function drawOrm(x, front) {
  const W = x.canvas.width, H = x.canvas.height, cr = CRIMP * K;
  x.fillStyle = front ? 'rgb(0,96,235)' : 'rgb(0,100,200)'; x.fillRect(0, 0, W, H); // printed metallised film
  if (front) {
    const gr = x.createLinearGradient(0, 230, 0, 990); gr.addColorStop(0, 'rgba(0,128,70,0)'); gr.addColorStop(.2, 'rgb(0,128,70)'); gr.addColorStop(.8, 'rgb(0,128,70)'); gr.addColorStop(1, 'rgba(0,128,70,0)');
    x.fillStyle = gr; x.fillRect(0, 230, W, 760); // white underlay under the illustration and logo: less mirror, so they read
    x.fillStyle = 'rgb(0,95,110)'; x.fillRect(40, cr + 50, W - 80, 250);
    x.fillStyle = 'rgb(0,105,150)'; x.fillRect(0, H - cr - 250, W, 250);
  } else { x.fillStyle = 'rgb(0,140,50)'; x.fillRect(50, 500, 560, 330); x.fillRect(W - 340, H - cr - 250, 290, 190); }
  x.fillStyle = 'rgb(0,70,255)'; x.fillRect(0, 0, W, cr); x.fillRect(0, H - cr, W, cr);
}
function packArt(setId) {
  if (artCache[setId]) return artCache[setId];
  const look = LOOK[setId] || LOOK.sv08, set = SETS.find(s => s.id === setId), W = 768, H = Math.round(PH * K);
  const cv = [0, 1, 2, 3].map(() => canvasOf(W, H)), tx = cv.map((c, i) => canvasTex(c, i < 2));
  drawOrm(cv[2].getContext('2d'), true); drawOrm(cv[3].getContext('2d'), false);
  let logo = null, art = null;
  const paint = () => { drawFront(cv[0].getContext('2d'), look, set, logo, art); drawBack(cv[1].getContext('2d'), look, set, logo); tx[0].needsUpdate = tx[1].needsUpdate = true; };
  paint();
  Promise.all([loadImg(ASSETS.logo(setId)).then(i => { logo = i; }), loadImg(ASSETS.card(setId, look.chase, 'high')).then(i => { art = i; }), fonts()]).then(paint);
  const mk = (map, orm) => new T.MeshPhysicalMaterial({ map, metalnessMap: orm, roughnessMap: orm, metalness: 1, roughness: 1,
    normalMap: shared.crinkle, normalScale: new T.Vector2(.5, .5), clearcoat: .35, clearcoatRoughness: .22 });
  const dim = mk(tx[0], tx[2]); dim.color.set(0x4B5264); dim.clearcoat = .1; // a pack on the shelf that can't be opened yet: in the lamp's shadow
  return (artCache[setId] = { front: mk(tx[0], tx[2]), back: mk(tx[1], tx[3]), dim });
}

// Pillow shape: flat crimps top and bottom, flat side seams, puffed in the middle.
function puff(x, y) {
  const sx = 1 - smooth(PW / 2 - .8, PW / 2 - .04, Math.abs(x)), sy = smooth(CRIMP, CRIMP + 1.5, PH / 2 - Math.abs(y));
  return PUFF * Math.sqrt(sx * sy) * (1 + .05 * Math.sin(x * 1.7 + y * .6));
}
function sheet(yA, yB, jA, jB, side, rows, COLS) {
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= COLS; c++) {
    const x = -PW / 2 + PW * c / COLS, a = yA + jA(c), b = yB + jB(c), y = a + (b - a) * r / rows;
    pos.push(x, y, side * (.012 + puff(x, y))); uv.push(side > 0 ? x / PW + .5 : .5 - x / PW, y / PH + .5);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
    const a = r * (COLS + 1) + c, b = a + 1, d = a + COLS + 1, e = d + 1;
    if (side > 0) idx.push(a, b, e, a, e, d); else idx.push(a, e, b, a, d, e);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
// cols/rows: mesh density. A pack held up to the camera gets 60×64 and its foil lining; the ten packs of a batch, small
// on screen, far fewer vertices and no lining (40 draw calls saved, never visible from above).
function buildPack(setId, cols = 60, rows = 64, lining = true) {
  const mats = packArt(setId), pack = new T.Group(), strip = new T.Group(), ph = Math.random() * 9, f = 60 / cols;
  const teeth = c => (c % 2 ? .09 : 0), tearJ = c => .06 * Math.sin(c * f * .9 + ph) + .04 * Math.sin(c * f * 2.3 + ph * 2), zero = () => 0;
  const SC = (TEAR + PH / 2) / 2, stripGeos = [];
  for (const side of [1, -1]) {
    const body = sheet(-PH / 2, TEAR, teeth, tearJ, side, rows, cols), top = sheet(TEAR, PH / 2, tearJ, c => -teeth(c), side, Math.max(4, rows / 6 | 0), cols);
    top.translate(0, -SC, 0); stripGeos.push({ geo: top, orig: top.attributes.position.array.slice() });
    for (const [geo, parent] of [[body, pack], [top, strip]]) {
      const outer = new T.Mesh(geo, side > 0 ? mats.front : mats.back); outer.castShadow = true;
      parent.add(outer); if (lining) parent.add(new T.Mesh(geo, shared.inner));
    }
  }
  strip.position.y = SC; pack.add(strip);
  Object.assign(pack.userData, { strip, stripGeos, tearY: TEAR - SC, zero });
  return pack;
}
// Tear progress p (0..1) runs the tear front from left to right; the loose end behind it swings up about the front
// (more the further back, so the flap curls) and lifts off the pack a little.
function setTear(run, p) { run.tear = p; tearPack(run.pack, p); }
function tearPack(pack, p) {
  pack.userData.tear = p;
  const ty = pack.userData.tearY, xf = -PW / 2 + p * PW;
  for (const { geo, orig } of pack.userData.stripGeos) {
    const a = geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = orig[i], y = orig[i + 1], z = orig[i + 2], k = clamp((p - (x + PW / 2) / PW) / .3, 0, 1), th = -k * k * .6, dx = x - xf, dy = y - ty;
      if (!k) { a[i] = x; a[i + 1] = y; a[i + 2] = z; continue; }
      a[i] = xf + dx * Math.cos(th) - dy * Math.sin(th); a[i + 1] = ty + dx * Math.sin(th) + dy * Math.cos(th) + k * .1; a[i + 2] = z + k * .28;
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }
}

// ---------- cards ----------
const CARD_VS = `
  varying vec2 vUv; varying float vFront; varying vec3 vN, vP, vR, vU;
  void main() {
    vFront = normal.z > 0.0 ? 1.0 : 0.0;
    vec2 uv = position.xy / vec2(${CW}, ${CH}) + 0.5;
    vUv = vFront > 0.5 ? uv : vec2(1.0 - uv.x, uv.y);
    vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
    mat3 m = mat3(modelMatrix);
    vN = normalize(m * normal); vR = normalize(m * vec3(1.0, 0.0, 0.0)); vU = normalize(m * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
// uKind: 0 plain, 1 reverse holo (all but the art box), 2 holo art box, 3 full holo (brushed), 4 etched (full arts and gold), 6 ball pattern reverse, 7 cosmos (5 unused)
// uLit 0…1: 1 for the card in hand (held to the eye, or the front of the pack being revealed). Its light is then a neutral
// hand light, not the room's: away from the lamp's cone and under the dimmed show moods it still shows the printed colours.
// Foil only ADDS reflection (a white sheen that sweeps across as the card tilts, and sparkles); it never tints the print.
const CARD_FS = `
  uniform sampler2D uFace, uBack; uniform float uKind, uFoil, uScan, uTime, uCone0, uCone1, uLit; uniform vec3 uKey, uKeyDir, uKeyCol, uAmb, uWash, uGlowAt;
  varying vec2 vUv; varying float vFront; varying vec3 vN, vP, vR, vU;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float etchH(vec2 uv) { return dot(texture2D(uFace, uv, 2.5).rgb, vec3(0.299, 0.587, 0.114)) + 0.03 * vnoise(uv * vec2(5.0, 7.0)); }
  void main() {
    vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
    bool front = vFront > 0.5;
    vec4 t = front ? texture2D(uFace, vUv) : texture2D(uBack, vUv);
    vec3 base = mix(vec3(0.6, 0.63, 0.68), t.rgb, t.a);
    vec3 Lk = normalize(uKey - vP); // the lamp is a spot: outside its cone a card only gets the room fill
    vec3 lamp = uKeyCol * smoothstep(uCone0, uCone1, dot(-Lk, uKeyDir));
    vec3 gd = uGlowAt - vP; vec3 wash = uWash * 40.0 / (dot(gd, gd) + 4.0); // the show light sits just in front of the held card and falls off
    vec3 light = mix(uAmb + lamp * max(dot(N, Lk), 0.0) + wash, vec3(0.97), uLit);
    vec3 shine = mix(uAmb + lamp + wash, vec3(0.9), uLit); // what the laminate and the foil reflect
    vec3 col = base * light;
    col += lamp * pow(max(dot(N, normalize(Lk + V)), 0.0), 90.0) * 0.16 * (1.0 - uLit);
    vec2 ang = vec2(dot(V, vR), dot(V, vU));
    float gl = (vUv.x + vUv.y) * 0.5 - 0.5 - ang.x * 1.7 - ang.y * 1.2; // laminate glare sliding across as the card tilts
    col += exp(-gl * gl * 28.0) * 0.06 * shine;
    if (front && uKind > 0.5) {
      // uScan 0: the scan didn't load and the face is blank stock (card.ts stock()). The 2D face keeps its foil layer over it, so
      // this one keeps a plain sheen too, but nothing that reads the print (art box, etch ridges, ink roughness, printed patterns).
      float k = uScan > 0.5 ? uKind : 0.0, luma = dot(base, vec3(0.299, 0.587, 0.114));
      float art = step(0.075, vUv.x) * step(vUv.x, 0.925) * step(0.525, vUv.y) * step(vUv.y, 0.903);
      float mask = k < 0.5 ? 1.0 : k < 1.5 || (k > 5.5 && k < 6.5) ? 1.0 - art : k < 2.5 ? art : 1.0;
      vec3 rb = vec3(1.0); // white light only: the print keeps its own colours, gold cards included (DESIGN.md「闪面」)
      float tx = 1.0;
      if (k > 3.5 && k < 4.5) tx = 0.45 + 0.8 * vnoise(vUv * vec2(64.0, 90.0)) * vnoise(vUv * vec2(9.0, 12.6) + 3.0);
      if (k > 5.5 && k < 6.5) { float r = length(fract(vUv * vec2(8.0, 11.2)) - 0.5); tx = 0.25 + smoothstep(0.35, 0.31, r) - 0.6 * smoothstep(0.25, 0.21, r); }
      if (k > 6.5) { vec2 c = floor(vUv * 12.0); vec2 q = fract(vUv * 12.0) - 0.5 - (vec2(hash(c), hash(c + 7.1)) - 0.5) * 0.4; float rr = 0.12 + hash(c + 3.3) * 0.25; tx = 0.3 + smoothstep(rr, rr - 0.04, length(q)); }
      float h = hash(floor(vUv * vec2(84.0, 118.0)));
      float spark = step(0.9, h) * smoothstep(0.45, 0.1, length(fract(vUv * vec2(84.0, 118.0)) - 0.5)) * pow(max(0.0, sin(h * 91.0 + ang.x * 38.0 + ang.y * 29.0 + uTime * 0.6)), 40.0);
      float band = vUv.x * 0.7 + vUv.y * 0.9 - 0.8 - ang.x * 1.9 - ang.y * 1.4; // the bright sweep, where the foil catches the light
      float amt = mask * uFoil, sheen = 0.035 + 0.3 * exp(-band * band * 6.0);
      if (k > 0.5 && k < 3.5) { // plain foil under ink: where the print is light the foil is a mirror (a tight, bright streak), where the ink
        // is heavy it scatters (a wide, dim wash). Same light either way, only spread differently: the print's colour never moves.
        // Full-card holo is also brushed: fine lengthwise grain breaks its sweep into streaks, so it never reads as reverse foil.
        float rough = 1.0 - dot(texture2D(uFace, vUv, 3.0).rgb, vec3(0.299, 0.587, 0.114)), b = band, gr = 1.0;
        if (k > 2.5) { gr = vnoise(vUv * vec2(260.0, 5.0)); b += (gr - 0.5) * 0.35; gr = 0.4 + 1.2 * gr; rough = 0.35 + 0.65 * rough; }
        float sharp = mix(18.0, 2.5, rough);
        sheen = 0.03 + 0.3 * sqrt(sharp / 6.0) * mix(1.0, 0.6, rough) * exp(-b * b * sharp) * gr;
      }
      if (k > 3.5 && k < 4.5) { // etched: the foil is pressed into ridges that follow the art. The ridges are contour lines of the scan's
        // blurred brightness (plus a slow swirl, so flat print like a gold card's field still has grain); each ridge's flank tilts
        // toward or away from the light, so the sweep breaks into streaks along the drawing and slides between them as the card turns.
        vec2 e = vec2(2.0 / 512.0, 2.0 / 715.0);
        float hr = etchH(vUv + vec2(e.x, 0.0)), hl = etchH(vUv - vec2(e.x, 0.0)), hu = etchH(vUv + vec2(0.0, e.y)), hd = etchH(vUv - vec2(0.0, e.y));
        // Where the print is flat (a gold card's field, an art's plain sky) there are no contours to follow: the plate there is cut
        // in fine parallel lines instead, like a real gold card's etch, bending as they meet the drawing.
        vec2 g = vec2(hr - hl, hu - hd); float plain = 1.0 - smoothstep(0.004, 0.03, length(g));
        float ph = ((hr + hl + hu + hd) * 0.25 + plain * 0.6 * dot(vUv, vec2(0.5, 1.0))) * 70.0, fade = 1.0 - smoothstep(0.25, 0.6, fwidth(ph)); // ridges finer than ~3 px would shimmer: flat foil there
        g += plain * vec2(0.5, 1.0) * 0.04; g /= length(g) + 0.004;
        float c = cos(ph * 6.2832), flank = c * fade, crest = 0.5 + 0.5 * sin(ph * 6.2832);
        float b = band + dot(g, vec2(0.7, 0.9)) * flank * 0.55;
        crest *= crest; tx = mix(tx, 0.3 + 0.9 * crest * crest, fade); // grooves hold less light than crests: only how much white goes on moves, never the print
        sheen = 0.015 + 0.42 * exp(-b * b * 12.0);
      }
      col += rb * shine * amt * tx * sheen * (0.4 + 0.6 * luma) + spark * amt * (k > 3.5 ? 1.1 : k < 1.5 ? 0.35 : 0.7) * shine;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// How the card is printed is card.ts's FOIL (the 2D face reads the same table): [look, sheen strength]; the look picks uKind.
const LOOKS = { rev: 1, holo: 2, full: 3, etch: 4, ball: 6, cosmos: 7 };
const foilOf = c => { const f = FOIL[c.kind]; return f ? [LOOKS[f[0]], f[1]] : [0, 0]; };

function roundRect(w, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// card.ts's SVG pictures (back, basic energy, blank stock) are drawn at card size first: an SVG with only a viewBox has no
// intrinsic size of its own as an image.
async function svgTex(url) {
  const img = await loadImg(url), W = 512, H = Math.round(W * CH / CW), c = canvasOf(W, H);
  if (img) c.getContext('2d').drawImage(img, 0, 0, W, H);
  return canvasTex(c);
}
async function loadFace(c) {
  if (c.r === 'E') return svgTex(energySVG(c.name));
  for (const size of ['high', 'low']) {
    const img = await loadImg(ASSETS.card(c.set, c.n, size));
    if (img) { const t = new T.Texture(img); t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true; renderer.initTexture(t); return t; }
  }
  const t = await svgTex(stockSVG(c.name)); t.userData.stock = true; return t;
}
// uScan starts at 0: until the scan is in, the face is the blank placeholder, which has no print for the foil to read.
function cardMesh(c) {
  const [kind, foil] = foilOf(c), u = shared.u;
  const cap = new T.ShaderMaterial({ vertexShader: CARD_VS, fragmentShader: CARD_FS,
    uniforms: { uFace: { value: shared.blank }, uBack: u.back, uKind: { value: kind }, uFoil: { value: foil }, uScan: { value: 0 }, uLit: { value: 0 }, uTime: u.time, uKey: u.key, uKeyDir: u.keyDir, uCone0: u.cone0, uCone1: u.cone1, uGlowAt: u.glowAt, uKeyCol: u.keyCol, uAmb: u.amb, uWash: u.wash } });
  const m = new T.Mesh(shared.cardGeo, [cap, shared.edge]); m.castShadow = true;
  m.userData.ready = loadFace(c).then(t => { cap.uniforms.uFace.value = t; cap.uniforms.uScan.value = t.userData.stock ? 0 : 1; m.userData.face = t; });
  return m;
}
// Sized in CSS pixels, not cm, like the 2D mat's 26 px glow (DESIGN.md「卡面」): d over its own screen derivative is the distance
// from the card's edge in device pixels, uDpr takes it to CSS pixels. So a small card in a ten-pack spread gets the same thin rim
// as the one held up close, instead of a glow a third of its width (a phone's small cards get it narrower still). The world fade only keeps it off the plane's edge.
// dFdx runs in highp on every GPU that can run the scene: three ≥ r163 is WebGL2-only, GLES 3.0 requires highp in fragment
// shaders, and ShaderMaterial gets three's `precision highp float` prefix (renderer.capabilities.precision).
const HALO_FS = `uniform vec3 uCol; uniform float uAmt, uDpr; varying vec2 vP;
  float sdr(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() { float d = sdr(vP, vec2(${CW / 2}, ${CH / 2}), ${CR}), wpx = length(vec2(dFdx(d), dFdy(d))) * uDpr + 1e-5,
      px = max(d, 0.0) / wpx / min(1.0, ${CW} / wpx / 110.0); // and never wider than about a quarter of the card as it shows on screen
    gl_FragColor = vec4(uCol * uAmt * exp(-max(px - 4.0, 0.0) / 9.0) * smoothstep(34.0, 20.0, px) * smoothstep(-0.3, 0.0, d) * smoothstep(2.5, 1.9, d), 1.0); }`;
function halo(card, col, amt, ms = 500) {
  let h = card.userData.halo;
  if (!h) {
    h = new T.Mesh(new T.PlaneGeometry(CW + 5, CH + 5), new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color() }, uAmt: { value: 0 }, uDpr: shared.u.dpr },
      vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    h.position.z = -.03; card.add(h); card.userData.halo = h;
  }
  const u = h.material.uniforms, a0 = u.uAmt.value; u.uCol.value.set(col);
  return tween(ms, p => { u.uAmt.value = a0 + (amt - a0) * p; });
}

// ---------- particles: sparks, embers ----------
function makeParticles(N) {
  const geo = new T.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N), s0 = new Float32Array(N);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new T.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new T.BufferAttribute(size, 1)); geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1));
  const mat = new T.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `attribute float aSize, aAlpha; attribute vec3 aColor; varying vec3 vC; varying float vA; uniform float uScale;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vC = aColor; vA = aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vC * vA * (a * a * 1.6 + smoothstep(0.14, 0.0, d) * 3.0), 1.0); }` });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false;
  let head = 0;
  function spawn(p, v, c, sz, lf, gr) {
    const i = head; head = (head + 1) % N;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); col.set([c.r, c.g, c.b], i * 3);
    s0[i] = sz; life[i] = max[i] = lf; grav[i] = gr;
    aliveUntil = Math.max(aliveUntil, now + lf * 1000); wake();
  }
  function update(dt) {
    const drag = Math.pow(.2, dt);
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt; const k = Math.max(0, life[i] / max[i]), o = i * 3;
      vel[o] *= drag; vel[o + 1] = vel[o + 1] * drag - grav[i] * dt; vel[o + 2] *= drag;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      alpha[i] = Math.min(1, k * 3) * (.6 + .4 * Math.sin(now * .025 + i * 1.7)); size[i] = s0[i] * (.35 + .65 * k);
    }
    geo.attributes.position.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aSize.needsUpdate = true;
  }
  const clear = () => life.fill(0);
  return { pts, mat, spawn, update, clear };
}
const tmpV = () => new V3();
function camBasis() {
  const r = tmpV().setFromMatrixColumn(camera.matrixWorld, 0), u = tmpV().setFromMatrixColumn(camera.matrixWorld, 1), f = tmpV().setFromMatrixColumn(camera.matrixWorld, 2);
  return { r, u, f }; // f points back toward the viewer
}
function burst(at, n, color, speed) {
  const { r, u, f } = camBasis(), base = new T.Color(color), white = new T.Color('#FFFFFF');
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = speed * (.3 + Math.random() * .7);
    const v = tmpV().addScaledVector(r, Math.cos(a) * s).addScaledVector(u, Math.sin(a) * s).addScaledVector(f, Math.random() * speed * .5);
    const p = at.clone().addScaledVector(r, Math.cos(a) * CW * .35).addScaledVector(u, Math.sin(a) * CH * .35);
    parts.spawn(p, v, base.clone().lerp(white, Math.random() * .5), .16 + Math.random() * .34, .9 + Math.random() * 1.1, 5);
  }
}
function embers(run, card, color, ms) {
  const until = now + ms, c = new T.Color(color);
  run.embers = () => {
    if (now > until || R !== run) { run.embers = null; return; }
    const { r, u, f } = camBasis(), at = card.getWorldPosition(tmpV());
    for (let k = 0; k < 2; k++) {
      const side = Math.random() * 2 - 1, p = at.clone().addScaledVector(r, side * CW * .6).addScaledVector(u, (Math.random() - .6) * CH * .8).addScaledVector(f, -.2);
      parts.spawn(p, tmpV().addScaledVector(u, 2 + Math.random() * 4).addScaledVector(r, side * 1.5), c, .12 + Math.random() * .22, 1.2 + Math.random() * 1.4, -1.5);
    }
  };
}

// ---------- lights and mood ----------
const MOODS = {
  base: { hemi: .5, key: 1.6, cone: .5, glow: 0, bloom: .12, rays: 0, col: '--fx-silver' },
  hush: { hemi: .3, key: 1.3, cone: .5, glow: 0, bloom: .12, rays: 0, col: '--fx-silver' }, // the room holds its breath on the last slots
  lift: { hemi: .5, key: 1.5, cone: .5, glow: .35, bloom: .35, rays: 0, col: '--fx-silver' },
  silver: { hemi: .22, key: .75, cone: .5, glow: 1.2, bloom: .6, rays: .22, col: '--fx-silver' },
  gold: { hemi: .08, key: .3, cone: .5, glow: 1.9, bloom: .8, rays: .5, col: '--fx-gold' }, // room lights down, the pull lit from the front
  glow: { hemi: .16, key: .6, cone: .5, glow: 1.5, bloom: .6, rays: .16, col: '--fx-gold' },
  look: { hemi: .2, key: .75, cone: .5, glow: .2, bloom: .15, rays: 0, col: '--fx-silver' }, // the table steps back behind the card in hand
  // SIR / gold (tier 5) only: the shop goes dark behind the card (veil: the opacity of a curtain just behind it, so it holds in
  // the light theme too, where dimming the lights alone leaves a white counter), the card is the one lit thing in the room.
  solo: { hemi: 0, key: .1, cone: .5, glow: 2.2, bloom: .75, rays: .28, col: '--fx-gold', veil: .97 },
};
const moodNow = { hemi: .5, key: 1.6, cone: .5, glow: 0, bloom: .12, rays: 0, veil: 0 };
let moodTok = 0; // the latest mood wins: a show's delayed fade to 'glow' must not keep running over the spread's 'base'
function mood(name, ms = 500) {
  const m = MOODS[name], a = { ...moodNow }, col = new T.Color(css(m.col)), c0 = L.glow.color.clone(), tok = ++moodTok;
  return tween(ms, p => {
    if (tok !== moodTok) return;
    for (const k in a) moodNow[k] = a[k] + ((m[k] ?? 0) - a[k]) * p;
    L.glow.color.copy(c0).lerp(col, p); rays.material.uniforms.uCol.value.copy(L.glow.color);
  });
}
function applyMood() {
  const k = L.key; k.intensity = moodNow.key; k.angle = moodNow.cone;
  L.hemi.intensity = moodNow.hemi; L.glow.intensity = moodNow.glow * 10;
  bloom.strength = moodNow.bloom; rays.material.uniforms.uAmt.value = moodNow.rays;
  veil.visible = moodNow.veil > .005; veil.material.opacity = moodNow.veil;
  if (veil.visible) { // a card's width behind whatever is being shown, facing the camera, wider than the view
    const hero = R?.look?.card || R?.hero || R?.cards?.[R.cur], d = (hero ? camera.position.distanceTo(hero.getWorldPosition(tmpV())) : 30) + 2.5, h = 2 * d * TAN * 1.4;
    veil.position.copy(camera.position).addScaledVector(camBasis().f, -d); veil.quaternion.copy(camera.quaternion); veil.scale.set(h * camera.aspect, h, 1);
  }
  const u = shared.u; // the card shader's own lighting follows the same lights (printed card ≈ texture colour at the base mood)
  u.amb.value.copy(L.hemi.color).multiplyScalar(moodNow.hemi * .76);
  u.keyCol.value.copy(k.color).multiplyScalar(moodNow.key * .42);
  u.wash.value.set(0xFFFFFF).lerp(L.glow.color, .3).multiplyScalar(moodNow.glow * .42); // mostly white, so the art keeps its colours
  u.key.value.copy(k.position); u.glowAt.value.copy(L.glow.position); u.keyDir.value.subVectors(k.target.position, k.position).normalize();
  u.cone0.value = Math.cos(k.angle); u.cone1.value = Math.cos(k.angle * (1 - k.penumbra));
}

// ---------- camera ----------
const fit = (w, h, aspect = camera.aspect) => Math.max(h / (2 * TAN), w / (2 * TAN * aspect));
function placeCam(c, st) {
  c.position.set(st.t.x, st.t.y + Math.sin(st.p) * st.d, st.t.z + Math.cos(st.p) * st.d); c.lookAt(st.t); c.updateMatrixWorld();
}
function onTable(nx, ny, st) {
  probe.aspect = camera.aspect; probe.updateProjectionMatrix(); placeCam(probe, st);
  const v = new V3(nx, ny, .5).unproject(probe).sub(probe.position).normalize();
  return probe.position.clone().addScaledVector(v, -probe.position.y / v.y);
}
// The shot at pitch p that holds every point inside mx/my of the frame's half size, centred on them: distance by bisection on
// the probe camera (exact for the perspective, unlike fit()), then the target moved along the table to centre the points.
// y0…y1: the part of the frame's height (NDC, −1 bottom … 1 top) the points should fill; the rest shows what's behind them.
function frameOn(pts, t, p, mx = .9, y0 = -.86, y1 = .86) {
  probe.aspect = camera.aspect; probe.updateProjectionMatrix();
  const st = { t: t.clone(), p, d: 50 }, v = new V3();
  const ext = () => {
    placeCam(probe, st); probe.updateMatrixWorld(); const e = [1e9, -1e9, 1e9, -1e9];
    for (const q of pts) {
      v.copy(q).applyMatrix4(probe.matrixWorldInverse); if (v.z > -1) return null; // behind the lens: too close
      v.applyMatrix4(probe.projectionMatrix); e[0] = Math.min(e[0], v.x); e[1] = Math.max(e[1], v.x); e[2] = Math.min(e[2], v.y); e[3] = Math.max(e[3], v.y);
    }
    return e;
  };
  const solve = () => {
    let lo = 4, hi = 600;
    for (let k = 0; k < 22; k++) { st.d = (lo + hi) / 2; const e = ext(); if (!e || Math.max(-e[0], e[1]) > mx || e[3] - e[2] > y1 - y0) lo = st.d; else hi = st.d; }
    st.d = hi; return ext();
  };
  for (let it = 0; it < 4; it++) { const e = solve(); st.t.x += (e[0] + e[1]) / 2 * st.d * TAN * camera.aspect; st.t.z -= ((e[2] + e[3]) - (y0 + y1)) / 2 * st.d * TAN / Math.sin(p); }
  solve(); return st;
}
// The held shot is the idle shot moved a little closer along the same line of sight (same pitch as the shelf): the pack comes up
// off its stack into the player's hands, held above the mat and a little below the middle of the frame, so the showcase and
// the back of the counter stay in view over it. FOCUS is where the camera looks; HOLD is where the hand is.
const FOCUS = () => new V3(0, 22, -10);
const HOLD = () => FOCUS().add(new V3(0, -Math.cos(PITCH), Math.sin(PITCH)).multiplyScalar(.9));
const GLOW0 = () => HOLD().add(new V3(0, 3 + Math.sin(PITCH) * 6, Math.cos(PITCH) * 6));
const stages = () => ({ pack: { t: FOCUS(), p: PITCH, d: fit(PW / .62, PH / .66) }, reveal: { t: FOCUS(), p: PITCH, d: fit(CW / .56, CH / .58) } });
function camTo(st, ms, ease = E.io) {
  const a = { t: cam.t.clone(), p: cam.p, d: cam.d };
  return tween(ms, k => { cam.t.lerpVectors(a.t, st.t, k); cam.p = a.p + (st.p - a.p) * k; cam.d = a.d + (st.d - a.d) * k; }, ease);
}
const camD = (d, ms) => camTo({ t: cam.t.clone(), p: cam.p, d }, ms);
function quake(amp, ms) { shake.t0 = now; shake.ms = ms; shake.amp = amp; }
const flatQ = yaw => new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, yaw, 'YXZ'));

// Move an object (reparented to the scene, world transform kept) along an arc to a resting pose on the mat.
function flyTo(obj, pos, quat, ms, lift = 4, spin = 0) {
  scene.attach(obj);
  const p0 = obj.position.clone(), q0 = obj.quaternion.clone(), ax = new V3(.4, 1, .3).normalize(), sq = new T.Quaternion();
  return tween(ms, k => {
    obj.position.lerpVectors(p0, pos, k); obj.position.y += Math.sin(k * Math.PI) * lift;
    obj.quaternion.slerpQuaternions(q0, quat, k); if (spin) obj.quaternion.multiply(sq.setFromAxisAngle(ax, spin * (1 - k) ** 2));
  }, E.io);
}

// ---------- the run: one pack from drop-in to spread ----------
function build(set, cards) {
  const run = { data: cards, tiers: cards.map(tierOf), n: cards.length, stage: 'enter', cur: 0, busy: false, tear: 0, slide: 0, pile: 0 };
  run.pack = buildPack(set); grip.add(run.pack);
  run.stack = new T.Group(); run.stack.position.set(0, -.4, -.14); grip.add(run.stack);
  run.cards = cards.map((c, k) => { const m = cardMesh(c); m.position.z = -k * CT * 1.06; run.stack.add(m); return m; });
  run.faces = Promise.all(run.cards.map(m => m.userData.ready));
  return run;
}
// from: the world matrix of the shelf pack it was picked from; that pack rises off the mat into the hand, else one drops in.
async function enter(run, from) {
  const p = run.pack;
  if (from) {
    camTo(stages().pack, 850);
    grip.updateMatrixWorld(true);
    const p0 = new V3(), q0 = new T.Quaternion(), q1 = new T.Quaternion();
    grip.matrixWorld.clone().invert().multiply(from).decompose(p0, q0, new V3());
    p.position.copy(p0); p.quaternion.copy(q0); FX().slide(); run.stack.visible = false; // the cards are in the pack, which isn't in the hand yet
    await tween(850, k => { p.position.copy(p0).multiplyScalar(1 - k); p.position.z += Math.sin(k * Math.PI) * 4; p.quaternion.slerpQuaternions(q0, q1, k); }, E.io);
    run.stack.visible = true;
  } else {
    camTo(stages().pack, 700);
    p.position.y = 17;
    await tween(800, k => { p.position.y = 17 * (1 - k); p.rotation.set(.5 * (1 - k), -.4 * (1 - k), .25 * (1 - k)); }, E.back);
  }
  if (R !== run) return;
  run.stage = 'pack';
  if (run.wantTear) autoTear(run);
}
async function autoTear(run) {
  if (run.stage !== 'pack') { if (run.stage === 'enter') run.wantTear = true; return; }
  run.stage = 'tearing'; const p0 = run.tear;
  let lastC = p0;
  await tween(460 * (1 - p0) + 60, k => { const p = p0 + (1 - p0) * k; setTear(run, p); if (p - lastC > .14) { lastC = p; FX().crinkle(); } }, E.in);
  if (R === run) rip(run);
}
// Where the torn strip lands, the empty pack rests and the seen cards pile, for this aspect (relayout() moves them on resize).
function spots() {
  const st = stages().reveal, wide = camera.aspect > 1;
  return { strip: onTable(small() ? .6 : .46, small() ? .02 : 0, st).setY(.06), // on the mat in front of the showcase
    pile: onTable(wide ? .66 : .84, wide ? -.4 : -.18, st), // portrait: half off the side edges, clear of the caption
    rest: onTable(wide ? -.68 : -.86, wide ? -.3 : -.12, st).setY(PUFF + .05) };
}
function rip(run) {
  run.stage = 'extract';
  const s = run.pack.userData.strip;
  flyTo(s, spots().strip, flatQ(Math.random() * 2 - 1), 950, 7, Math.PI * 4);
  opts.onTear();
  extract(run);
}
async function extract(run) {
  await Promise.race([run.faces, wait(1500)]); if (R !== run) return;
  const st = stages();
  camTo({ ...st.pack, d: st.pack.d * 1.12 }, 800);
  FX().slide(); opts.onFlip(0, run.data[0]);
  await tween(800, k => { run.stack.position.y = -.4 + 7.2 * k; run.pack.position.y = -5 * k; }, E.io);
  if (R !== run) return;
  const sp = spots(); run.pileAt = sp.pile;
  flyTo(run.pack, sp.rest, flatQ(-.35 + Math.random() * .2), 850, 3);
  tween(700, k => { run.stack.position.y = 6.8 * (1 - k); run.stack.position.z = -.14 * (1 - k); }, E.io);
  await camTo(st.reveal, 850);
  if (R !== run) return;
  run.stage = 'cards'; run.cur = 0;
  if (run.skip) return revealAll(run);
  const t0 = run.tiers[0]; if (t0 > 0) celebrate(run, 0, t0);
}
// The front card, pushed s card-widths to the right (1 = the next card is fully uncovered).
function slideFront(card, s) { card.position.set(s * (CW + .9), s * .45, .04 + s * .3); card.rotation.set(0, 0, -s * .09); }
async function uncover(run) {
  const i = run.cur + 1, front = run.cards[run.cur], last = i === run.n - 1, suspense = i >= run.n - 3;
  run.busy = true; mood(suspense ? 'hush' : 'base', 300);
  const set = v => { if (run.stage === 'cards') { run.slide = v; slideFront(front, v); } };
  if (suspense && run.slide < .3) { // the last three slots (reverse, reverse/hit, rare): same slow peek for every outcome
    camD(stages().reveal.d * .93, 800);
    const peek = last ? 820 : 560, hold = last ? 900 : 450, s0 = run.slide;
    if (last) FX().swell(peek + hold + 350); else FX().slide();
    await tween(peek, k => set(s0 + (.34 - s0) * k), E.out);
    await wait(hold); if (R !== run) return;
  } else if (!suspense) FX().slide();
  const s0 = run.slide;
  await tween(suspense ? 380 : 170, k => set(s0 + (1.15 - s0) * k), E.in);
  if (R === run && run.stage === 'cards') reveal(run, i);
}
function toss(run, card) {
  const k = run.pile++, j = () => (Math.random() - .5) * .8;
  card.userData.off = new V3(j(), .06 + k * CT * 1.1, j()); // its place in the pile, kept for relayout()
  flyTo(card, run.pileAt.clone().add(card.userData.off), flatQ(-.2 + (Math.random() - .5) * .5), 480, 2.5);
  if (card.userData.halo) halo(card, card.userData.halo.material.uniforms.uCol.value.getStyle(), .35);
}
async function reveal(run, i) {
  toss(run, run.cards[run.cur]);
  run.cur = i; run.slide = 0;
  run.cards.forEach((c, k) => { if (k >= i) c.position.z = -(k - i) * CT * 1.06; });
  const t = run.tiers[i];
  opts.onFlip(i, run.data[i]);
  const lock = celebrate(run, i, t);
  await wait(lock); if (R !== run || run.stage !== 'cards') return;
  run.busy = false;
  if (run.skip && i < run.n - 1) return revealAll(run);
  if (i === run.n - 1) { await wait(t >= 4 ? 2200 : t >= 2 ? 1300 : 800); if (R === run && run.stage === 'cards' && !run.busy) toSpread(run); }
}
// The show, by rarity tier (0 bulk … 5 SIR/HR). It starts only once the card is fully uncovered.
function celebrate(run, i, t) {
  const card = run.cards[i], at = card.getWorldPosition(tmpV()), silver = css('--fx-silver'), gold = css('--fx-gold');
  const push = (k, ms) => { if (!run.look) camD((run.batch ? run.shot.d : stages().reveal.d) * k, ms); }; // a card held to the eye stays put
  if (run.batch) L.glow.position.copy(at).addScaledVector(camBasis().f, 6);
  if (t === 0) { mood('base', 300); push(1, 400); return 40; }
  run.show = { t0: now, amp: [0, .12, .16, .22, .3, .36][t] * (run.batch && !run.look ? .4 : 1) };
  if (t === 1) { mood('base', 300); push(1, 400); return 160; }
  if (t === 2) { mood('lift', 300); burst(at, 50, silver, 14); push(.96, 500); return 420; }
  if (t === 3) { mood('silver', 400); halo(card, silver, .45); burst(at, 110, silver, 18); quake(.18, 380); push(.88, 700); embers(run, card, silver, 1400); return 900; }
  // IR and up: the room lights down to the pull. SIR / gold goes further: the room goes dark behind it and a light sweeps across its foil.
  mood(t === 5 ? 'solo' : 'gold', 450).then(() => wait(t === 5 ? 2600 : 1400)).then(() => { if (R === run && run.cur === i && run.stage === 'cards') mood('glow', 1600); });
  if (t === 5) { const g0 = L.glow.position.clone(), r = camBasis().r.clone(); wait(350).then(() => tween(2400, e => { if (R === run) L.glow.position.copy(g0).addScaledVector(r, Math.sin(e * Math.PI * 2) * 9); }, E.lin)); } // right, back across, home
  halo(card, gold, .6); burst(at, 170, gold, 22); quake(.32, 520); push(.84, 800);
  embers(run, card, gold, t === 5 ? 4200 : 2600);
  if (t === 5) setTimeout(() => { if (R === run) burst(card.getWorldPosition(tmpV()), 140, gold, 26); }, 420);
  return t === 5 ? 1700 : 1300;
}
// Every shot of what's laid out keeps the counter: the spread, the dealt packs and the fan go to the mat's back edge, right in
// front of the showcase (as the idle stacks do), and the shot keeps the showcase in its top band, so the cards stay on the counter
// the pack came from instead of cutting to bare rubber. Wide screens look in at SPREAD_PITCH through the front glass. Portrait and
// phones look down steeper (SPREAD_PITCH_TALL): at the landscape pitch a 3–4 row grid keystones and each price tag lands on the
// card below it, and their rows leave a tag's height. Portrait is width-bound, so its spare height goes to the slabs.
const roomy = () => camera.aspect >= 1.15 && !small();
const BACK = MZ - MH / 2 + 1.5; // 1.5 cm inside the mat's far edge
const SHOWCASE = () => new V3(SX, 2.2 + 7, SZ + SD / 2);
// Portrait is width-bound, so it has height to spare: the shot reaches up to the slabs' faces, not just the front glass
// (at the steeper phone pitch the glass alone reads as a white box). A landscape phone is height-bound: only the showcase's foot.
const SLABS = () => new V3(SX, 2.2 + 9.5, SZ - 1.2), FOOT = () => SHOWCASE().setY(2.2 + 2);
const backdrop = () => roomy() ? SHOWCASE() : camera.aspect < 1 ? SLABS() : FOOT();
function gridOf(n) {
  if (roomy()) return gridAt(n, 6, false);
  let best = null; // a phone whose summary squeezed the scene wide still gets the phone shot; its column count is whichever shows the cards biggest
  for (let cols = 3; cols <= 6; cols++) { const g = gridAt(n, cols, true); if (!best || g.cam.d < best.cam.d - .01) best = g; }
  return best;
}
function gridAt(n, cols, tall) {
  const rows = Math.ceil(n / cols), gx = CW + .7, gz = CH + (tall ? 2.6 : 1.6), p = tall ? SPREAD_PITCH_TALL : SPREAD_PITCH;
  const z0 = BACK + CH / 2 + (rows - 1) / 2 * gz, pos = [], pts = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / cols), inRow = Math.min(cols, n - r * cols), c = k - r * cols, at = new V3((c - (inRow - 1) / 2) * gx, .06, (r - (rows - 1) / 2) * gz + z0);
    pos.push(at);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(at.clone().add(new V3(dx * CW / 2, 0, dz * CH / 2)));
    pts.push(at.clone().add(new V3(0, 0, CH / 2 + 1.6))); // its price tag
  }
  pts.push(backdrop());
  return { pos, cam: frameOn(pts, new V3(0, 0, z0), p, tall ? .97 : .94, tall ? -.7 : -.8, .98) };
}
async function toSpread(run) {
  if (run.stage === 'spread') return;
  run.stage = 'spread'; run.busy = true; run.show = null; run.embers = null; drag = null;
  mood('base', 700); opts.onDone();
  const G = gridOf(run.n);
  camTo(G.cam, 1100);
  for (const o of [run.pack, run.pack.userData.strip]) flyTo(o, o.getWorldPosition(tmpV()).add(new V3(-48, 0, -8)), o.getWorldQuaternion(new T.Quaternion()), 900, 1);
  const q = flatQ(0);
  run.cards.forEach((c, k) => setTimeout(() => { if (R === run) flyTo(c, G.pos[k], q, 620, 3); }, k * 55));
  await wait(700 + run.n * 55); if (R !== run) return;
  spreadHalos(run);
  run.busy = false; tags(run);
}
// Laid out, a hit's glow is the lamp bouncing off the mat around it (DESIGN.md「卡面」): the halo drops to just above the rubber,
// under every card, so in an overlapping fan the neighbours cover it instead of it washing gold over their faces.
function spreadHalos(run) {
  run.cards.forEach((c, k) => {
    const t = run.tiers[k]; if (t < 3) return;
    halo(c, css(t >= 4 ? '--fx-gold' : '--fx-silver'), .32); const P = run.haul?.poses[k]; c.userData.halo.position.z = P?.prop ? -.03 : .012 - (P ? P.p.y : c.position.y); // propped up: the glow stays behind the card
  });
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function tags(run) {
  const box = host && host.querySelector('.s3-tags'); if (!box) return;
  const H = run.haul, nu = k => (run.news?.includes(k) ? '<i class="hand-new">新</i>' : '');
  box.innerHTML = run.data.map((c, k) => H?.top.includes(k) // the front row: name over the big caption (mark, rarity, market price)
    ? `<span class="s3-tag s3-top${k === H.top[0] ? ' best' : ''}"><b class="s3-name">${nu(k)}${esc(c.name)}</b>${toHTML(cap(c, 'big'))}</span>`
    : `<span class="s3-tag">${nu(k)}${toHTML(cap(c, 'thumb'))}</span>`).join(''); // the 2D tray's caption: mark + market price; 新 = first pulled by hand
  run.tagEls = [...box.children]; run.tagW = run.tagEls.map(e => e.offsetWidth); // measured once: placeTags runs every frame
  run.sumEl = null;
  if (H?.rest.length) { // one tag for the row behind: how many, how many new, what they're worth together
    const m = H.rest.filter(k => run.news?.includes(k)).length, v = H.rest.reduce((s, k) => s + run.data[k].price, 0);
    run.sumEl = box.appendChild(document.createElement('span')); run.sumEl.className = 's3-tag s3-sum';
    run.sumEl.textContent = `另 ${H.rest.length} 张${m ? `，新卡 ${m}` : ''} · 合计 ${money(v)}`;
  }
}
// An overlapping fan shows only each card's left side: the price goes under that corner. A tag (mark + price) is wider than
// that strip, so tags are stacked over up to three rows, the dearest card placed first; a tag with no free spot in any row
// is left out (tap the card: lifted, it shows its price).
function placeTags(run) {
  if (run.haul) return placeHaulTags(run);
  const w = canvas.clientWidth, h = canvas.clientHeight, left = run.fan?.tight, rows = [[], [], []];
  const at = run.cards.map((c, k) => {
    const corner = left && run.look?.card !== c, p = c.localToWorld(new V3(corner ? -CW / 2 + .2 : 0, -CH / 2 - .15, 0)).project(camera);
    return { k, corner, x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, dy: 0, show: !run.look || run.look.card === c }; // a lifted card keeps its price, the rest step back
  });
  if (left) for (let k = at.length - 1; k >= 0; k--) { // picks are cheapest first
    const a = at[k]; if (!a.corner || !a.show) continue;
    const x0 = a.x, x1 = a.x + run.tagW[k] + 4, r = rows.findIndex(row => row.every(([b0, b1]) => x1 <= b0 || x0 >= b1));
    if (r < 0) a.show = false; else { rows[r].push([x0, x1]); a.dy = r * 22; }
  }
  for (const a of at) {
    const el = run.tagEls[a.k];
    el.style.transform = `translate(${a.x.toFixed(1)}px, ${(a.y + a.dy).toFixed(1)}px)${a.corner ? '' : ' translate(-50%, 0)'}`;
    el.style.opacity = a.show ? 1 : 0;
  }
}
// The front row's tags are as wide as their card (name and rarity wrap inside); the row behind shows only its summary. A lifted
// card keeps its own tag, centred, and the rest step back.
function placeHaulTags(run) {
  const w = canvas.clientWidth, h = canvas.clientHeight, px = v => { const p = v.project(camera); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h]; };
  run.cards.forEach((c, k) => {
    const el = run.tagEls[k], lifted = run.look?.card === c, top = run.haul.top.includes(k), show = run.look ? lifted : top;
    el.style.opacity = show ? 1 : 0; if (!show) return;
    const [x0, y] = px(c.localToWorld(new V3(-CW / 2, -CH / 2 - .15, 0))), [x1] = px(c.localToWorld(new V3(CW / 2, -CH / 2 - .15, 0)));
    el.style.width = top && !lifted ? `${Math.max(0, x1 - x0).toFixed(1)}px` : '';
    el.style.transform = top && !lifted ? `translate(${x0.toFixed(1)}px, ${y.toFixed(1)}px)` : `translate(${((x0 + x1) / 2).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
  });
  const s = run.sumEl; if (!s) return;
  const c = run.cards[run.haul.rest[0]], [x, y] = px(c.localToWorld(new V3(-CW / 2, -CH / 2 - .15, 0)));
  s.style.opacity = run.look ? 0 : 1; s.style.transform = `translate(${Math.max(4, x).toFixed(1)}px, ${y.toFixed(1)}px)`;
}
// In the spread, tap a card to hold it up to the camera; tap again to put it back.
async function look(run, card) {
  if (run.busy) return;
  const L0 = run.look; run.busy = true;
  if (L0) {
    run.look = null; mood('base', 400);
    await flyTo(L0.card, L0.p, L0.q, 420, 1);
    if (card === L0.card || !card) { run.busy = false; return; }
  }
  if (!card) { run.busy = false; return; }
  const f = camBasis().f, d = fit(CW / .6, CH / .66);
  run.look = { card, p: card.position.clone(), q: card.quaternion.clone(), up: false };
  mood('look', 400);
  const to = camera.position.clone().addScaledVector(f, -d);
  await flyTo(card, to, camera.quaternion.clone(), 460, 0);
  if (run.look && run.look.card === card) { run.look.up = true; run.look.base = camera.quaternion.clone(); }
  run.busy = false;
}

// ---------- ten packs at once ----------
// The packs are dealt onto the mat; one tap rips them all left to right (or drag across them: each one tears as the
// finger passes). Only the picks ui/mat.ts hands over (the hits, cheapest first) slide out of their packs and fly
// face-down into a fan at the front; bulk cards never leave the packs. Each tap turns the next pick where it lies; the
// last (best) one is lifted to the eye face-down and held a beat before it turns, the same wait for every batch.
// Picks come plain first (mat.ts): the first tap turns every plain pick (new to 亲手开出, not a hit) in one sweep, so a first
// batch of a set is 1 tap + one per hit instead of one per new card. 全部翻开 skips the bulk, never a UR-or-better: each of those
// still turns on its own with its show, the best one lifted to the eye (a 连开 round, quick, sweeps everything).
const BATCH_PITCH = 1.05, FAN_R = 34;
const qY = a => new T.Quaternion().setFromAxisAngle(new V3(0, 1, 0), a);
const faceDown = q => q.clone().multiply(qY(Math.PI));
// jit: each pack's [x, z] offset in -.5….5, rolled once per batch so a relayout keeps the hand-dealt look.
function packGrid(n, jit) {
  const cols = Math.min(camera.aspect < .8 ? 4 : 5, n), rows = Math.ceil(n / cols); // portrait: 4-4-2, bigger packs
  const gx = cols > 1 ? clamp((camera.aspect * 37 - PW) / (cols - 1), 4.4, PW + 1.2) : 0, over = gx < PW + .3;
  const gz = over ? PH * .74 : PH + 1.5, wide = roomy(), front = BACK + PH / 2 + (rows - 1) * gz, zc = front - (rows - 1) / 2 * gz; // back row at the mat's far edge; crowded rows shingle
  const pos = [], col = [], js = over ? .5 : 1.1;
  for (let k = 0; k < n; k++) { // dealt by hand: not quite on the grid
    const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
    pos.push(new V3((c - (inRow - 1) / 2) * gx + jit[k][0] * js, PUFF + .05 + (over ? c * .45 + r * .55 : 0), front - (rows - 1 - r) * gz + jit[k][1] * js)); col.push(c);
  }
  const pts = [backdrop()];
  for (const at of pos) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(at.clone().add(new V3(dx * PW / 2, 0, dz * PH / 2)));
  return { pos, col, cols, cam: frameOn(pts, new V3(0, 0, zc), wide ? SPREAD_PITCH : SPREAD_PITCH_TALL, wide ? .94 : .97, -.8, .98) };
}
// The fan: an arc whose pivot is toward the player, cheapest on the left, the best on top at the right. Few picks lie
// side by side; many overlap, the fan never gets wider than the view. Behind it the np emptied packs lie flattened in one
// shingled row as wide as the fan, and the shot frames both: the wrappers stay on the mat instead of off its top edge.
function fanOf(n, np) {
  const tall = camera.aspect < .8, room = roomy(), wide = clamp(camera.aspect / 1.25, .45, 1), avail = Math.min(n * (CW + .8) - .8, (tall ? 32 : 46) * wide); // phones: overlap sooner, bigger cards
  const sp = n > 1 ? 2 * Math.asin(clamp((avail - CW) / (2 * FAN_R), 0, 1)) : 0, poses = [];
  const fz = BACK + PH + 1.4 + CH / 2; // the wrappers' row at the mat's far edge, the fan just in front of it
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? (i / (n - 1) - .5) * sp : 0;
    poses.push({ p: new V3(Math.sin(a) * FAN_R, .06 + i * .03, fz + FAN_R * (1 - Math.cos(a))), q: flatQ(-a) });
  }
  const tight = n > 1 && 2 * FAN_R * Math.sin(sp / (n - 1) / 2) < CW + .3;
  const sag = FAN_R * (1 - Math.cos(sp / 2)), W = Math.max(avail, 3 * CW); // one or two picks: framed as if three, so the wrappers don't loom
  const dx = np > 1 ? Math.min(PW + .6, (W - PW) / (np - 1)) : 0, zw = fz - CH / 2 - 1.4 - PH / 2, wrap = [];
  for (let k = 0; k < np; k++) wrap.push(new V3((k - (np - 1) / 2) * dx, .1 + k * .12, zw)); // each a little above the last: shingles
  // the shot: every card's corners and the price tag under it, and the wrappers' corners; the bottom kept clear for the caption
  const pts = [], corner = (P, x, y) => pts.push(new V3(x, y, 0).applyQuaternion(P.q).add(P.p));
  for (const P of poses) { for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) corner(P, x * CW / 2, y * CH / 2); corner(P, 0, -CH / 2 - 2); }
  for (const w of wrap) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(w.clone().add(new V3(x * PW / 2, 0, z * PH / 2)));
  pts.push(camera.aspect < 1 ? SLABS() : FOOT()); // portrait has height to spare; elsewhere only the showcase's foot, the picks stay big
  return { poses, tight, wrap, pts, cam: frameOn(pts, new V3(0, 0, fz), room ? SPREAD_PITCH : SPREAD_PITCH_TALL, .94, tall ? -.56 : -.74, .98) };
}
function buildBatch(set, packs, picks, news) {
  const jit = packs.map(() => [Math.random() - .5, Math.random() - .5]), grid = packGrid(packs.length, jit), data = picks.map(([p, i]) => packs[p][i]);
  const run = { batch: true, data, news, tiers: data.map(tierOf), n: data.length, stage: 'enter', cur: -1, busy: false, grid, jit, fan: fanOf(data.length, packs.length) };
  run.shot = run.grid.cam;
  run.packs = packs.map((_, k) => { const p = buildPack(set, 24, 24, false); p.visible = false; Object.assign(p.userData, { col: grid.col[k], yaw: (Math.random() - .5) * .2, wy: (Math.random() - .5) * .12 }); scene.add(p); return p; });
  const inPack = {};
  run.cards = picks.map(([p, i]) => {
    const m = cardMesh(packs[p][i]), k = inPack[p] = (inPack[p] || 0) + 1;
    m.position.set(0, -.6, .05 - k * .06); m.quaternion.copy(qY(Math.PI)); run.packs[p].add(m); // inside, back up
    return m;
  });
  run.faces = Promise.all(run.cards.map(m => m.userData.ready));
  return run;
}
// froms: world poses ({ p, q }) of shelf packs of this set; the first packs of the batch are dealt from there, the rest drop in.
async function enterBatch(run, froms = []) {
  camTo(run.grid.cam, 700);
  await Promise.all(run.packs.map((p, k) => wait(k * 60).then(() => {
    if (R !== run) return;
    const home = run.grid.pos[k], q = flatQ(p.userData.yaw), f = froms[k], from = f ? f.p : home.clone().add(new V3((Math.random() - .5) * 4, 15, 7));
    const q0 = f ? f.q : q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(.5, -.35, .6)));
    p.visible = true; p.position.copy(from); p.quaternion.copy(q0);
    if (k % 3 === 0) FX().slide();
    return tween(520, e => { p.position.lerpVectors(from, home, e); p.position.y += Math.sin(e * Math.PI) * 2; p.quaternion.slerpQuaternions(q0, q, e); }, E.out);
  })));
  if (R !== run) return;
  run.stage = 'pack';
  if (run.wantTear) tearAll(run);
}
// Drag progress g (0..1 across the whole grid) tears column c while the finger is over it.
function zipTear(run, g) { run.tear = g; for (const p of run.packs) tearPack(p, clamp(g * run.grid.cols - p.userData.col, 0, 1)); }
async function tearAll(run) {
  if (run.stage !== 'pack') { if (run.stage === 'enter') run.wantTear = true; return; }
  run.stage = 'tearing'; opts.onTear();
  await Promise.all(run.packs.map(p => wait(p.userData.col * 75).then(async () => {
    if (R !== run) return;
    const t0 = p.userData.tear || 0; if (t0 < .9) FX().crinkle();
    await tween(300 * (1 - t0) + 40, e => tearPack(p, t0 + (1 - t0) * e), E.in); if (R !== run) return;
    const s = p.userData.strip, at = s.getWorldPosition(tmpV()), side = at.x < 0 ? -1 : 1; // off the side it tore on: back at z −34 was through the showcase glass
    const to = at.clone().add(new V3(side * (46 + Math.random() * 10), 7, 4 + Math.random() * 6));
    flyTo(s, to, s.getWorldQuaternion(new T.Quaternion()), 750, 3, Math.PI * 3).then(() => { s.visible = false; });
  })));
  if (R === run) extractBatch(run);
}
async function extractBatch(run) {
  run.stage = 'extract';
  await Promise.race([run.faces, wait(1500)]); if (R !== run) return;
  run.shot = run.fan.cam; camTo(run.shot, 1000);
  // the packs are pushed back into the row behind the fan; one flattens once nothing is left in it
  const empty = p => !p.children.some(c => run.cards.includes(c)), flatten = p => { if (!p.userData.flat) { p.userData.flat = true; tween(380, e => { p.scale.z = 1 - .62 * e; }, E.out); } };
  run.packs.forEach((p, k) => wait(k * 35).then(() => { if (R === run) flyTo(p, run.fan.wrap[k], flatQ(p.userData.wy), 620, 1).then(() => { if (R === run && empty(p)) flatten(p); }); }));
  await wait(480); if (R !== run) return;
  const step = Math.min(160, 1100 / Math.max(1, run.n));
  await Promise.all(run.cards.map((m, i) => wait(200 + i * step).then(async () => {
    if (R !== run) return;
    FX().slide();
    const y0 = m.position.y, pack = m.parent;
    await tween(240, e => { m.position.y = y0 + e * CH * .8; }, E.out); if (R !== run) return; // out through the torn top
    const P = run.fan.poses[i], fly = flyTo(m, P.p, faceDown(P.q), 640, 6);
    if (empty(pack)) flatten(pack);
    await fly;
  })));
  if (R !== run) return;
  run.stage = 'cards';
  if (run.skip) revealRest(run);
}
// Turn pick i over where it lies: lifted off the mat by half its width so the edge never cuts through it.
const turnOver = (run, i, ms, onHalf) => {
  const m = run.cards[i], P = run.fan.poses[i]; let half = false;
  return tween(ms, e => {
    m.position.copy(P.p); m.position.y += Math.sin(e * Math.PI) * CW * .56;
    m.quaternion.copy(P.q).multiply(qY(Math.PI * (1 - e)));
    if (!half && e >= .5) { half = true; onHalf?.(); }
  }, E.io);
};
function flipNext(run) {
  if (run.stage !== 'cards' || run.busy) return false;
  const i = run.cur + 1;
  if (i >= run.n) { batchSpread(run); return true; }
  run.busy = true;
  if (run.tiers[i] < 2 && i < run.n - 1) { let j = i; while (j + 1 < run.n - 1 && run.tiers[j + 1] < 2) j++; plainSweep(run, i, j); return true; }
  run.cur = i;
  (i === run.n - 1 ? flipBest : flipPick)(run, i);
  return true;
}
// Picks from…to turn over in one wave, about a second whatever the count; only the last gets a caption and a flip sound.
function sweep(run, from, to) {
  const step = Math.min(70, 1100 / (to - from + 1));
  for (let k = from; k <= to; k++) wait((k - from) * step).then(() => { if (R === run) turnOver(run, k, 380, () => opts.onFlip(k, run.data[k], k < to)); });
  run.cur = to;
  return wait((to - from) * step + 420);
}
async function plainSweep(run, from, to) {
  mood('base', 250); FX().slide();
  await sweep(run, from, to); if (R !== run) return;
  run.busy = false;
  if (run.skip) revealRest(run);
}
async function flipPick(run, i) {
  const t = run.tiers[i];
  mood('base', 250);
  await turnOver(run, i, t >= 2 ? 520 : 360, () => opts.onFlip(i, run.data[i]));
  if (R !== run) return;
  if (t >= 4 && !run.quick) await liftShow(run, i, t); // an IR or better that isn't the last: its show up close, not on a far-off card in the fan
  else await wait(Math.min(celebrate(run, i, t), t >= 3 ? 1700 : 700)); // a second big hit in the fan gets its whole show
  if (R !== run) return;
  run.busy = false;
  if (run.skip) revealRest(run);
}
// Where a card is held up to the eye in a batch: just in front of the camera, a little above centre (the caption is below).
const heldAt = () => camera.position.clone().addScaledVector(camBasis().f, -fit(CW / .55, CH / .6)).addScaledVector(camBasis().u, .6);
// Turned face up in the fan, it rises to the eye for its show, then goes back to its place.
async function liftShow(run, i, t) {
  const m = run.cards[i], P = run.fan.poses[i], q = camera.quaternion.clone();
  mood('look', 300);
  await flyTo(m, heldAt(), q, 460, 1); if (R !== run) return;
  run.look = { card: m, p: P.p, q: P.q, up: true, base: q };
  await wait(celebrate(run, i, t) + (run.skip ? 300 : t >= 5 ? 1900 : 900)); if (R !== run) return; // 全部翻开: the show, no lingering
  run.look = null; mood('base', 400);
  await flyTo(m, P.p, P.q, 520, 2);
}
async function flipBest(run, i) {
  const m = run.cards[i], t = run.tiers[i], P = run.fan.poses[i];
  const at = heldAt(), q = camera.quaternion.clone();
  mood('hush', 500); FX().slide(); opts.onHold?.(); run.hero = m;
  await flyTo(m, at, faceDown(q), 600, 2); if (R !== run) return;
  FX().swell(1700);
  await tween(900, e => { m.position.copy(at); m.position.x += Math.sin(e * 70) * .035 * e; m.position.y += Math.sin(e * 53) * .025 * e; }, E.lin); // the face-down pause trembles a little
  if (R !== run) return;
  let half = false;
  await tween(760, e => { m.quaternion.copy(q).multiply(qY(Math.PI * (1 - e))); if (!half && e >= .5) { half = true; opts.onFlip(i, run.data[i]); } }, E.io);
  if (R !== run) return;
  run.look = { card: m, p: P.p, q: P.q, up: true, base: q };
  const lock = celebrate(run, i, t);
  await wait(lock); if (R !== run) return;
  run.busy = false;
  if (run.skip) return batchSpread(run);
  await wait(t >= 4 ? 2400 : t >= 2 ? 1500 : 1000);
  if (R === run && run.stage === 'cards' && !run.busy) batchSpread(run);
}
// 全部翻开: whatever is still face down turns over at once, quietly; a step in progress finishes first.
function revealRest(run) {
  run.skip = true;
  if (run.stage !== 'cards' || run.busy) return;
  const from = run.cur + 1; if (from >= run.n) return batchSpread(run);
  const hit = run.quick ? -1 : run.tiers.findIndex((t, k) => k >= from && t >= 3), to = hit < 0 ? run.n - 1 : hit - 1;
  run.busy = true;
  (to >= from ? sweep(run, from, to) : Promise.resolve()).then(() => {
    if (R !== run) return;
    if (hit < 0) { run.busy = false; batchSpread(run); return; }
    run.cur = hit; (hit === run.n - 1 ? flipBest : flipPick)(run, hit); // they end in revealRest again (run.skip)
  });
}
async function batchSpread(run) {
  if (run.stage === 'spread') return;
  run.stage = 'spread'; run.busy = true; run.show = null; run.embers = null; drag = null;
  mood('base', 700); opts.onDone();
  resize(); // mat.ts has just put the summary under the canvas: lay out for the canvas as it is now, not slide again 160 ms later
  run.look = null; run.hero = null;
  const H = run.haul = haulOf(run); run.shot = H.cam; camTo(H.cam, 900);
  // the rest slide back into one row together, then the best few come forward one by one, the dearest last
  await Promise.all([...H.rest.map((k, j) => [k, j * Math.min(12, 300 / H.rest.length)]), ...H.top.map((k, r) => [k, 260 + (H.top.length - 1 - r) * 140])]
    .map(([k, ms]) => wait(ms).then(() => R === run && flyTo(run.cards[k], H.poses[k].p, H.poses[k].q, 620, H.top.includes(k) ? 3 : 1))));
  if (R !== run) return;
  spreadHalos(run);
  run.busy = false; tags(run);
}
// The spread once a batch is all face up, the shot a player screenshots: the best few (RR and up, dearest first; the best card
// alone when there's no hit) lie side by side in a front row, the dearest in the middle and a little nearer, each tagged with
// name, rarity and price; everything else (plain new cards, lesser hits) shingles in one row behind them under one tag. The
// front row takes as many as fit the fan's width, at most five. The emptied packs stay where the fan left them.
const TOP_MAX = 5, TOP_GAP = 1.1, PROP = .45;
function haulOf(run) {
  const tall = camera.aspect < .8, room = roomy(), avail = Math.max((tall ? 32 : 46) * clamp(camera.aspect / 1.25, .45, 1), 3 * CW + 2 * TOP_GAP);
  const byPrice = run.data.map((_, k) => k).sort((a, b) => run.data[b].price - run.data[a].price), hits = byPrice.filter(k => run.tiers[k] >= 2);
  const top = hits.length ? hits.slice(0, clamp(Math.floor((avail + TOP_GAP) / (CW + TOP_GAP)), 1, small() ? 3 : TOP_MAX)) /* phones: three, or the names don't fit their tags */ : byPrice.slice(0, 1);
  const rest = run.data.map((_, k) => k).filter(k => !top.includes(k)); // cheapest first, as picked
  const K = top.length, slot = [...Array(K).keys()].sort((a, b) => Math.abs(a - (K - 1) / 2) - Math.abs(b - (K - 1) / 2) || a - b); // rank r → slot: centre out
  // the rest lie across the emptied packs (a little in front of their middle, on top of them), the front row just ahead
  const fz = BACK + PH + 1.4 + CH / 2, zw = run.fan.wrap[0]?.z ?? fz, zr = zw + 1.2, zTop = rest.length ? zr + CH + 3.2 : fz, poses = [], q = flatQ(0);
  // the dearest is propped up toward the viewer (its bottom edge on the mat), like the one card a shop stands on a display stand
  const up = q.clone().multiply(new T.Quaternion().setFromAxisAngle(new V3(1, 0, 0), PROP));
  top.forEach((k, r) => { poses[k] = r ? { p: new V3((slot[r] - (K - 1) / 2) * (CW + TOP_GAP), .06, zTop), q } : { p: new V3((slot[0] - (K - 1) / 2) * (CW + TOP_GAP), .1 + Math.sin(PROP) * CH / 2, zTop - (1 - Math.cos(PROP)) * CH / 2 + .6), q: up, prop: true }; });
  const nr = rest.length, dx = nr > 1 ? Math.min(CW + .5, (Math.min(avail, nr * (CW + .5)) - CW) / (nr - 1)) : 0;
  const yr = Math.max(0, ...run.fan.wrap.map(w => w.y)) + .5;
  rest.forEach((k, j) => { poses[k] = { p: new V3((j - (nr - 1) / 2) * dx, yr + j * .03, zr), q }; });
  const pts = [];
  for (const k of top) { const p = poses[k].p; for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(p.clone().add(new V3(x * CW / 2, 0, z * CH / 2))); pts.push(p.clone().add(new V3(0, 0, CH / 2 + (small() ? 6 : 4)))); } // and its two-line tag (on a phone's small cards it's taller than the card is deep)
  for (const k of rest) { const p = poses[k].p; for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(p.clone().add(new V3(x * CW / 2, 0, z * CH / 2))); }
  for (const w of run.fan.wrap) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(w.clone().add(new V3(x * PW / 2, 0, z * PH / 2)));
  pts.push(camera.aspect < 1 ? SLABS() : FOOT());
  return { top, rest, poses, cam: frameOn(pts, new V3(0, 0, (zr + zTop) / 2), room ? SPREAD_PITCH : SPREAD_PITCH_TALL, .94, tall ? -.6 : -.76, .98) };
}

// ---------- the shelf: 今天拆哪包？ ----------
// Until the first pack of a session every set lies on the mat: a stack of what the warehouse holds (up to SHELF_MAX packs;
// the label has the count), one pack when it's out, in the lamp's shadow when it can't be opened. Labels are mat.ts's buttons
// (.s3-shelf, index-aligned with the items), placed under each stack every frame. Pointing at a stack lifts its top pack;
// tapping it calls onPick(k). The pack that gets opened rises from its stack into the hand (enter / enterBatch).
const SHELF_MAX = 12, SHELF_PITCH = PITCH, SHELF_BACK = 25.5, SGX = PW + 2.8, LIFT = 1.1;
// The column count that shows the packs biggest at this aspect; item 0 front left. The packs fill the lower part of the shot;
// the top shows the back of the counter (showcase, binder), so the table reads as a place and not a black box.
function shelfGrid(n) {
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols), pos = [], pts = [], SGZ = PH + (camera.aspect < .8 ? 9.5 : 4.4); // portrait: the labels need more room between rows
    // The front row's near edge stays on the mat, and the back row's centre sits SHELF_BACK behind the mat's centre line (its
    // rear edge ~3 cm inside the mat's far edge), so one or two rows lie right in front of the showcase, not a band of bare mat away.
    const off = Math.min(-3.5, MZ + MH / 2 - 1.5 - ((rows - 1) / 2 * SGZ + PH / 2), (rows - 1) / 2 * SGZ - SHELF_BACK);
    for (let k = 0; k < n; k++) {
      const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols), at = new V3((c - (inRow - 1) / 2) * SGX, 0, ((rows - 1) / 2 - r) * SGZ + off);
      pos.push(at);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(at.clone().add(new V3(dx * (PW / 2 + .6), 0, dz * PH / 2)));
      pts.push(at.clone().add(new V3(0, 0, PH / 2 + 3.2))); // the label under it
    }
    // One or two rows: the showcase's top stays in shot behind them (only its height counts; on a phone its sides are cropped)
    const back = rows <= 2; if (back) pts.push(new V3(SX, 2.2 + 12.4, SZ - 1.2)); // the slabs' tops
    const cam = frameOn(pts, new V3(0, 0, 0), SHELF_PITCH, .92, -.9, back ? .95 : camera.aspect < .8 ? .4 : .22);
    if (!best || cam.d < best.cam.d - .01) best = { pos, cam };
  }
  return best;
}
const idleGeo = () => (shared.idleGeo ||= sheet(-PH / 2, PH / 2, () => 0, () => 0, 1, 24, 20)); // an untorn front face; lying flat, nothing else shows
// A set's stack: new stock is squared up (packs a few mm off each other), the top one a little askew as if just put back.
// Everything under the top pack is one InstancedMesh, so a tall stack costs two draw calls (and two for its shadow).
function stackOf(item, g) {
  g.clear(); g.userData.item = item;
  const mat = item.off ? packArt(item.set).dim : packArt(item.set).front, n = Math.max(1, Math.min(SHELF_MAX, item.n)), rest = [];
  for (let k = 0; k < n; k++) rest.push({ p: new V3((Math.random() - .5) * .3, .08 + k * .34, (Math.random() - .5) * .24), q: flatQ((Math.random() - .5) * (k === n - 1 ? .16 : .06)) });
  if (n > 1) {
    const im = new T.InstancedMesh(idleGeo(), mat, n - 1), m = new T.Matrix4(), one = new V3(1, 1, 1);
    for (let k = 0; k < n - 1; k++) im.setMatrixAt(k, m.compose(rest[k].p, rest[k].q, one));
    im.computeBoundingSphere(); im.castShadow = true; g.add(im); g.userData.under = im;
  } else g.userData.under = null;
  const top = new T.Mesh(idleGeo(), mat); top.userData.rest = rest[n - 1]; top.castShadow = true;
  top.position.copy(rest[n - 1].p); top.quaternion.copy(rest[n - 1].q); g.add(top); g.userData.top = top;
}
function buildShelf(items, sig) {
  const L = shelfGrid(items.length), run = { shelf: true, stage: 'enter', items, sig, hot: -1, cards: [], cam: L.cam, lift: items.map(() => 0) };
  run.group = new T.Group(); scene.add(run.group);
  run.stacks = items.map((it, k) => { const g = new T.Group(); g.position.copy(L.pos[k]); stackOf(it, g); g.visible = false; run.group.add(g); return g; });
  return run;
}
async function enterShelf(run) {
  camTo(run.cam, 900);
  await Promise.all(run.stacks.map((g, k) => wait(120 + k * 70).then(() => {
    if (R !== run) return;
    g.visible = true; if (k % 2 === 0) FX().slide();
    const home = g.position.clone(), from = home.clone().add(new V3((Math.random() - .5) * 3, 14, 6)), q0 = new T.Quaternion().setFromEuler(new T.Euler(.4, -.3, .5));
    return tween(560, e => { g.position.lerpVectors(from, home, e); g.position.y += Math.sin(e * Math.PI) * 2; g.quaternion.slerpQuaternions(q0, new T.Quaternion(), e); }, E.out);
  })));
  if (R === run) run.stage = 'shelf';
}
// Same sets and counts: nothing to do (mat.ts calls this on every game tick). A changed stack is rebuilt; a new top pack drops on.
function updateShelf(run, items, sig) {
  run.sig = sig;
  items.forEach((it, k) => {
    const old = run.items[k], g = run.stacks[k];
    if (!g || (old.n === it.n && old.off === it.off)) return;
    const grew = it.n > old.n && !it.off; stackOf(it, g);
    if (grew) { const r = g.userData.top.userData.rest, y = r.p.y; tween(420, e => { r.p.y = y + 6 * (1 - e); }, E.out); } // tickShelf places the top pack from rest
  });
  run.items = items;
}
function shelfHit(e) {
  const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), camera);
  const hit = ray.intersectObjects(R.stacks.map(g => g.userData.top), false)[0];
  return hit ? R.stacks.findIndex(g => g.userData.top === hit.object) : -1;
}
function shelfHover(run, k) {
  if (k >= 0 && run.items[k].off) k = -1;
  if (run.hot === k) return;
  run.hot = k; canvas.style.cursor = k >= 0 ? 'pointer' : ''; wake(IDLE);
}
// Every frame while awake: the hovered top pack rises and tips toward the eye; labels follow their stacks on screen.
function tickShelf(run, dt) {
  let moving = false;
  run.stacks.forEach((g, k) => {
    const want = run.hot === k ? 1 : 0, l = run.lift[k] += (want - run.lift[k]) * Math.min(1, dt * 10), t = g.userData.top, rest = t.userData.rest;
    if (Math.abs(want - l) > 1e-3) moving = true;
    t.position.copy(rest.p).setY(rest.p.y + l * LIFT); t.quaternion.copy(rest.q).multiply(qX(l * .22));
  });
  const els = host.querySelectorAll('.s3-shelf > *'), w = canvas.clientWidth, h = canvas.clientHeight;
  run.stacks.forEach((g, k) => {
    const el = els[k]; if (!el) return;
    const p = g.localToWorld(new V3(0, 0, PH / 2 + .5)).project(camera);
    el.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px, ${((1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%, 0)`;
    el.classList.toggle('hot', run.hot === k); el.classList.toggle('in', run.stage === 'shelf');
  });
  return moving;
}
const qX = a => new T.Quaternion().setFromAxisAngle(new V3(1, 0, 0), a);
// A shelf pack leaves for the hand: its world pose, and it's gone from the stack. null if the set isn't on the shelf.
function takeFromShelf(run, set, n) {
  const g = run.stacks.find(s => s.userData.item.set === set); if (!g) return [];
  const out = [], top = g.userData.top, im = g.userData.under, m = new T.Matrix4(), take = w => { const p = new V3(), q = new T.Quaternion(); w.decompose(p, q, new V3()); out.push({ m: w, p, q }); };
  g.updateMatrixWorld(true);
  if (top.visible) { take(top.matrixWorld.clone()); top.visible = false; }
  while (im && im.count > 0 && out.length < n) { im.getMatrixAt(im.count - 1, m); take(im.matrixWorld.clone().multiply(m)); im.count--; }
  return out;
}

// ---------- input on the canvas ----------
function setPtr(e) {
  const r = canvas.getBoundingClientRect();
  ptr.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); ptr.y = clamp(1 - (e.clientY - r.top) / r.height * 2, -1, 1);
  ptr.in = e.pointerType === 'mouse' || !!drag;
}
// On-screen width of a row of objects, in CSS px: for a drag across all ten packs.
function spanW(objs) {
  const xs = objs.map(o => o.getWorldPosition(tmpV()).project(camera).x);
  return Math.max(80, (Math.max(...xs) - Math.min(...xs)) / 2 * canvas.clientWidth + screenW(objs[0], PW));
}
function screenW(obj, w) {
  const a = obj.localToWorld(new V3(-w / 2, 0, 0)).project(camera), b = obj.localToWorld(new V3(w / 2, 0, 0)).project(camera);
  return Math.max(40, Math.abs(b.x - a.x) / 2 * canvas.clientWidth);
}
function onDown(e) {
  if (!R || e.button > 0) return;
  FX().unlock();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: null }; setPtr(e);
}
function onMove(e) {
  setPtr(e); if (ptr.in) wake(IDLE);
  if (R?.shelf) { if (R.stage === 'shelf' && e.pointerType === 'mouse') shelfHover(R, shelfHit(e)); return; }
  if (!drag || e.pointerId !== drag.id || !R) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, run = R;
  if (!drag.mode && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    drag.mode = run.stage === 'pack' ? 'tear' : run.stage === 'cards' && !run.batch && !run.busy && run.cur < run.n - 1 ? 'slide' : 'none';
    if (drag.mode !== 'none') { canvas.setPointerCapture?.(e.pointerId); drag.w = run.batch ? spanW(run.packs) : screenW(drag.mode === 'tear' ? run.pack : run.cards[run.cur], drag.mode === 'tear' ? PW : CW); drag.c = 0; }
    if (drag.mode === 'slide') { run.dragging = true; if (run.cur + 1 >= run.n - 3) { mood('hush', 400); camD(stages().reveal.d * .93, 800); } }
  }
  if (drag.mode === 'tear') {
    const p = clamp(dx / (drag.w * .95), 0, 1); if (run.batch) zipTear(run, p); else setTear(run, p);
    if (Math.abs(p - drag.c) > .12) { drag.c = p; FX().crinkle(); }
  }
  if (drag.mode === 'slide') { run.slide = clamp(dx / (drag.w * 1.1), 0, 1.15); slideFront(run.cards[run.cur], run.slide); }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag, run = R; drag = null; ptr.in = e.pointerType === 'mouse';
  if (!run) return;
  if (d.mode === 'tear') {
    if (run.tear >= .5) { if (run.batch) tearAll(run); else autoTear(run); }
    else { const p0 = run.tear; tween(220, k => (run.batch ? zipTear : setTear)(run, p0 * (1 - k)), E.out); }
  } else if (d.mode === 'slide') {
    run.dragging = false;
    if (run.slide >= .45) uncover(run);
    else { const s0 = run.slide, c = run.cards[run.cur]; mood('base', 300); tween(200, k => { run.slide = s0 * (1 - k); slideFront(c, run.slide); }, E.out); }
  } else if (!d.mode && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) tap(e);
}
function onCancel(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag, run = R; drag = null;
  if (!run) return;
  if (d.mode === 'tear') (run.batch ? zipTear : setTear)(run, 0);
  if (d.mode === 'slide') { run.dragging = false; run.slide = 0; slideFront(run.cards[run.cur], 0); mood('base', 300); }
}
function tap(e) {
  const run = R;
  if (run.shelf) { const k = run.stage === 'shelf' ? shelfHit(e) : -1; if (k >= 0 && !run.items[k].off) opts.onPick?.(k); return; }
  if (run.stage === 'pack' || run.stage === 'enter') return run.batch ? tearAll(run) : autoTear(run);
  if (run.stage === 'cards') return advance(run);
  if (run.stage === 'spread') {
    const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), camera);
    const hit = ray.intersectObjects(run.cards, false)[0];
    look(run, hit ? hit.object : null);
  }
}

// ---------- frame ----------
// raf is -1 while a frame runs, so a wake() from inside it (particles spawned by a show) doesn't queue a second one; a frame
// that throws still hands the loop back (the error surfaces in the console, the next wake() starts it again).
function frame(t) {
  raf = -1; let again = false;
  try { again = tick(t); } finally { raf = again ? requestAnimationFrame(frame) : 0; }
}
function tick(t) {
  renderer.info.reset();
  const dt = Math.min(.05, Math.max(0, (t - last) / 1000)); last = t; now = t;
  stepTweens();
  if (relay && !tws.length && !drag && now >= relay) relayout();
  placeCam(camera, cam);
  const k = Math.min(1, dt * 6), run = R, tx = ptr.in ? ptr.x : 0, ty = ptr.in ? ptr.y : 0, leanTo = run && (run.stage === 'enter' || run.stage === 'pack' || run.stage === 'tearing') ? 1 : 0;
  tilt.x += (tx - tilt.x) * k; tilt.y += (ty - tilt.y) * k;
  const s = t / 1000; let sway = 0;
  if (run && run.show) { const a = (t - run.show.t0) / 1000; sway = Math.sin(a * 3.4) * run.show.amp * Math.exp(-a * .9); if (a > 5) run.show = null; }
  lean += (leanTo - lean) * k; // a sealed pack is held at a slight angle so its pillow shows
  const sh = shake.amp * Math.max(0, 1 - (t - shake.t0) / shake.ms);
  const shelfMoving = run?.shelf ? tickShelf(run, dt) : false;
  let litMoving = false; // the card in hand fades onto its hand light (uLit), the rest back to the room's
  if (run?.cards?.length) {
    const hero = run.look?.card || run.hero || (!run.batch && (run.stage === 'cards' || run.stage === 'extract') ? run.cards[run.cur] : null);
    for (const c of run.cards) {
      const u = c.material[0].uniforms.uLit, to = c === hero ? 1 : 0;
      if (Math.abs(to - u.value) > .003) { u.value += (to - u.value) * Math.min(1, dt * 7); litMoving = true; } else u.value = to;
    }
  }
  const busy = tws.length > 0 || !!drag || sh > 0 || now < aliveUntil || !!(run && (run.show || run.embers)) || shelfMoving || litMoving || !!relay ||
    Math.abs(tx - tilt.x) + Math.abs(ty - tilt.y) + Math.abs(leanTo - lean) > 1e-4;
  if (busy) awake = Math.max(awake, now + IDLE);
  breath += ((now < awake ? 1 : 0) - breath) * Math.min(1, dt * 3); // the idle sway fades in on wake and out before the loop parks
  const b = breath;
  grip.rotation.set(-tilt.y * .2 + Math.sin(s * .7) * .02 * b + lean * .05, tilt.x * .3 + Math.sin(s * .45) * .05 * b + sway - lean * .2, Math.sin(s * .6) * .012 * b + lean * .03);
  grip.position.y = Math.sin(s * 1.1) * .07 * b;
  if (run && run.look && run.look.up) { // a card held to the eye stays there when the camera moves (a resize reframes the table)
    const Lk = run.look; Lk.off ||= camera.worldToLocal(Lk.card.position.clone());
    Lk.card.position.copy(camera.localToWorld(Lk.off.clone()));
    Lk.card.quaternion.copy(camera.quaternion).multiply(new T.Quaternion().setFromEuler(new T.Euler(-tilt.y * .35, tilt.x * .45, 0)));
  }
  if (run && run.embers) run.embers();
  parts.update(dt);
  if (run && run.stage === 'cards' && run.cur >= 0 && moodNow.rays > .01) { // god rays stay behind the card being shown
    const c = run.cards[run.cur], f = camBasis().f; rays.position.copy(c.getWorldPosition(tmpV())).addScaledVector(f, -1.2); rays.quaternion.copy(camera.quaternion);
  }
  applyMood();
  shared.u.time.value = s; rays.material.uniforms.uTime.value = s;
  if (sh > 0) { camera.position.x += (Math.random() - .5) * sh; camera.position.y += (Math.random() - .5) * sh; }
  if (seen) { composer.render(dt); frames++; } // off screen (phones scroll the mat in after the click) the motion still runs, undrawn
  if (run && run.stage === 'spread' && run.tagEls) placeTags(run);
  return busy || now < awake || breath > .002;
}
let frames = 0; // drawn frames, for the dev probe below
function park() { if (raf > 0) cancelAnimationFrame(raf); raf = 0; }
function resize() {
  if (!host) return;
  const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  parts.mat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * TAN); shared.u.dpr.value = renderer.getPixelRatio();
  if (R && !tws.length && R.stage !== 'spread') { // keep the shot right while the window is still being dragged
    const set = st => { cam.t.copy(st.t); cam.d = st.d; };
    if (R.shelf) set(R.cam = shelfGrid(R.items.length).cam);
    else if (R.batch && R.stage === 'cards') set(R.shot = (R.fan = fanOf(R.n, R.packs.length)).cam);
    else if (R.batch) set(packGrid(R.packs.length, R.jit).cam);
    else if (R.stage === 'pack') cam.d = stages().pack.d; else if (R.stage === 'cards') cam.d = stages().reveal.d;
  }
  relay = performance.now() + 160; wake(400); // and 160 ms after the last resize, lay the table out again for the new shape
}
// The layout depends on the aspect (shelf and grid columns, the fan's width, where the pile goes), so a new shape moves the
// things on the mat to where they'd have been dealt, and the camera to frame them. Runs from tick() once nothing is tweening.
let relay = 0;
function relayout() {
  relay = 0; const run = R; if (!run) return;
  if (run.batch && run.stage === 'extract') { relay = now + 160; return; } // cards are in flight to the current fan: reframe once they've landed
  const ms = 380, go = (o, p, q) => { const p0 = o.position.clone(), q0 = o.quaternion.clone(); tween(ms, k => { o.position.lerpVectors(p0, p, k); if (q) o.quaternion.slerpQuaternions(q0, q, k); }); };
  const home = (card, p, q) => { if (run.look?.card === card) { run.look.p = p; run.look.q = q; if (!run.look.up) go(card, p, q); } else go(card, p, q); };
  if (run.shelf) {
    const Lg = shelfGrid(run.items.length); run.cam = Lg.cam;
    run.stacks.forEach((g, k) => go(g, Lg.pos[k])); camTo(run.cam, ms);
  } else if (run.batch) {
    if (run.stage === 'enter' || run.stage === 'pack' || run.stage === 'tearing') {
      run.grid = packGrid(run.packs.length, run.jit); run.shot = run.grid.cam;
      run.packs.forEach((p, k) => { p.userData.col = run.grid.col[k]; go(p, run.grid.pos[k]); });
    } else {
      run.fan = fanOf(run.n, run.packs.length); run.shot = run.fan.cam;
      run.packs.forEach((p, k) => go(p, run.fan.wrap[k]));
      if (run.haul) { run.haul = haulOf(run); run.shot = run.haul.cam; run.cards.forEach((c, k) => home(c, run.haul.poses[k].p, run.haul.poses[k].q)); spreadHalos(run); tags(run); } // the front row may take more or fewer
      else if (run.stage !== 'extract') run.cards.forEach((c, i) => { const P = run.fan.poses[i]; home(c, P.p, i <= run.cur ? P.q : faceDown(P.q)); });
    }
    camTo(run.shot, ms);
  } else if (run.stage === 'spread') {
    const Gd = gridOf(run.n), q = flatQ(0);
    run.cards.forEach((c, k) => home(c, Gd.pos[k], q)); camTo(Gd.cam, ms);
  } else if (run.stage === 'cards' || run.stage === 'extract') {
    const sp = spots(); run.pileAt = sp.pile; camD(stages().reveal.d, ms);
    run.cards.forEach(c => { if (c.parent === scene && c.userData.off) go(c, sp.pile.clone().add(c.userData.off)); });
    if (run.pack.parent === scene) go(run.pack, sp.rest);
    const st = run.pack.userData.strip; if (st.parent === scene) go(st, sp.strip);
  } else camD(stages().pack.d, ms);
}

// ---------- table, theme ----------
// The counter the player stands behind (DESIGN.md「题材」): a laminate top with a bevelled edge and an aluminium trim, the shop's
// rubber playmat on it, and at the back what a card counter holds: a glass countertop showcase with graded slabs, a binder, a stack of toploaders, a pack of sleeves. Colours come from tokens (laminate = --bg, binder = card-back navy,
// aluminium trim = --trim, the skin's navy anodized case frame); the props sit outside the lamp's cone and in the fog, so the packs and cards stay the lit subject.
// None of the props casts a shadow; the whole world is ~16 draw calls.
let world0 = null; // theme-dependent textures: { laminate canvas, mat canvas, binder canvas, materials }
function drawMat(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height, s = W / MW, ink = css('--mat-ink'), line = a => rgba(ink, a);
  x.fillStyle = css('--mat'); x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data; // rubber grain
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.strokeStyle = line(.08); x.lineWidth = 3; x.beginPath(); x.roundRect(3 * s, 3 * s, W - 6 * s, H - 6 * s, 1.5 * s); x.stroke();
  x.setLineDash([.5 * s, .35 * s]); x.strokeStyle = line(.22); x.lineWidth = .12 * s; x.beginPath(); x.roundRect(.7 * s, .7 * s, W - 1.4 * s, H - 1.4 * s, 2.2 * s); x.stroke(); x.setLineDash([]);
  // printed like a play mat: card-sized zones down both sides, named the way a Chinese PTCG mat names them
  const zone = (cx, cz, label) => { // cx, cz in cm from the mat's centre
    const px = (MW / 2 + cx) * s, py = (MH / 2 + cz) * s, w = (CW + .6) * s, h = (CH + .6) * s;
    x.strokeStyle = line(.12); x.lineWidth = .06 * s; x.beginPath(); x.roundRect(px - w / 2, py - h / 2, w, h, .5 * s); x.stroke();
    if (label) { x.fillStyle = line(.14); x.font = `500 ${.7 * s}px ${BODY()}`; x.textAlign = 'center'; x.fillText(label, px, py + h / 2 + .95 * s); }
  };
  for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 2; c2++) zone(-MW / 2 + 5.2 + c2 * 7.4, -MH / 2 + 7.5 + r * 10.3, r === 2 && c2 === 0 ? '奖赏卡' : '');
  zone(MW / 2 - 5.2, -MH / 2 + 7.5, '牌库'); zone(MW / 2 - 5.2, -MH / 2 + 7.5 + 12.2, '弃牌区');
  // the shop's mark where packs get opened: two thin rings, ticks, the name at the near edge
  const cx = MW / 2 * s, cy = (MH / 2 + (-5.5 - MZ)) * s, r1 = 11 * s;
  x.strokeStyle = line(.1); x.lineWidth = .08 * s; x.beginPath(); x.arc(cx, cy, r1, 0, Math.PI * 2); x.stroke();
  x.lineWidth = .035 * s; x.beginPath(); x.arc(cx, cy, r1 - .5 * s, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .5) continue; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r1 - .5 * s), cy + Math.sin(a) * (r1 - .5 * s)); x.lineTo(cx + Math.cos(a) * (r1 - (i % 5 ? .8 : 1.2) * s), cy + Math.sin(a) * (r1 - (i % 5 ? .8 : 1.2) * s)); x.stroke(); }
  x.fillStyle = line(.14); x.font = `900 ${1.4 * s}px ${DISP()}`; x.textAlign = 'center'; x.fillText('欧气卡铺', cx, cy + r1 - .15 * s);
}
// Laminate: the page colour with a fine paper-fleck print and faint long streaks, as a real laminate top has.
function drawLaminate(c) {
  const x = c.getContext('2d'), W = c.width, bg = css('--bg'), ink = css('--ink');
  x.fillStyle = bg; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 2600; i++) { x.fillStyle = rgba(Math.random() < .5 ? ink : '#FFFFFF', .02 + Math.random() * .05); x.fillRect(Math.random() * W, Math.random() * W, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
  for (let i = 0; i < 40; i++) { x.fillStyle = rgba(ink, .012 + Math.random() * .015); x.fillRect(0, Math.random() * W, W, 1 + Math.random() * 4); }
}
// The binder's cover: card-back navy with the card back's ring pressed into it and the shop's name.
function drawBinder(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height, b1 = css('--back-1'), b2 = css('--back-2');
  x.fillStyle = b2; x.fillRect(0, 0, W, H);
  x.strokeStyle = rgba(b1, .9); x.lineWidth = 10; x.beginPath(); x.arc(W / 2, H * .45, W * .26, 0, Math.PI * 2); x.stroke();
  x.fillStyle = rgba(b1, .9); x.fillRect(W * .24, H * .45 - 5, W * .52, 10); x.beginPath(); x.arc(W / 2, H * .45, 22, 0, Math.PI * 2); x.fill();
  x.fillStyle = rgba(css('--back-ring'), .55); x.font = `900 44px ${DISP()}`; x.textAlign = 'center'; x.fillText('欧气卡铺', W / 2, H * .82);
  x.strokeStyle = rgba('#FFFFFF', .08); x.lineWidth = 3; x.strokeRect(14, 14, W - 28, H - 28); // stitched border
}
// The penny sleeves' pack, seen from above: clear sleeves over a white backing card, a card-back navy header with the shop's name.
function drawSleeves(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = css('--stock'); x.fillRect(0, 0, W, H);
  x.fillStyle = css('--back-2'); x.fillRect(0, 0, W, H * .3);
  x.fillStyle = css('--back-ring'); x.textAlign = 'center';
  x.font = `900 40px ${DISP()}`; x.fillText('欧气卡铺', W / 2, H * .15);
  x.font = `600 22px ${BODY()}`; x.fillText('卡套 · 100 枚', W / 2, H * .25);
  x.fillStyle = css('--stock-ink'); x.font = `600 18px ${BODY()}`; x.fillText('66 × 91 mm', W / 2, H * .93);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(W * .08, H * .34, W * .08, H * .55); // the light on the sleeves' plastic
  x.strokeStyle = css('--stock-edge'); x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3);
}
// The showcase's deck: card-back felt, lit by the LED strip under the front of the lid, so the pool is brightest at the front edge
// and behind the slabs, fading to the back corners.
function drawDeck(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = css('--back-2'); x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data; // felt
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  const g = x.createRadialGradient(W / 2, H * .72, 0, W / 2, H * .72, W * .55);
  g.addColorStop(0, rgba(css('--lamp'), .16)); g.addColorStop(1, rgba(css('--lamp'), 0));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}
// A graded slab's insert: the grading label over the card, as one texture.
function slabCanvas(img, grade) {
  const W = 256, H = 404, c = canvasOf(W, H), x = c.getContext('2d');
  x.fillStyle = '#EEF1F6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FFFFFF'; x.fillRect(8, 8, W - 16, 58); x.strokeStyle = css('--back-2'); x.lineWidth = 2; x.strokeRect(8, 8, W - 16, 58);
  x.fillStyle = css('--back-2'); x.font = `900 22px ${DISP()}`; x.textAlign = 'left'; x.fillText('欧气卡铺 鉴定', 18, 44);
  x.font = `700 40px ${BODY()}`; x.textAlign = 'right'; x.fillText(grade, W - 18, 52);
  if (img) x.drawImage(img, 22, 80, W - 44, (W - 44) * 88 / 63); else { x.fillStyle = css('--back-1'); x.fillRect(22, 80, W - 44, (W - 44) * 88 / 63); }
  return c;
}
function world() {
  const merge = M.mergeGeometries, grain = grainTex();
  const lamC = canvasOf(256, 256), lam = canvasTex(lamC); lam.wrapS = lam.wrapT = T.RepeatWrapping; lam.repeat.set(1 / 24, 1 / 24);
  const matC = canvasOf(1536, Math.round(1536 * MH / MW)), matMap = canvasTex(matC); matMap.repeat.set(1 / MW, 1 / MH); matMap.offset.set(.5, .5);
  const binC = canvasOf(512, 600), binMap = canvasTex(binC);
  grain.repeat.set(1 / 5, 1 / 5);
  const metal = new T.MeshStandardMaterial({ color: css('--trim'), metalness: 1, roughness: .36, envMapIntensity: 1.3 }); // anodized: satin, not mirror
  // Glass only adds light: a black body blended additively leaves what's behind it as it is and puts back the reflections, and
  // those rise at grazing angles on their own. A white body at 10% was a milky fog over the slabs, a white box at the phones' pitch.
  const glass = new T.MeshPhysicalMaterial({ color: 0x000000, transparent: true, blending: T.AdditiveBlending, roughness: .04, metalness: 0, envMapIntensity: 1.3, depthWrite: false });
  const acrylic = new T.MeshPhysicalMaterial({ color: 0xFFFFFF, transparent: true, opacity: .22, roughness: .03, metalness: 0, envMapIntensity: 1.6, depthWrite: false }); // the toploaders: a stack has to read as a body
  const place = (m, x, y, z, yaw = 0) => { m.position.set(x, y, z); m.rotation.y = yaw; scene.add(m); return m; };
  const TOP = -.4; // the counter's top face (the mat lies on it)

  // counter: a bevelled laminate slab, its back edge capped in aluminium
  const cg = new T.ExtrudeGeometry(roundRect(CX * 2, CZ0 - CZ1, 1.2), { depth: 3.2, bevelEnabled: true, bevelThickness: .4, bevelSize: .4, bevelSegments: 3, curveSegments: 6 });
  cg.rotateX(-Math.PI / 2); cg.translate(0, TOP - 3.6, (CZ0 + CZ1) / 2);
  counter = place(new T.Mesh(cg, new T.MeshStandardMaterial({ map: lam, roughness: .42, metalness: 0, envMapIntensity: .5, normalMap: grain, normalScale: new T.Vector2(.04, .04) })), 0, 0, 0);
  counter.receiveShadow = true;
  const trim = new T.CylinderGeometry(.55, .55, CX * 2 - 1, 16, 1); trim.rotateZ(Math.PI / 2);
  place(new T.Mesh(trim, metal), 0, TOP - .3, CZ1 - .15);

  // the rubber playmat: grain, printed zones and the shop's mark
  const mg = new T.ExtrudeGeometry(roundRect(MW, MH, 2.5), { depth: .3, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 2, curveSegments: 8 });
  mg.rotateX(-Math.PI / 2); mg.translate(0, TOP + .02, MZ);
  playmat = place(new T.Mesh(mg, new T.MeshStandardMaterial({ map: matMap, normalMap: grain, normalScale: new T.Vector2(.35, .35), roughness: .93, metalness: 0, envMapIntensity: .25 })), 0, 0, 0);
  playmat.receiveShadow = true;

  // glass countertop showcase, back centre (right behind the idle packs, so the first look has the shop's slabs in it): laminate plinth, aluminium frame, glass, three slabs
  const plinth = new T.BoxGeometry(SW + 1, 2.2, SD + 1); plinth.translate(0, 1.1, 0);
  const show = new T.Group(); place(show, SX, TOP, SZ, -.04);
  show.add(new T.Mesh(plinth, counter.material));
  const bars = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const g = new T.BoxGeometry(.5, SH, .5); g.translate(x * SW / 2, 2.2 + SH / 2, z * SD / 2); bars.push(g); }
  for (const y of [2.2, 2.2 + SH]) for (const z of [-1, 1]) { const g = new T.BoxGeometry(SW, .5, .5); g.translate(0, y, z * SD / 2); bars.push(g); }
  for (const y of [2.2 + SH]) for (const x of [-1, 1]) { const g = new T.BoxGeometry(.5, .5, SD); g.translate(x * SW / 2, y, 0); bars.push(g); }
  show.add(new T.Mesh(merge(bars), metal));
  const pane = new T.BoxGeometry(SW, SH, SD); pane.translate(0, 2.2 + SH / 2, 0); pane.clearGroups(); pane.addGroup(0, 18, 0); pane.addGroup(24, 12, 0); // no floor face: the deck is the floor
  // the deck the slabs stand on: card-back felt with the LED's light pool printed in (theme() draws it; a real light would cost every material a recompile)
  const deckC = canvasOf(512, Math.round(512 * SD / SW)), deckMap = canvasTex(deckC);
  const deck = new T.Mesh(new T.PlaneGeometry(SW - .5, SD - .5), new T.MeshStandardMaterial({ map: deckMap, roughness: .95, envMapIntensity: .15, normalMap: grain, normalScale: new T.Vector2(.25, .25) }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = 2.2 + .26; show.add(deck);
  const led = new T.Mesh(new T.BoxGeometry(SW - 2, .25, .25), new T.MeshBasicMaterial({ color: new T.Color(css('--lamp')).multiplyScalar(2.2) })); led.position.set(0, 2.2 + SH - .5, SD / 2 - .8);
  const slabs = new T.InstancedMesh(new T.BoxGeometry(7.6, 12, .7), glass, 3), m4 = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(-.22, 0, 0));
  const chase = [['sv08', '238', '10'], ['sv10', '231', '10'], ['sv08.5', '161', '9.5']];
  chase.forEach(([set, n, grade], i) => {
    const at = new V3((i - 1) * 8.6, 2.2 + 6.2, -1.2), c = slabCanvas(null, grade), t = canvasTex(c);
    slabs.setMatrixAt(i, m4.compose(at, q, new V3(1, 1, 1)));
    const ins = new T.Mesh(new T.PlaneGeometry(6.8, 10.7), new T.MeshStandardMaterial({ map: t, roughness: .6, envMapIntensity: .3 }));
    ins.position.copy(at).add(new V3(0, 0, .02)); ins.quaternion.copy(q); show.add(ins);
    loadImg(ASSETS.card(set, n, 'low')).then(img => { if (img) { t.image = slabCanvas(img, grade); t.needsUpdate = true; wake(100); } });
  });
  show.add(slabs, led, new T.Mesh(pane, [glass])); // an array, or three draws the whole box and ignores the groups

  // a 4-pocket binder, back left, with index tabs
  const bg = new T.ExtrudeGeometry(roundRect(21, 26, 1.1), { depth: 2.6, bevelEnabled: true, bevelThickness: .35, bevelSize: .35, bevelSegments: 3, curveSegments: 6 });
  bg.rotateX(-Math.PI / 2); bg.translate(0, .35, 0);
  const cover = new T.MeshStandardMaterial({ map: binMap, roughness: .66, normalMap: grain, normalScale: new T.Vector2(.3, .3), envMapIntensity: .4 });
  binMap.repeat.set(1 / 21, 1 / 26); binMap.offset.set(.5, .5);
  const binder = place(new T.Mesh(bg, cover), -39, TOP, -47, .22);
  const tabs = new T.InstancedMesh(new T.BoxGeometry(1.6, .25, 2.6), new T.MeshStandardMaterial({ color: css('--foil-2'), roughness: .5 }), 3);
  for (let i = 0; i < 3; i++) tabs.setMatrixAt(i, m4.compose(new V3(11, 1.6, -7 + i * 5), new T.Quaternion(), new V3(1, 1, 1)));
  binder.add(tabs);

  // back right: toploaders with a pulled card in the top one, and a pack of penny sleeves with its paper header
  const tops = new T.InstancedMesh(new T.BoxGeometry(7.7, .14, 10.2), acrylic, 7);
  for (let i = 0; i < 7; i++) tops.setMatrixAt(i, m4.compose(new V3((Math.random() - .5) * .5, .1 + i * .16, (Math.random() - .5) * .5), new T.Quaternion().setFromEuler(new T.Euler(0, (Math.random() - .5) * .12, 0)), new V3(1, 1, 1)));
  const tl = place(tops, 24, TOP, -39, -.3);
  const kept = new T.Texture(),  inTop = new T.Mesh(new T.PlaneGeometry(CW, CH), new T.MeshStandardMaterial({ map: kept, roughness: .5, envMapIntensity: .4 }));
  inTop.rotation.x = -Math.PI / 2; inTop.position.set(0, .1 + 6 * .16 + .02, 0); tl.add(inTop);
  kept.colorSpace = T.SRGBColorSpace; kept.anisotropy = renderer.capabilities.getMaxAnisotropy(); // no image until the scan loads (an 8×8 stand-in fixed the GPU texture at 8×8: the card came out a grey square)
  loadImg(ASSETS.card('sv08', '219', 'low')).then(img => { if (img) { kept.image = img; kept.needsUpdate = true; wake(100); } });
  const slvC = canvasOf(256, 340), slvMap = canvasTex(slvC), slvSide = new T.MeshStandardMaterial({ color: css('--stock'), transparent: true, opacity: .5, roughness: .3 });
  place(new T.Mesh(new T.BoxGeometry(7.2, 1.1, 9.6), [slvSide, slvSide, new T.MeshStandardMaterial({ map: slvMap, roughness: .45, envMapIntensity: .4 }), slvSide, slvSide, slvSide]), 33, TOP + .55, -45, .45);

  world0 = { lamC, matC, binC, slvC, deckC, lam, matMap, binMap, slvMap, deckMap, led };
}
function theme() {
  // The room past the counter is the shop in the lamp's shadow (the HUD's navy, both themes), not the page: a white fog in the
  // light theme washed the whole table out inside the navy case frame. A white laminate is held under the lamp so it doesn't clip.
  const room = new T.Color(css('--hud')), bg = new T.Color(css('--bg')), hsl = {};
  renderer.setClearColor(room); scene.fog.color.copy(room); veil.material.color.copy(room).multiplyScalar(.3); // the room, lights off
  counter.material.color.setScalar(bg.getHSL(hsl).l > .6 ? .72 : 1);
  L.hemi.groundColor.set(css('--mat')); L.hemi.color.set(css('--lamp-fill')); L.key.color.set(css('--lamp')); L.rim.color.set(css('--lamp-rim'));
  const w = world0; drawMat(w.matC); drawLaminate(w.lamC); drawBinder(w.binC); drawSleeves(w.slvC); drawDeck(w.deckC);
  w.matMap.needsUpdate = w.lam.needsUpdate = w.binMap.needsUpdate = w.slvMap.needsUpdate = w.deckMap.needsUpdate = true; w.led.material.color.set(css('--lamp')).multiplyScalar(2.2);
  wake(100);
}

function init() {
  V3 = T.Vector3;
  renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
  renderer.info.autoReset = false; // frame() resets it once per frame, so the counts cover every pass (the probe reads them)
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.VSMShadowMap;
  canvas = renderer.domElement; canvas.className = 's3-canvas';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '开包台：桌上的补充包和卡');
  scene = new T.Scene(); scene.fog = new T.Fog(0x000000, 105, 300); // only the room past the counter fades, never the mat
  camera = new T.PerspectiveCamera(FOV, 1, 1, 400); probe = camera.clone(); cam.t = FOCUS();
  const pm = new T.PMREMGenerator(renderer), room = new M.RoomEnvironment();
  scene.environment = pm.fromScene(room, .04).texture; scene.environmentIntensity = .42; pm.dispose(); room.dispose?.();

  const hemi = new T.HemisphereLight(css('--lamp-fill'), css('--mat'), .5);
  const key = new T.SpotLight(css('--lamp'), 1.6, 0, .5, .9, 0);
  key.position.set(-12, 46, 22); key.target.position.copy(HOLD()); // the lamp is on what's in the hand; the mat under it stays in the cone
  key.castShadow = true; key.shadow.mapSize.setScalar(small() ? 1024 : 2048); key.shadow.bias = -.0006;
  key.shadow.radius = 9; key.shadow.blurSamples = 16; key.shadow.intensity = .8;
  key.shadow.camera.near = 20; key.shadow.camera.far = 120;
  const rim = new T.DirectionalLight(css('--lamp-rim'), .7); rim.position.set(8, 16, -30);
  const glow = new T.PointLight(0xFFFFFF, 0, 0, 2); glow.position.copy(GLOW0()); // in front of the held card
  scene.add(hemi, key, key.target, rim, glow);
  L = { hemi, key, rim, glow };

  hand = new T.Group(); hand.position.copy(HOLD()); hand.lookAt(HOLD().add(new V3(0, Math.sin(PITCH), Math.cos(PITCH))));
  grip = new T.Group(); hand.add(grip); scene.add(hand);

  const cardGeo = new T.ExtrudeGeometry(roundRect(CW, CH, CR), { depth: CT, bevelEnabled: false, curveSegments: 6 }); cardGeo.translate(0, 0, -CT / 2);
  const back = canvasTex(canvasOf(8, 8)), blank = canvasTex(canvasOf(8, 8));
  shared = { cardGeo, blank, back: { value: back },
    edge: new T.MeshStandardMaterial({ color: css('--stock'), roughness: .8 }), // the cut edge: bare card stock
    inner: new T.MeshStandardMaterial({ color: 0xC3C9D2, metalness: 1, roughness: .38, side: T.BackSide }),
    crinkle: crinkleTex() };
  shared.inner.normalMap = shared.crinkle;
  svgTex(backSVG()).then(t => { back.dispose(); shared.back.value = t; wake(100); }); // card.ts's back, the one the 2D mat and the share image show
  shared.u = { back: shared.back, time: { value: 0 }, key: { value: new V3() }, keyDir: { value: new V3() }, glowAt: { value: new V3() }, cone0: { value: 0 }, cone1: { value: 1 }, keyCol: { value: new T.Color() }, amb: { value: new T.Color() }, wash: { value: new T.Color() }, dpr: { value: 1 } };

  world();
  parts = makeParticles(900); scene.add(parts.pts);
  rays = new T.Mesh(new T.PlaneGeometry(70, 70), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uCol: { value: new T.Color() }, uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uAmt, uTime; varying vec2 vUv;
      void main() { vec2 p = vUv - 0.5; float r = length(p), a = atan(p.y, p.x);
        float s = pow(max(0.0, sin(a * 11.0 + uTime * 0.22)), 14.0) + 0.6 * pow(max(0.0, sin(a * 5.0 - uTime * 0.15)), 18.0);
        gl_FragColor = vec4(uCol * uAmt * (s * 0.7 + 0.22 * smoothstep(0.3, 0.0, r)) * smoothstep(0.5, 0.08, r) * smoothstep(0.015, 0.08, r), 1.0); }` }));
  rays.renderOrder = -1; scene.add(rays);
  veil = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, opacity: 0, fog: false, toneMapped: false })); // writes depth: the glow of cards behind it (additive, drawn later) stays hidden
  veil.renderOrder = -2; veil.visible = false; scene.add(veil); // drawn before the rays and sparks; those in front of it stay lit

  composer = new M.EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 }));
  composer.addPass(new M.RenderPass(scene, camera));
  bloom = new M.UnrealBloomPass(new T.Vector2(256, 256), .35, .45, 1.6);
  composer.addPass(bloom); composer.addPass(new M.OutputPass());

  theme(); fonts().then(() => { if (renderer) theme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', theme);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  for (const s of SETS) packArt(s.id); // paint every set's pack art up front so the first pack isn't blank

  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) { ptr.in = false; wake(); if (R?.shelf) shelfHover(R, -1); } });
  canvas.addEventListener('webglcontextlost', e => { // drop back to the 2D mat; ui/mat.ts keeps the pack's state
    e.preventDefault(); dead = true;
    const o = opts; close?.(); o?.onLost?.();
  });
  ro = new ResizeObserver(resize);
  if (import.meta.env?.DEV) window.__t3 = { renderer, get frames() { return frames; }, get run() { return R; }, look: k => look(R, R.cards[k]) }; // dev probe: frame count, renderer.info, hold spread card k up
  io = new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; if (seen && R) wake(IDLE); });
}

// ---------- teardown ----------
const packsOf = run => (run.batch ? run.packs : run.shelf ? [] : [run.pack]);
function dispose(run) {
  run.group?.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); // shelf packs share one geometry and the set's material: only the instance buffers go
  for (const c of run.cards) { c.material[0].dispose(); c.userData.face?.dispose(); if (c.userData.halo) { c.userData.halo.geometry.dispose(); c.userData.halo.material.dispose(); } }
  for (const p of packsOf(run)) for (const o of [p, p.userData.strip]) o.traverse(m => { if (m.isMesh && m.geometry !== shared.cardGeo) m.geometry.dispose(); }); // the strip may have flown off the pack
}
function clearRun(run, animate) {
  run.tagEls?.forEach(e => e.remove()); run.sumEl?.remove();
  const objs = [...packsOf(run).flatMap(p => [p, p.userData.strip]), ...run.cards, ...(run.group ? [run.group] : [])];
  if (!animate) { objs.forEach(o => o.removeFromParent()); dispose(run); return; }
  const old = new T.Group(); scene.add(old); objs.forEach(o => old.attach(o));
  tween(520, k => { old.position.x = -60 * k; }, E.in).then(() => { old.removeFromParent(); dispose(run); });
}

function advance(run) {
  if (run?.batch) return flipNext(run);
  if (!run || run.stage !== 'cards' || run.busy || run.dragging) return false;
  if (run.cur >= run.n - 1) toSpread(run); else uncover(run);
  return true;
}
function revealAll(run) {
  if (run?.batch) { if (run.stage === 'tearing' || run.stage === 'extract') run.skip = true; else if (run.stage === 'cards') revealRest(run); return; }
  if (!run || run.stage === 'spread' || run.stage === 'pack' || run.stage === 'enter' || run.stage === 'tearing') return;
  if (run.stage === 'extract') { run.skip = true; return; }
  run.skip = true; if (run.busy) return; // the card being uncovered lands first, then this runs again
  // 全部翻开 skips the bulk, not the hit: the cards before a UR-or-better go to the pile, then it is revealed with its show
  const k = run.tiers.findIndex((t, j) => j > run.cur && t >= 3);
  if (k < 0) { for (let i = run.cur + 1; i < run.n; i++) opts.onFlip(i, run.data[i], true); return toSpread(run); }
  run.busy = true;
  for (let j = run.cur; j < k - 1; j++) { const c = run.cards[j]; opts.onFlip(j + 1, run.data[j + 1], true); wait((j - run.cur) * 60).then(() => { if (R === run) toss(run, c); }); }
  run.cur = k - 1; reveal(run, k);
}

// ---------- the one export ----------
let dead = false, close = null; // dead: a lost WebGL context keeps the 2D mat for the rest of the session
function mountTable(el, o) {
  if (!T || dead) return null;
  if (!renderer) try { init(); } catch (e) { console.warn('[table3d] no WebGL; the 2D mat stays', e); dead = true; return null; }
  close?.();
  opts = o; speed = o.reducedMotion ? 0 : 1; host = el;
  ro.observe(el); io.observe(el); el.prepend(canvas); resize();
  for (const k in moodNow) moodNow[k] = MOODS.base[k] ?? 0;
  const fresh = (quick = false) => {
    speed = o.reducedMotion ? 0 : quick ? QUICK : 1;
    resize(); // mat.ts has just rewritten the header / dropped the summary: lay the new run out for the canvas as it is now, not as the ResizeObserver last saw it
    tws = []; parts.clear(); drag = null; L.glow.position.copy(GLOW0()); canvas.style.cursor = '';
    mood('base', 400); // tws = [] also dropped a show's fade back to base (a new pack started right after a gold pull kept its rays)
    if (R) clearRun(R, true);
  };
  const shut = () => {
    if (opts !== o) return;
    park(); tws = []; drag = null; parts.clear();
    if (R) { clearRun(R, false); R = null; }
    canvas.remove(); host = null; opts = null; close = null; ro.disconnect(); io.disconnect();
  };
  close = shut;
  return {
    // The idle table: items [{ set, n, off }] in label order. Called on every game tick; unchanged items cost nothing.
    showShelf(items) {
      if (opts !== o) return;
      const sig = items.map(i => `${i.set}:${i.n}:${i.off ? 1 : 0}`).join();
      if (R?.shelf && R.items.length === items.length) { if (R.sig !== sig) updateShelf(R, items, sig); return; }
      fresh();
      R = buildShelf(items, sig); enterShelf(R);
    },
    hover(k) { if (opts === o && R?.shelf) shelfHover(R, k); }, // a label under the stack is pointed at or focused (-1: none)
    showPack(set, cards) { // a new pack drops in (or rises from its stack on the shelf); the last one's cards slide off the mat
      if (opts !== o) return;
      const from = R?.shelf ? takeFromShelf(R, set, 1)[0]?.m : null;
      fresh();
      R = build(set, cards); enter(R, from);
    },
    // Ten packs (or however many the stock allowed) at once. picks: [packIndex, cardIndex] of the cards that fly to the
    // front, in the order they turn over (cheapest first). onFlip(k, card) then counts picks, not cards.
    // news: pick indexes whose price tag says 新 (first pulled by hand); quick: a 连开 round, every move at QUICK × its time.
    /** @param {{ news?: number[], quick?: boolean }} [o2] */
    showBatch(set, packs, picks, o2 = {}) {
      const { news = [], quick = false } = o2;
      if (opts !== o) return;
      const froms = R?.shelf ? takeFromShelf(R, set, packs.length) : [];
      fresh(quick);
      R = buildBatch(set, packs, picks, news); R.quick = quick; enterBatch(R, froms);
    },
    // Once the batch is laid out, pick k is lifted to the camera as a tap on it would (tap again to put it back). Resolves when it's up.
    async lookAt(k) {
      const run = R; if (opts !== o || !run?.batch) return;
      while (R === run && (run.stage !== 'spread' || run.busy)) await wait(100);
      if (R === run && !run.look) await look(run, run.cards[k]);
    },
    // Move the table on to card i: tears a sealed pack, uncovers the next card, or (i ≥ cards) lays the pack out.
    flip(i) {
      const run = R; if (opts !== o || !run || run.shelf) return false;
      if (run.stage === 'enter' || run.stage === 'pack') { if (run.batch) tearAll(run); else autoTear(run); return true; }
      return i > run.cur && advance(run);
    },
    flipAll() { if (opts === o && !R?.shelf) revealAll(R); },
    resize() { if (opts === o) resize(); },
    dispose: shut,
  };
}
export { mountTable };
