// Opening mat as a live three.js scene: a foil booster on a rubber playmat, tear the crimp, the stack slides out,
// slide the front card aside to uncover the next, foil shaders on the cards, a show scaled to the pull's rarity.
// Pure presentation: it renders exactly the cards it is handed (one pack from G.open), in that order, and
// reports progress through callbacks. It never reads the game or src/sim.ts and has no say in what a pack contains.
// Plain JS (tsconfig allowJs, not type-checked). Interface, used by src/ui/mat.ts:
//   mountTable(el, { onTear, onFlip(i, card), onDone, onLost?, reducedMotion }) → { showPack(set, cards), flip(i), flipAll(), resize(), dispose() } | null
// three.js: node_modules in dev, the import map vite.config.ts injects in builds (CDN, same pinned version). mountTable returns
// null while three is still loading, if it failed to load, or without WebGL; mat.ts then keeps the 2D mat.
import * as fx from './fx.ts';
import * as ASSETS from './assets.ts';
import { SETS } from './sets.ts';
// Animation-synced sounds (crinkle, slide, swell) come from src/fx.ts; flip and tear sounds are ui/mat.ts's, via the callbacks.
const FX = () => fx;
let T, M;
// Literal specifiers so Vite resolves them: node_modules in dev, the CDN import map in builds (still lazy: a failed CDN only costs the 3D mat).
Promise.all([import('three'), import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
  import('three/addons/postprocessing/OutputPass.js'), import('three/addons/environments/RoomEnvironment.js')])
  .then(([three, ...addons]) => { T = three; M = Object.assign({}, ...addons); })
  .catch(e => console.warn('[table3d] three.js did not load; the 2D mat stays', e));
// Rarity tier drives the show: 0 bulk, 1 reverse/holo rare, 2 RR/ACE/Poké Ball/foil energy, 3 UR, 4 IR/Master Ball, 5 SIR/HR.
const TIER = { R: 1, REV: 1, RR: 2, ACE: 2, PB: 2, FE: 2, UR: 3, IR: 4, MB: 4, SIR: 5, HR: 5 };
const tierOf = c => TIER[c.kind] || 0;
const small = () => matchMedia('(max-width: 779px), (pointer: coarse)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Real sizes in cm: a card is 63×88 mm with 3 mm corners; an SV booster is about 74×128 mm with ~9.5 mm crimps.
const CW = 6.3, CH = 8.8, CT = 0.032, CR = 0.32, PW = 7.4, PH = 12.8, CRIMP = 0.95, TEAR = PH / 2 - 1.25, PUFF = 0.42;
const MW = 76, MH = 56, MZ = -8; // playmat size and where its centre sits
const FOV = 30, TAN = Math.tan(FOV / 2 * Math.PI / 180), PITCH = 0.9, SPREAD_PITCH = 1.18;

let V3, renderer, scene, camera, probe, composer, bloom, canvas, host = null, raf = 0, last = 0, now = 0, seen = true;
let hand, grip, L, parts, rays, playmat, counter, shared, io, ro, drag = null, opts = null, speed = 1;
let R = null; // the pack on the mat right now
let lean = 0;
const ptr = { x: 0, y: 0, in: false }, tilt = { x: 0, y: 0 }, shake = { t0: 0, ms: 1, amp: 0 };
const cam = { t: null, p: PITCH, d: 36 };

// ---------- tweens: every motion is a promise, advanced once per frame ----------
const E = { io: p => (p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2), out: p => 1 - (1 - p) ** 3, in: p => p * p * p,
  back: p => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2, lin: p => p };
let tws = [];
const tween = (ms, fn, ease = E.io) => new Promise(res => tws.push({ t0: now, ms: ms * speed, fn, ease, res }));
const wait = ms => tween(ms, () => {});
function stepTweens() {
  const list = tws; tws = [];
  for (const w of list) { const p = w.ms > 0 ? Math.min(1, (now - w.t0) / w.ms) : 1; w.fn(w.ease(p)); if (p < 1) tws.push(w); else w.res(); }
}

// ---------- canvases → textures ----------
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function canvasTex(c, color = true) {
  const t = new T.CanvasTexture(c); t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
const loadImg = url => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
const fonts = () => Promise.race([
  Promise.all(['400 90px "ZCOOL QingKe HuangYou"'].map(f => document.fonts?.load(f, '欧气卡铺超电突围命运对决棱镜进化宝可梦151草火水雷超斗恶钢能量') || null)),
  new Promise(r => setTimeout(r, 1500))]).catch(() => {});
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
  x.textAlign = 'center'; x.fillStyle = '#FFFFFF'; x.font = `400 108px ${DISP()}`;
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
  x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.9)'; x.font = `400 70px ${DISP()}`; x.fillText('欧气卡铺', 70, 560);
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
  return (artCache[setId] = { front: mk(tx[0], tx[2]), back: mk(tx[1], tx[3]) });
}

