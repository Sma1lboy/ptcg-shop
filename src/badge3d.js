// 奖章 3D: one achievement medal as a struck coin you can turn — bevelled metal rim in the tier's foil, the badge art (public/gen/badges)
// on the front, the seal word and the name engraved on the back. Pure presentation: it reads no game state and consumes no game random.
// Plain JS like table3d.js (tsconfig allowJs, not type-checked). Interface, used by src/ui/ach.ts:
//   mountBadge(el, { front: url | null, seal, name, tier, label, reducedMotion, onLost? }) → Promise<{ flip(), resize(), dispose() } | null>
//   el: an empty box (its CSS size is the canvas size; its `--m1 --m2 --m3 --m-ink` tier tokens, ui/ach.ts's `.t-*`, colour the metal).
//   Resolves null — the caller keeps its flat 2D medal — when three.js did not load, without WebGL, or if the context is lost
//   before it is up; onLost fires if the context is lost later (the canvas is removed). front null / failing to load: the front is the
//   seal on a tier face instead (pen builds and file:// pages can't reach public/gen/badges as a texture).
//   One renderer per mount, disposed with the dialog; frames render only while mounted. reducedMotion: no idle spin, no inertia and no
//   render loop at all — it draws once and again on each drag / key / flip the player does.
// three.js: node_modules in dev, the import map vite.config.ts injects in builds (CDN, same pinned version). Loaded on the first mount,
// not at startup, so a dead CDN costs only this dialog its 3D.
const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

let load = null; // Promise<boolean>, memoised: three plus the environment used for the metal's reflections
let T = null, RoomEnvironment = null;
const loadThree = () => (load ||= Promise.all([import('three'), import('three/addons/environments/RoomEnvironment.js')])
  .then(([three, env]) => { T = three; RoomEnvironment = env.RoomEnvironment; return true; })
  .catch(e => { console.warn('[badge3d] three.js did not load; the flat medal stays', e); return false; }));

const loadImg = (url, ms = 4000) => new Promise(done => {
  if (!url) return done(null);
  const img = new Image(); img.crossOrigin = 'anonymous'; // file:// has no origin to share: it fails here, not later as a tainted texture
  const t = setTimeout(() => done(null), ms);
  img.onload = () => { clearTimeout(t); done(img); }; img.onerror = () => { clearTimeout(t); done(null); };
  img.src = url;
});

const TEX = 512;
const metalFace = (x, c) => { // the foil's own lit face: bright upper-left, dark far corner
  const g = x.createRadialGradient(TEX * .34, TEX * .3, 0, TEX * .5, TEX * .5, TEX * .72);
  g.addColorStop(0, c.hi); g.addColorStop(.45, c.base); g.addColorStop(1, c.lo);
  x.fillStyle = g; x.fillRect(0, 0, TEX, TEX);
};
// word centred at (TEX/2, y), shrunk until it fits `max` wide; a light copy a pixel below-right and a dark one on top: struck, not printed
const stamp = (x, c, word, y, px, max, font) => {
  x.textAlign = 'center'; x.textBaseline = 'middle';
  do { x.font = `400 ${px}px ${font}`; px -= 2; } while (x.measureText(word).width > max && px > 12);
  x.fillStyle = c.hi; x.fillText(word, TEX / 2 + 2, y + 2);
  x.fillStyle = c.ink; x.fillText(word, TEX / 2, y);
};
const ring = (x, r, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(TEX / 2, TEX / 2, r, 0, Math.PI * 2); x.stroke(); };

function drawFront(c, img, o, col, font) {
  const x = c.getContext('2d');
  if (img) { x.fillStyle = '#262B33'; x.fillRect(0, 0, TEX, TEX); x.drawImage(img, 0, 0, TEX, TEX); return; } // the disc's own outline is charcoal: its soft edge fades into it
  metalFace(x, col); ring(x, TEX * .44, 5, col.lo); ring(x, TEX * .4, 2, col.hi);
  stamp(x, col, o.seal, TEX * .5, o.seal.length > 2 ? TEX * .17 : TEX * .26, TEX * .62, font);
}
function drawBack(c, o, col, font) {
  const x = c.getContext('2d');
  metalFace(x, col); ring(x, TEX * .45, 6, col.lo); ring(x, TEX * .41, 2, col.hi); ring(x, TEX * .36, 1, col.lo);
  x.fillStyle = col.lo; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; x.beginPath(); x.arc(TEX / 2 + Math.cos(a) * TEX * .43, TEX / 2 + Math.sin(a) * TEX * .43, 3, 0, Math.PI * 2); x.fill(); }
  stamp(x, col, o.seal, TEX * .4, o.seal.length > 2 ? TEX * .15 : TEX * .22, TEX * .66, font);
  x.fillStyle = col.lo; x.save(); x.translate(TEX / 2, TEX * .56); x.rotate(Math.PI / 4); x.fillRect(-6, -6, 12, 12); x.restore(); // a diamond between the word and the name
  stamp(x, col, o.name, TEX * .68, TEX * .075, TEX * .6, font);
}

// The coin's side: a lathe profile (x = radius, y = along the axis, turned to z) — outer wall, chamfers, a raised lip each side, and
// the face recess walls the two disc faces sit in. Walks the loop so the lathe's normals point out of the metal.
const R = 1, HALF = .1, LIP = .9, FLOOR = .87, DEEP = .05;
const profile = [[FLOOR, -(HALF - DEEP)], [LIP, -HALF], [.96, -HALF], [R, -HALF + .04], [R, HALF - .04], [.96, HALF], [LIP, HALF], [FLOOR, HALF - DEEP]];