// Pillow shape: flat crimps top and bottom, flat side seams, puffed in the middle.
function puff(x, y) {
  const sx = 1 - smooth(PW / 2 - .8, PW / 2 - .04, Math.abs(x)), sy = smooth(CRIMP, CRIMP + 1.5, PH / 2 - Math.abs(y));
  return PUFF * Math.sqrt(sx * sy) * (1 + .05 * Math.sin(x * 1.7 + y * .6));
}
const COLS = 60;
function sheet(yA, yB, jA, jB, side, rows) {
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
function buildPack(setId) {
  const mats = packArt(setId), pack = new T.Group(), strip = new T.Group(), ph = Math.random() * 9;
  const teeth = c => (c % 2 ? .09 : 0), tearJ = c => .06 * Math.sin(c * .9 + ph) + .04 * Math.sin(c * 2.3 + ph * 2), zero = () => 0;
  const SC = (TEAR + PH / 2) / 2, stripGeos = [];
  for (const side of [1, -1]) {
    const body = sheet(-PH / 2, TEAR, teeth, tearJ, side, 64), top = sheet(TEAR, PH / 2, tearJ, c => -teeth(c), side, 10);
    top.translate(0, -SC, 0); stripGeos.push({ geo: top, orig: top.attributes.position.array.slice() });
    for (const [geo, parent] of [[body, pack], [top, strip]]) {
      const outer = new T.Mesh(geo, side > 0 ? mats.front : mats.back); outer.castShadow = true;
      parent.add(outer, new T.Mesh(geo, shared.inner));
    }
  }
  strip.position.y = SC; pack.add(strip);
  Object.assign(pack.userData, { strip, stripGeos, tearY: TEAR - SC, zero });
  return pack;
}
// Tear progress p (0..1) runs the tear front from left to right; the loose end behind it swings up about the front
// (more the further back, so the flap curls) and lifts off the pack a little.
function setTear(run, p) {
  run.tear = p;
  const ty = run.pack.userData.tearY, xf = -PW / 2 + p * PW;
  for (const { geo, orig } of run.pack.userData.stripGeos) {
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
// uKind: 0 plain, 1 reverse holo (all but the art box), 2 holo art box, 3 full holo, 4 etched full art, 5 gold, 6 ball pattern reverse, 7 cosmos
const CARD_FS = `
  uniform sampler2D uFace, uBack; uniform float uKind, uFoil, uTime, uCone0, uCone1; uniform vec3 uKey, uKeyDir, uKeyCol, uAmb, uWash, uGlowAt;
  varying vec2 vUv; varying float vFront; varying vec3 vN, vP, vR, vU;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  vec3 spectrum(float x) { return 0.5 + 0.5 * cos(6.2832 * (x + vec3(0.0, 0.33, 0.67))); }
  void main() {
    vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
    bool front = vFront > 0.5;
    vec4 t = front ? texture2D(uFace, vUv) : texture2D(uBack, vUv);
    vec3 base = mix(vec3(0.6, 0.63, 0.68), t.rgb, t.a);
    vec3 Lk = normalize(uKey - vP); // the lamp is a spot: outside its cone a card only gets the room fill
    vec3 lamp = uKeyCol * smoothstep(uCone0, uCone1, dot(-Lk, uKeyDir));
    vec3 gd = uGlowAt - vP; vec3 wash = uWash * 40.0 / (dot(gd, gd) + 4.0); // the show light sits just in front of the held card and falls off
    vec3 col = base * (uAmb + lamp * max(dot(N, Lk), 0.0) + wash);
    col += lamp * pow(max(dot(N, normalize(Lk + V)), 0.0), 90.0) * 0.16;
    vec2 ang = vec2(dot(V, vR), dot(V, vU));
    float gl = (vUv.x + vUv.y) * 0.5 - 0.5 - ang.x * 1.7 - ang.y * 1.2; // laminate glare sliding across as the card tilts
    col += exp(-gl * gl * 28.0) * 0.06 * (uAmb + lamp);
    if (front && uKind > 0.5) {
      float k = uKind, luma = dot(base, vec3(0.299, 0.587, 0.114));
      float art = step(0.075, vUv.x) * step(vUv.x, 0.925) * step(0.525, vUv.y) * step(vUv.y, 0.903);
      float mask = k < 1.5 || (k > 5.5 && k < 6.5) ? 1.0 - art : k < 2.5 ? art : 1.0;
      vec3 rb = spectrum(vUv.x * 0.8 + vUv.y * 1.2 + ang.x * 2.6 + ang.y * 1.9);
      float tx = 1.0;
      if (k > 3.5 && k < 5.5) tx = 0.45 + 0.8 * vnoise(vUv * vec2(64.0, 90.0)) * vnoise(vUv * vec2(9.0, 12.6) + 3.0);
      if (k > 5.5 && k < 6.5) { float r = length(fract(vUv * vec2(8.0, 11.2)) - 0.5); tx = 0.25 + smoothstep(0.35, 0.31, r) - 0.6 * smoothstep(0.25, 0.21, r); }
      if (k > 6.5) { vec2 c = floor(vUv * 12.0); vec2 q = fract(vUv * 12.0) - 0.5 - (vec2(hash(c), hash(c + 7.1)) - 0.5) * 0.4; float rr = 0.12 + hash(c + 3.3) * 0.25; tx = 0.3 + smoothstep(rr, rr - 0.04, length(q)); }
      if (k > 4.5 && k < 5.5) rb = mix(vec3(1.0, 0.8, 0.36), rb, 0.22);
      float h = hash(floor(vUv * vec2(84.0, 118.0)));
      float spark = step(0.9, h) * pow(max(0.0, sin(h * 91.0 + ang.x * 38.0 + ang.y * 29.0 + uTime * 0.6)), 40.0);
      float amt = mask * uFoil;
      col = mix(col, col * (0.55 + rb * 1.25), amt * (k > 3.5 ? 0.38 : 0.55) * tx);
      col += rb * amt * tx * (0.06 + 0.28 * luma) + spark * amt * (k > 3.5 ? 1.1 : k < 1.5 ? 0.35 : 0.7) * (uAmb + lamp + wash);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const FOIL = { REV: [1, .75], R: [2, .8], RR: [3, .75], ACE: [3, .8], PB: [6, .85], MB: [6, 1], UR: [4, 1], IR: [4, .8], SIR: [4, 1], HR: [5, 1], FE: [7, .85] };
const foilOf = c => FOIL[c.kind] || [0, 0];

function roundRect(w, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function backCanvas() {
  const W = 512, H = Math.round(W * CH / CW), c = canvasOf(W, H), x = c.getContext('2d'), b1 = css('--back-1'), b2 = css('--back-2'), ring = css('--back-ring');
  x.fillStyle = b2; x.fillRect(0, 0, W, H);
  const m = 24, gr = x.createRadialGradient(W * .3, H * .22, 20, W * .5, H * .5, H * .7); gr.addColorStop(0, b1); gr.addColorStop(1, b2);
  x.fillStyle = gr; x.beginPath(); x.roundRect(m, m, W - 2 * m, H - 2 * m, 16); x.fill();
  x.save(); x.translate(W / 2, H / 2); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) { x.rotate(.7); x.fillStyle = 'rgba(120,160,255,.05)'; x.beginPath(); x.ellipse(60, 0, 250, 70, 0, 0, Math.PI * 2); x.fill(); }
  x.restore();
  x.fillStyle = ring; x.beginPath(); x.arc(W / 2, H / 2, 74, 0, Math.PI * 2); x.fill();
  x.fillStyle = b2; x.fillRect(W / 2 - 76, H / 2 - 8, 152, 16);
  x.beginPath(); x.arc(W / 2, H / 2, 26, 0, Math.PI * 2); x.fill(); x.fillStyle = ring; x.beginPath(); x.arc(W / 2, H / 2, 15, 0, Math.PI * 2); x.fill();
  return c;
}
// Energy has no card art in the data: paint a basic energy card in its type colour.
const ETYPE = { 草: '#3E9B4F', 火: '#D8492C', 水: '#2F7FC9', 雷: '#E7B521', 超: '#8C52B3', 斗: '#B4622F', 恶: '#2E4652', 钢: '#8996A5' };
function energyCanvas(c) {
  const W = 512, H = Math.round(W * CH / CW), cv = canvasOf(W, H), x = cv.getContext('2d'), t = c.name.slice(2, 3), col = ETYPE[t] || '#8996A5';
  x.fillStyle = '#C9CED6'; x.fillRect(0, 0, W, H);
  const gr = x.createRadialGradient(W / 2, H * .42, 40, W / 2, H / 2, H * .6); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, rgba(col, .55));
  x.fillStyle = gr; x.beginPath(); x.roundRect(22, 22, W - 44, H - 44, 14); x.fill();
  x.fillStyle = col; x.beginPath(); x.arc(W / 2, H * .44, 150, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 10; x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#FFFFFF'; x.font = `400 190px ${DISP()}`; x.fillText(t, W / 2, H * .44 + 66);
  x.fillStyle = '#1F2833'; x.font = `600 46px ${BODY()}`; x.fillText(c.name, W / 2, H * .8);
  return cv;
}
function placeholder(c) {
  const W = 512, H = Math.round(W * CH / CW), cv = canvasOf(W, H), x = cv.getContext('2d');
  x.fillStyle = '#C9CED6'; x.fillRect(0, 0, W, H); x.fillStyle = '#E9ECF0'; x.fillRect(22, 22, W - 44, H - 44);
  x.fillStyle = '#1F2833'; x.textAlign = 'center'; x.font = `600 40px ${BODY()}`;
  (c.name.match(/.{1,14}/g) || [c.name]).forEach((l, i) => x.fillText(l, W / 2, H * .45 + i * 50));
  x.font = `400 26px ${BODY()}`; x.fillStyle = '#5A6371'; x.fillText('卡图没加载出来', W / 2, H * .7); return cv;
}
async function loadFace(c) {
  if (c.r === 'E') { await fonts(); return canvasTex(energyCanvas(c)); }
  for (const size of ['high', 'low']) {
    const img = await loadImg(ASSETS.card(c.set, c.n, size));
    if (img) { const t = new T.Texture(img); t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true; renderer.initTexture(t); return t; }
  }
  return canvasTex(placeholder(c));
}
function cardMesh(c) {
  const [kind, foil] = foilOf(c), u = shared.u;
  const cap = new T.ShaderMaterial({ vertexShader: CARD_VS, fragmentShader: CARD_FS,
    uniforms: { uFace: { value: shared.blank }, uBack: u.back, uKind: { value: kind }, uFoil: { value: foil }, uTime: u.time, uKey: u.key, uKeyDir: u.keyDir, uCone0: u.cone0, uCone1: u.cone1, uGlowAt: u.glowAt, uKeyCol: u.keyCol, uAmb: u.amb, uWash: u.wash } });
  const m = new T.Mesh(shared.cardGeo, [cap, shared.edge]); m.castShadow = true;
  m.userData.ready = loadFace(c).then(t => { cap.uniforms.uFace.value = t; m.userData.face = t; });
  return m;
}
const HALO_FS = `uniform vec3 uCol; uniform float uAmt; varying vec2 vP;
  float sdr(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() { float d = sdr(vP, vec2(${CW / 2}, ${CH / 2}), ${CR}); gl_FragColor = vec4(uCol * uAmt * exp(-max(d, 0.0) * 1.5) * smoothstep(-0.3, 0.0, d), 1.0); }`;
function halo(card, col, amt, ms = 500) {
  let h = card.userData.halo;
  if (!h) {
    h = new T.Mesh(new T.PlaneGeometry(CW + 5, CH + 5), new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color() }, uAmt: { value: 0 } },
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
  look: { hemi: .3, key: 1.2, cone: .5, glow: .5, bloom: .15, rays: 0, col: '--fx-silver' },
};
const moodNow = { hemi: .5, key: 1.6, cone: .5, glow: 0, bloom: .12, rays: 0 };
function mood(name, ms = 500) {
  const m = MOODS[name], a = { ...moodNow }, col = new T.Color(css(m.col)), c0 = L.glow.color.clone();
  return tween(ms, p => {
    for (const k in a) moodNow[k] = a[k] + (m[k] - a[k]) * p;
    L.glow.color.copy(c0).lerp(col, p); rays.material.uniforms.uCol.value.copy(L.glow.color);
  });
}
function applyMood() {
  const k = L.key; k.intensity = moodNow.key; k.angle = moodNow.cone;
  L.hemi.intensity = moodNow.hemi; L.glow.intensity = moodNow.glow * 10;
  bloom.strength = moodNow.bloom; rays.material.uniforms.uAmt.value = moodNow.rays;
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
const FOCUS = () => new V3(0, 7, 0);
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
async function enter(run) {
  camTo(stages().pack, 700);
  const p = run.pack; p.position.y = 17;
  await tween(800, k => { p.position.y = 17 * (1 - k); p.rotation.set(.5 * (1 - k), -.4 * (1 - k), .25 * (1 - k)); }, E.back);
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
function rip(run) {
  run.stage = 'extract';
  const s = run.pack.userData.strip, st = stages().reveal, land = onTable(small() ? .45 : .5, small() ? .8 : .62, st);
  flyTo(s, land.setY(.06), flatQ(Math.random() * 2 - 1), 950, 7, Math.PI * 4);
  opts.onTear();
  extract(run);
}
async function extract(run) {
  await Promise.race([run.faces, wait(1500)]); if (R !== run) return;
  const st = stages(), wide = camera.aspect > 1;
  camTo({ ...st.pack, d: st.pack.d * 1.12 }, 800);
  FX().slide(); opts.onFlip(0, run.data[0]);
  await tween(800, k => { run.stack.position.y = -.4 + 7.2 * k; run.pack.position.y = -5 * k; }, E.io);
  if (R !== run) return;
  run.pileAt = onTable(wide ? .7 : .84, wide ? -.08 : -.18, st.reveal); // portrait: half off the side edges, clear of the caption
  const rest = onTable(wide ? -.72 : -.86, wide ? .02 : -.12, st.reveal).setY(PUFF + .05);
  flyTo(run.pack, rest, flatQ(-.35 + Math.random() * .2), 850, 3);
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
  const at = run.pileAt.clone().add(new V3(j(), .06 + k * CT * 1.1, j()));
  flyTo(card, at, flatQ(-.2 + (Math.random() - .5) * .5), 480, 2.5);
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
  if (i === run.n - 1) { await wait(t >= 4 ? 2200 : t >= 2 ? 1300 : 800); if (R === run && run.stage === 'cards' && !run.busy) toSpread(run); }
}
// The show, by rarity tier (0 bulk … 5 SIR/HR). It starts only once the card is fully uncovered.
function celebrate(run, i, t) {
  const card = run.cards[i], at = card.getWorldPosition(tmpV()), silver = css('--fx-silver'), gold = css('--fx-gold');
  if (t === 0) { mood('base', 300); camD(stages().reveal.d, 400); return 40; }
  run.show = { t0: now, amp: [0, .12, .16, .22, .3, .36][t] };
  if (t === 1) { mood('base', 300); camD(stages().reveal.d, 400); return 160; }
  if (t === 2) { mood('lift', 300); halo(card, silver, .5); burst(at, 50, silver, 14); camD(stages().reveal.d * .96, 500); return 420; }
  if (t === 3) { mood('silver', 400); halo(card, silver, .7); burst(at, 110, silver, 18); quake(.18, 380); camD(stages().reveal.d * .88, 700); embers(run, card, silver, 1400); return 900; }
  mood('gold', 450).then(() => wait(1400)).then(() => { if (R === run && run.cur === i && run.stage === 'cards') mood('glow', 1600); });
  halo(card, gold, .9); burst(at, 170, gold, 22); quake(.32, 520); camD(stages().reveal.d * .84, 800);
  embers(run, card, gold, t === 5 ? 4200 : 2600);
  if (t === 5) setTimeout(() => { if (R === run) burst(card.getWorldPosition(tmpV()), 140, gold, 26); }, 420);
  return t === 5 ? 1700 : 1300;
}
function gridOf(n) {
  const cols = camera.aspect >= 1.15 ? 6 : camera.aspect >= .78 ? 4 : 3, rows = Math.ceil(n / cols), gx = CW + .7, gz = CH + 1.6;
  const pos = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / cols), inRow = Math.min(cols, n - r * cols), c = k - r * cols;
    pos.push(new V3((c - (inRow - 1) / 2) * gx, .06, (r - (rows - 1) / 2) * gz - .6));
  }
  const w = cols * gx, h = rows * gz;
  return { pos, cam: { t: new V3(0, 0, .8), p: SPREAD_PITCH, d: fit(w * 1.02, h * Math.sin(SPREAD_PITCH) * 1.08 + 4) } };
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
  run.cards.forEach((c, k) => { const t = run.tiers[k]; if (t >= 3) halo(c, css(t >= 4 ? '--fx-gold' : '--fx-silver'), .45); });
  run.busy = false; tags(run);
}
function tags(run) {
  const box = host && host.querySelector('.s3-tags'); if (!box) return;
  box.innerHTML = run.data.map((c, k) => `<span class="s3-tag t${run.tiers[k]}">$${c.price.toFixed(2)}</span>`).join('');
  run.tagEls = [...box.children];
}
function placeTags(run) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  run.cards.forEach((c, k) => {
    const el = run.tagEls[k], p = c.localToWorld(new V3(0, -CH / 2 - .15, 0)).project(camera);
    el.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px, ${((1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%, 0)`;
    el.style.opacity = !run.look || run.look.card === c ? 1 : 0; // a lifted card keeps its price, the rest step back
  });
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

// ---------- input on the canvas ----------
function setPtr(e) {
  const r = canvas.getBoundingClientRect();
  ptr.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); ptr.y = clamp(1 - (e.clientY - r.top) / r.height * 2, -1, 1);
  ptr.in = e.pointerType === 'mouse' || !!drag;
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
  setPtr(e);
  if (!drag || e.pointerId !== drag.id || !R) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, run = R;
  if (!drag.mode && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    drag.mode = run.stage === 'pack' ? 'tear' : run.stage === 'cards' && !run.busy && run.cur < run.n - 1 ? 'slide' : 'none';
    if (drag.mode !== 'none') { canvas.setPointerCapture?.(e.pointerId); drag.w = screenW(drag.mode === 'tear' ? run.pack : run.cards[run.cur], drag.mode === 'tear' ? PW : CW); drag.c = 0; }
    if (drag.mode === 'slide') { run.dragging = true; if (run.cur + 1 >= run.n - 3) { mood('hush', 400); camD(stages().reveal.d * .93, 800); } }
  }
  if (drag.mode === 'tear') {
    const p = clamp(dx / (drag.w * .95), 0, 1); setTear(run, p);
    if (Math.abs(p - drag.c) > .12) { drag.c = p; FX().crinkle(); }
  }
  if (drag.mode === 'slide') { run.slide = clamp(dx / (drag.w * 1.1), 0, 1.15); slideFront(run.cards[run.cur], run.slide); }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag, run = R; drag = null; ptr.in = e.pointerType === 'mouse';
  if (!run) return;
  if (d.mode === 'tear') {
    if (run.tear >= .5) autoTear(run);
    else { const p0 = run.tear; tween(220, k => setTear(run, p0 * (1 - k)), E.out); }
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
  if (d.mode === 'tear') setTear(run, 0);
  if (d.mode === 'slide') { run.dragging = false; run.slide = 0; slideFront(run.cards[run.cur], 0); mood('base', 300); }
}
function tap(e) {
  const run = R;
  if (run.stage === 'pack' || run.stage === 'enter') return autoTear(run);
  if (run.stage === 'cards') return advance(run);
  if (run.stage === 'spread') {
    const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), camera);
    const hit = ray.intersectObjects(run.cards, false)[0];
    look(run, hit ? hit.object : null);
  }
}