export async function mountBadge(el, o) {
  if (!(await loadThree())) return null;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { console.warn('[badge3d] no WebGL; the flat medal stays', e); return null; }
  const canvas = renderer.domElement;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);

  // metal colours: the tier's foil (ui/ach.ts `.t-*` tokens); 荣誉 is a gold rim round a card-back-navy face
  const honour = o.tier === 'black', pick = n => css(el, n);
  const rim = honour ? { base: pick('--foil-gold-1'), hi: pick('--foil-gold-2'), lo: pick('--foil-gold-3') } : { base: pick('--m1'), hi: pick('--m2'), lo: pick('--m3') };
  const face = { base: pick('--m1'), hi: pick('--m2'), lo: pick('--m3'), ink: pick('--m-ink') };
  const font = css(document.documentElement, '--font-pixel') || 'sans-serif';
  const img = await loadImg(o.front);
  await Promise.race([document.fonts?.load(`400 64px ${font}`, o.seal + o.name), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
  if (renderer.getContext().isContextLost()) { renderer.dispose(); return null; }

  const mkTex = paint => {
    const c = document.createElement('canvas'); c.width = c.height = TEX; paint(c);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
  };
  const frontTex = mkTex(c => drawFront(c, img, o, face, font)), backTex = mkTex(c => drawBack(c, o, face, font));

  const side = new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), 128); side.rotateX(Math.PI / 2); // axis y → z
  const disc = () => new T.CircleGeometry(FLOOR + .006, 96);
  const frontGeo = disc(), backGeo = disc(); backGeo.rotateY(Math.PI); // seen from behind it reads the right way round
  const rimMat = new T.MeshStandardMaterial({ color: rim.base, metalness: 1, roughness: .3, side: T.DoubleSide });
  const frontMat = new T.MeshPhysicalMaterial({ map: frontTex, roughness: .42, metalness: .08, clearcoat: .7, clearcoatRoughness: .15 }); // enamel under a gloss
  const backMat = new T.MeshStandardMaterial({ map: backTex, roughness: .38, metalness: .55 });
  const sideMesh = new T.Mesh(side, rimMat), frontMesh = new T.Mesh(frontGeo, frontMat), backMesh = new T.Mesh(backGeo, backMat);
  frontMesh.position.z = HALF - DEEP + .002; backMesh.position.z = -(HALF - DEEP + .002);

  const scene = new T.Scene(), pivot = new T.Group(); pivot.add(sideMesh, frontMesh, backMesh); scene.add(pivot);
  const pm = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pm.fromScene(room, .04);
  scene.environment = env.texture; scene.environmentIntensity = .95; pm.dispose(); room.dispose?.();
  const key = new T.DirectionalLight(0xFFFFFF, 1.5); key.position.set(-2.5, 3, 4);
  const back = new T.DirectionalLight(0xFFFFFF, .5); back.position.set(3, -1, -3);
  scene.add(key, back);
  const camera = new T.PerspectiveCamera(28, 1, .1, 50);

  let yaw = 0, pitch = .08, vy = 0, drag = null, last = 0, raf = 0, dead = false, tween = null, w = 0, h = 0, tPrev = 0;
  const reduced = !!o.reducedMotion, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const draw = () => { pivot.rotation.set(pitch, yaw, 0, 'YXZ'); renderer.render(scene, camera); };
  const resize = () => {
    w = el.clientWidth; h = el.clientHeight; if (!w || !h || dead) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.set(0, 0, 5.6 / Math.min(1, camera.aspect)); camera.updateProjectionMatrix(); // a narrow box still holds the whole coin
    draw();
  };
  const spin = (dy, dp) => { yaw += dy; pitch = clamp(pitch + dp, -.9, .9); last = performance.now(); if (reduced) draw(); };
  const flip = () => { // to the other face: the next multiple of π
    tween = { from: yaw, to: (Math.round(yaw / Math.PI) + 1) * Math.PI, p0: pitch, t0: performance.now() }; vy = 0; last = performance.now();
    if (reduced) { yaw = tween.to; pitch = .08; tween = null; draw(); }
  };
  const frame = now => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now;
    if (tween) {
      const p = clamp((now - tween.t0) / 600, 0, 1), e = 1 - (1 - p) ** 3;
      yaw = tween.from + (tween.to - tween.from) * e; pitch = tween.p0 + (.08 - tween.p0) * e; if (p === 1) tween = null;
    } else if (!drag) {
      yaw += vy * dt; vy *= Math.exp(-dt * 3);
      if (now - last > 1400) { yaw += dt * .7; pitch += (Math.sin(now / 1100) * .1 + .08 - pitch) * Math.min(1, dt * 2); } // gentle idle turn and sway
    }
    draw();
  };

  canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', o.label || o.name);
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;outline-offset:-3px';
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, t: performance.now() }; tween = null; vy = 0; canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(.008, (now - drag.t) / 1000);
    drag = { x: e.clientX, y: e.clientY, t: now }; vy = reduced ? 0 : clamp(dx * .012 / dt, -9, 9); spin(dx * .012, dy * .008);
  });
  const release = () => { drag = null; last = performance.now(); canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, -.3], ArrowDown: [0, .3] }[e.key];
    if (k) { e.preventDefault(); spin(k[0], k[1]); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (dead) return; shut(); o.onLost?.(); });

  const ro = new ResizeObserver(resize);
  function shut() {
    if (dead) return; dead = true;
    cancelAnimationFrame(raf); ro.disconnect(); canvas.remove();
    for (const g of [side, frontGeo, backGeo]) g.dispose();
    for (const m of [rimMat, frontMat, backMat]) m.dispose();
    frontTex.dispose(); backTex.dispose(); env.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
  el.append(canvas); ro.observe(el); resize();
  if (!reduced) raf = requestAnimationFrame(frame);
  return { flip, resize, dispose: shut };
}