// ---------- frame ----------
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, Math.max(0, (t - last) / 1000)); last = t; now = t;
  stepTweens();
  const k = Math.min(1, dt * 6), run = R;
  tilt.x += ((ptr.in ? ptr.x : 0) - tilt.x) * k; tilt.y += ((ptr.in ? ptr.y : 0) - tilt.y) * k;
  const s = t / 1000; let sway = 0;
  if (run && run.show) { const a = (t - run.show.t0) / 1000; sway = Math.sin(a * 3.4) * run.show.amp * Math.exp(-a * .9); if (a > 5) run.show = null; }
  lean += ((run && (run.stage === 'enter' || run.stage === 'pack' || run.stage === 'tearing') ? 1 : 0) - lean) * k; // a sealed pack is held at a slight angle so its pillow shows
  grip.rotation.set(-tilt.y * .2 + Math.sin(s * .7) * .02 + lean * .05, tilt.x * .3 + Math.sin(s * .45) * .05 + sway - lean * .2, Math.sin(s * .6) * .012 + lean * .03);
  grip.position.y = Math.sin(s * 1.1) * .07;
  if (run && run.look && run.look.up) {
    run.look.card.quaternion.copy(run.look.base).multiply(new T.Quaternion().setFromEuler(new T.Euler(-tilt.y * .35, tilt.x * .45, 0)));
  }
  if (run && run.embers) run.embers();
  parts.update(dt);
  if (run && run.stage === 'cards' && moodNow.rays > .01) { // god rays stay behind the card being shown
    const c = run.cards[run.cur], f = camBasis().f; rays.position.copy(c.getWorldPosition(tmpV())).addScaledVector(f, -1.2); rays.quaternion.copy(camera.quaternion);
  }
  applyMood();
  shared.u.time.value = s; rays.material.uniforms.uTime.value = s;
  placeCam(camera, cam);
  const sh = shake.amp * Math.max(0, 1 - (t - shake.t0) / shake.ms);
  if (sh > 0) { camera.position.x += (Math.random() - .5) * sh; camera.position.y += (Math.random() - .5) * sh; }
  composer.render(dt);
  if (run && run.stage === 'spread' && run.tagEls) placeTags(run);
}
function loop(on) {
  if (on && !raf && seen) { last = performance.now(); raf = requestAnimationFrame(frame); }
  if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
}
function resize() {
  if (!host) return;
  const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  parts.mat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * TAN);
  if (R && !tws.length) { // settle the camera for the new shape (mid-animation the next tween does it)
    if (R.stage === 'pack') cam.d = stages().pack.d;
    else if (R.stage === 'cards') cam.d = stages().reveal.d;
    else if (R.stage === 'spread') Object.assign(cam, gridOf(R.n).cam);
  }
}

// ---------- table, theme ----------
function drawMat(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height, s = W / MW, ink = css('--mat-ink');
  x.fillStyle = css('--mat'); x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data; // rubber grain
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.strokeStyle = rgba(ink, .08); x.lineWidth = 3; x.beginPath(); x.roundRect(3 * s, 3 * s, W - 6 * s, H - 6 * s, 1.5 * s); x.stroke();
  x.setLineDash([.5 * s, .35 * s]); x.strokeStyle = rgba(ink, .22); x.lineWidth = .12 * s; x.beginPath(); x.roundRect(.7 * s, .7 * s, W - 1.4 * s, H - 1.4 * s, 2.2 * s); x.stroke(); x.setLineDash([]);
  // the shop's mark printed where packs get opened: two thin rings, ticks, the name at the near edge
  const cx = MW / 2 * s, cy = (MH / 2 + (-5.5 - MZ)) * s, r1 = 11 * s;
  x.strokeStyle = rgba(ink, .09); x.lineWidth = .08 * s; x.beginPath(); x.arc(cx, cy, r1, 0, Math.PI * 2); x.stroke();
  x.lineWidth = .035 * s; x.beginPath(); x.arc(cx, cy, r1 - .5 * s, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .5) continue; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r1 - .5 * s), cy + Math.sin(a) * (r1 - .5 * s)); x.lineTo(cx + Math.cos(a) * (r1 - (i % 5 ? .8 : 1.2) * s), cy + Math.sin(a) * (r1 - (i % 5 ? .8 : 1.2) * s)); x.stroke(); }
  x.fillStyle = rgba(ink, .13); x.font = `400 ${1.5 * s}px ${DISP()}`; x.textAlign = 'center'; x.fillText('欧气卡铺', cx, cy + r1 - .15 * s);
}
function theme() {
  const bg = new T.Color(css('--bg'));
  renderer.setClearColor(bg); scene.fog.color.copy(bg); counter.material.color.copy(bg);
  L.hemi.groundColor.set(css('--mat'));
  shared.back.value.image = backCanvas(); shared.back.value.needsUpdate = true;
  drawMat(playmat.material.map.image); playmat.material.map.needsUpdate = true;
}

function init() {
  V3 = T.Vector3;
  renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.VSMShadowMap;
  canvas = renderer.domElement; canvas.className = 's3-canvas';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '开包台：桌上的补充包和卡');
  scene = new T.Scene(); scene.fog = new T.Fog(0x000000, 70, 150);
  camera = new T.PerspectiveCamera(FOV, 1, 1, 400); probe = camera.clone(); cam.t = FOCUS();
  const pm = new T.PMREMGenerator(renderer), room = new M.RoomEnvironment();
  scene.environment = pm.fromScene(room, .04).texture; scene.environmentIntensity = .42; pm.dispose(); room.dispose?.();

  const hemi = new T.HemisphereLight(css('--lamp-fill'), css('--mat'), .5);
  const key = new T.SpotLight(css('--lamp'), 1.6, 0, .5, .9, 0);
  key.position.set(-12, 46, 22); key.target.position.copy(FOCUS()).setY(3);
  key.castShadow = true; key.shadow.mapSize.setScalar(small() ? 1024 : 2048); key.shadow.bias = -.0006;
  key.shadow.radius = 9; key.shadow.blurSamples = 16; key.shadow.intensity = .8;
  key.shadow.camera.near = 20; key.shadow.camera.far = 120;
  const rim = new T.DirectionalLight(css('--lamp-rim'), .7); rim.position.set(8, 16, -30);
  const glow = new T.PointLight(0xFFFFFF, 0, 0, 2); glow.position.copy(FOCUS()).add(new V3(0, 3 + Math.sin(PITCH) * 6, Math.cos(PITCH) * 6)); // in front of the held card
  scene.add(hemi, key, key.target, rim, glow);
  L = { hemi, key, rim, glow };

  const mapC = canvasOf(1520, 1120), matMap = canvasTex(mapC), grain = grainTex();
  matMap.repeat.set(1 / MW, 1 / MH); matMap.offset.set(.5, .5); grain.repeat.set(1 / 5, 1 / 5);
  const mg = new T.ExtrudeGeometry(roundRect(MW, MH, 2.5), { depth: .3, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 2, curveSegments: 8 });
  mg.rotateX(-Math.PI / 2); mg.translate(0, -.38, MZ);
  playmat = new T.Mesh(mg, new T.MeshStandardMaterial({ map: matMap, normalMap: grain, normalScale: new T.Vector2(.35, .35), roughness: .93, metalness: 0, envMapIntensity: .25 }));
  playmat.receiveShadow = true;
  counter = new T.Mesh(new T.PlaneGeometry(700, 700), new T.MeshStandardMaterial({ roughness: .65, envMapIntensity: .3 }));
  counter.rotation.x = -Math.PI / 2; counter.position.y = -.45; counter.receiveShadow = true;
  scene.add(playmat, counter);

  hand = new T.Group(); hand.position.copy(FOCUS()); hand.lookAt(FOCUS().add(new V3(0, Math.sin(PITCH), Math.cos(PITCH))));
  grip = new T.Group(); hand.add(grip); scene.add(hand);

  const cardGeo = new T.ExtrudeGeometry(roundRect(CW, CH, CR), { depth: CT, bevelEnabled: false, curveSegments: 6 }); cardGeo.translate(0, 0, -CT / 2);
  const back = canvasTex(canvasOf(8, 8)), blank = canvasTex(canvasOf(8, 8));
  shared = { cardGeo, blank, back: { value: back },
    edge: new T.MeshStandardMaterial({ color: 0xE6E9EE, roughness: .8 }),
    inner: new T.MeshStandardMaterial({ color: 0xC3C9D2, metalness: 1, roughness: .38, side: T.BackSide }),
    crinkle: crinkleTex() };
  shared.inner.normalMap = shared.crinkle;
  shared.u = { back: shared.back, time: { value: 0 }, key: { value: new V3() }, keyDir: { value: new V3() }, glowAt: { value: new V3() }, cone0: { value: 0 }, cone1: { value: 1 }, keyCol: { value: new T.Color() }, amb: { value: new T.Color() }, wash: { value: new T.Color() } };

  parts = makeParticles(900); scene.add(parts.pts);
  rays = new T.Mesh(new T.PlaneGeometry(70, 70), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uCol: { value: new T.Color() }, uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uAmt, uTime; varying vec2 vUv;
      void main() { vec2 p = vUv - 0.5; float r = length(p), a = atan(p.y, p.x);
        float s = pow(max(0.0, sin(a * 11.0 + uTime * 0.22)), 14.0) + 0.6 * pow(max(0.0, sin(a * 5.0 - uTime * 0.15)), 18.0);
        gl_FragColor = vec4(uCol * uAmt * (s * 0.7 + 0.22 * smoothstep(0.3, 0.0, r)) * smoothstep(0.5, 0.08, r) * smoothstep(0.015, 0.08, r), 1.0); }` }));
  rays.renderOrder = -1; scene.add(rays);

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
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) ptr.in = false; });
  canvas.addEventListener('webglcontextlost', e => { // drop back to the 2D mat; ui/mat.ts keeps the pack's state
    e.preventDefault(); dead = true;
    const o = opts; close?.(); o?.onLost?.();
  });
  ro = new ResizeObserver(resize);
  io = new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; loop(seen && !!R); });
}

// ---------- teardown ----------
function dispose(run) {
  for (const c of run.cards) { c.material[0].dispose(); c.userData.face?.dispose(); if (c.userData.halo) { c.userData.halo.geometry.dispose(); c.userData.halo.material.dispose(); } }
  run.pack.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
}
function clearRun(run, animate) {
  run.tagEls?.forEach(e => e.remove());
  const objs = [run.pack, run.pack.userData.strip, ...run.cards];
  if (!animate) { objs.forEach(o => o.removeFromParent()); dispose(run); return; }
  const old = new T.Group(); scene.add(old); objs.forEach(o => old.attach(o));
  tween(520, k => { old.position.x = -60 * k; }, E.in).then(() => { old.removeFromParent(); dispose(run); });
}

function advance(run) {
  if (!run || run.stage !== 'cards' || run.busy || run.dragging) return false;
  if (run.cur >= run.n - 1) toSpread(run); else uncover(run);
  return true;
}
function revealAll(run) {
  if (!run || run.stage === 'spread' || run.stage === 'pack' || run.stage === 'enter' || run.stage === 'tearing') return;
  if (run.stage === 'extract') { run.skip = true; return; }
  for (let i = run.cur + 1; i < run.n; i++) opts.onFlip(i, run.data[i]);
  toSpread(run);
}

// ---------- the one export ----------
let dead = false, close = null; // dead: a lost WebGL context keeps the 2D mat for the rest of the session
function mountTable(el, o) {
  if (!T || dead) return null;
  if (!renderer) try { init(); } catch (e) { console.warn('[table3d] no WebGL; the 2D mat stays', e); dead = true; return null; }
  close?.();
  opts = o; speed = o.reducedMotion ? 0 : 1; host = el;
  ro.observe(el); io.observe(el); el.prepend(canvas); resize();
  for (const k in moodNow) moodNow[k] = MOODS.base[k];
  const shut = () => {
    if (opts !== o) return;
    loop(false); tws = []; drag = null; parts.clear();
    if (R) { clearRun(R, false); R = null; }
    canvas.remove(); host = null; opts = null; close = null; ro.disconnect(); io.disconnect();
  };
  close = shut;
  return {
    showPack(set, cards) { // a new pack drops in; the last one's cards slide off the mat
      if (opts !== o) return;
      tws = []; parts.clear(); drag = null;
      if (R) clearRun(R, true);
      R = build(set, cards); loop(true); enter(R);
    },
    // Move the table on to card i: tears a sealed pack, uncovers the next card, or (i ≥ cards) lays the pack out.
    flip(i) {
      const run = R; if (opts !== o || !run) return false;
      if (run.stage === 'enter' || run.stage === 'pack') { autoTear(run); return true; }
      return i > run.cur && advance(run);
    },
    flipAll() { if (opts === o) revealAll(R); },
    resize() { if (opts === o) resize(); },
    dispose: shut,
  };
}
export { mountTable };
