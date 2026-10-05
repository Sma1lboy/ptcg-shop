// How each series opens: the figure its big hits play behind the card, the order its packs tear and its cards leave them and turn
// over, how its torn strip flies, how the held card sways and how hard the table shakes. Pure data and pure functions for the two
// renderers (the 3D table, src/table3d.js, and the 2D mat, src/ui/mat.ts); node can load it. It decides nothing about what a pack
// contains and never touches the game's random numbers (the figures' jitter is a fixed seed per series, so a series always draws
// the same figure).
//
// The figure's colours are the pack's own (sets.ts LOOK.c[0], c[1]), so a series' effect is printed in its foil; the rarity colours
// (silver, gold) stay the halo's. Every figure is an original abstract shape drawn from the series' name; none uses official art.
// Every supported series has its own figure and deal; adding a series requires choosing both.
export const SERIES_IDS = ['sv08', 'sv10', 'sv08.5', 'sv03.5', 'sv09', 'me01', 'me02', 'me03', 'me04', 'me05'] as const;
export type SeriesId = typeof SERIES_IDS[number];

// The figure, in the order the 3D shader numbers them (table3d.js figure shader picks its branch by this index).
export const MOTIFS = ['bolt', 'duel', 'prism', 'archive', 'path', 'spiral', 'ember', 'balance', 'rift', 'outline'] as const;
export type Motif = typeof MOTIFS[number];

// The order the cards of a batch leave their packs and a sweep turns them over, and when each comes (dealShares).
export const DEALS = ['ltr', 'rtl', 'ends', 'center', 'weave', 'jolt', 'shuffle', 'pages', 'facets', 'dusk'] as const;
export type Deal = typeof DEALS[number];

export interface SeriesTheme {
  motif: Motif; deal: Deal;
  draw: number; // seconds the figure takes to draw itself in
  strip: { lift: number; spin: number; yaw: number | null }; // the torn top: arc height (cm), turns (radians), where it lands (null: any way it falls)
  sway: [number, number, number]; // the held card's sway after a hit: frequency, a second beat's share of the first, its frequency ratio
  quake: number; // how hard the table shakes on a hit, as a share of the plain show's shake (0: none)
}

export const THEME: Record<SeriesId, SeriesTheme> = {
  // 超电突围 Surging Sparks: a discharge, jagged arms cracking out of the card, the cards jumping out in uneven pairs
  sv08: { motif: 'bolt', deal: 'jolt', draw: .35, strip: { lift: 9, spin: Math.PI * 6, yaw: null }, sway: [11, .6, 2.3], quake: 1.8 },
  // 命运对决 Destined Rivals: two beams from opposite corners meeting at the card; packs and cards come from both ends inward
  sv10: { motif: 'duel', deal: 'ends', draw: .5, strip: { lift: 5, spin: Math.PI * 2, yaw: null }, sway: [3.4, .8, 2], quake: 1.3 },
  // 棱镜进化 Prismatic Evolutions: facets lighting in a wave, edges splitting the light into colours; cards leave in a stride of three
  'sv08.5': { motif: 'prism', deal: 'facets', draw: .8, strip: { lift: 8, spin: Math.PI * 5, yaw: null }, sway: [3.4, .5, 3], quake: .5 },
  // 宝可梦 151: a notebook of the first 151: ruled lines written in, a margin, index tabs; cards come out a page (three) at a time
  'sv03.5': { motif: 'archive', deal: 'pages', draw: 1.2, strip: { lift: 4, spin: Math.PI, yaw: 0 }, sway: [2.2, 0, 1], quake: 0 },
  // 同行之旅 Journey Together: a winding path walked in dashes with waypoints; cards come out in walking order, left to right
  sv09: { motif: 'path', deal: 'ltr', draw: 1.1, strip: { lift: 6, spin: Math.PI * 2, yaw: -.6 }, sway: [3.4, 0, 1], quake: .4 },
  // 超级进化 Mega Evolution: three arms of a spiral turning outward; cards come out evens first, then odds, like interleaved arms
  me01: { motif: 'spiral', deal: 'weave', draw: .9, strip: { lift: 10, spin: Math.PI * 8, yaw: null }, sway: [4.4, .4, .5], quake: .2 },
  // 幻影烈焰 Phantasmal Flames: tongues of flame sweeping right to left with embers rising; packs and cards come right to left
  me02: { motif: 'ember', deal: 'rtl', draw: .8, strip: { lift: 8, spin: Math.PI * 3, yaw: null }, sway: [2.6, .35, 1.9], quake: 0 },
  // 完美秩序 Perfect Order: a balance, mirrored top and bottom, swinging and settling level; cards come from the middle outward
  me03: { motif: 'balance', deal: 'center', draw: .6, strip: { lift: 5, spin: 0, yaw: 0 }, sway: [5.2, 0, 1], quake: .1 },
  // 混沌崛起 Chaos Rising: a network of cracks breaking out and flickering; the cards come out in no order
  me04: { motif: 'rift', deal: 'shuffle', draw: .45, strip: { lift: 7, spin: Math.PI * 7, yaw: null }, sway: [14, .7, 1.7], quake: 1.5 },
  // 暗黑深渊 Pitch Black: broken outlines of the card travelling out through the dark; the deal starts fast and slows
  me05: { motif: 'outline', deal: 'dusk', draw: 1.4, strip: { lift: 3.5, spin: Math.PI * 1.5, yaw: null }, sway: [1.8, 0, 1], quake: .3 },
};

// The theme of a set id; undefined for an id this file doesn't know (the table then plays the plain show it always had).
export const themeOf = (id: string): SeriesTheme | undefined => (Object.hasOwn(THEME, id) ? THEME[id as SeriesId] : undefined);

// ---------- how a pack is torn open ----------
// Three lines to tear along, six ways in all; the gesture picks one (where the drag starts on the pack and which way it goes), a tap
// or Space uses the last one used (ui/mat.ts keeps it). The 3D table cuts its pack along the style's line (table3d.js cut) and the
// 2D mat moves the matching piece (ui/mat.ts tear; style.css .pack-crimp, .pack-side, .pack-half), so both open the same way.
// Presentation only: nothing here reads the game or the opening's random numbers.
export const TEAR_IDS = ['top-ltr', 'top-rtl', 'mid-ltr', 'mid-rtl', 'side-l', 'side-r'] as const;
export type TearId = typeof TEAR_IDS[number];
export interface Tear {
  line: 'top' | 'mid' | 'side'; // the top crimp strip · the waist: the pack torn in two across the middle · a strip down one edge
  dir: 1 | -1; // top, mid: the tear runs left→right (1) or right→left (-1); side: always 1 = top→bottom
  edge: -1 | 0 | 1; // side: which edge the strip is on (-1 left, 1 right)
}
const TEARS: Record<TearId, Tear> = {
  'top-ltr': { line: 'top', dir: 1, edge: 0 }, 'top-rtl': { line: 'top', dir: -1, edge: 0 },
  'mid-ltr': { line: 'mid', dir: 1, edge: 0 }, 'mid-rtl': { line: 'mid', dir: -1, edge: 0 },
  'side-l': { line: 'side', dir: 1, edge: -1 }, 'side-r': { line: 'side', dir: 1, edge: 1 },
};
export const DEFAULT_TEAR: TearId = 'top-ltr'; // the way packs always tore, and what a first tap does
export const isTearId = (x: unknown): x is TearId => typeof x === 'string' && Object.hasOwn(TEARS, x);
export const tearOf = (id: string): Tear => TEARS[isTearId(id) ? id : DEFAULT_TEAR];

// Where on the pack a drag began (u: 0 left … 1 right, v: 0 top … 1 bottom) and where it has got to (dx, dy: pixels, y down) pick
// the way to tear. Mostly sideways: along the top crimp (the top third) or across the waist (anywhere lower), running the way the
// finger goes. Mostly down: the strip down the edge the finger started nearer, torn top to bottom. Mostly up: no way to tear
// yet (null; the drag keeps being read as it moves).
export const TOP_BAND = .33;
export function tearFromGesture(u: number, v: number, dx: number, dy: number): TearId | null {
  if (Math.abs(dy) > Math.abs(dx) * 1.25) return dy > 0 ? (u < .5 ? 'side-l' : 'side-r') : null;
  return `${v < TOP_BAND ? 'top' : 'mid'}-${dx >= 0 ? 'ltr' : 'rtl'}` as const;
}
// How far the finger has gone along the style's travel (pixels, positive = torn further): sideways with the tear, or down the edge.
export const tearAlong = (id: string, dx: number, dy: number) => { const t = tearOf(id); return t.line === 'side' ? dy : t.dir * dx; };

// How the torn piece flies off. lift and spin are the series' strip numbers (the plain show's when it has none), the waist's half
// pack turning less than a strip; x, y (px) and deg are the same flight for the 2D mat, out the side it tore from, up and away.
export function tearFlight(id: string, strip?: SeriesTheme['strip']) {
  const t = tearOf(id), mid = t.line === 'mid', lift = strip?.lift ?? 7, spin = (strip?.spin ?? Math.PI * 4) * (mid ? .4 : 1);
  const out = t.line === 'side' ? t.edge : t.dir;
  return { lift, spin, x: out * (40 + lift * 5) * (mid ? 1.4 : 1), y: -lift * 12, deg: out * spin * 180 / Math.PI };
}
export const poseCss = (x: number, y: number, deg: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`; // one format for the drag and the flight, so the browser turns the full spin between them
// Where the 2D piece is while the finger has torn it t (0…1) of the way: hinged at the end still attached, lifting away from the
// pack. The top strip keeps the pose it always had (left→right); the others are the same move turned to their line.
export function tearPose(id: string, t: number): { transform: string; origin: string } {
  const s = tearOf(id);
  if (s.line === 'side') return { transform: poseCss(s.edge * 26 * t, -12 * t, s.edge * 12 * t), origin: '50% 100%' };
  const mid = s.line === 'mid';
  return { transform: poseCss(s.dir * 90 * t, (mid ? -26 : -22) * t, s.dir * (mid ? 13 : 14) * t), origin: s.dir > 0 ? '0 100%' : '100% 100%' };
}
// Share of the pack that comes off, for the 2D mat (style.css sizes its pieces to the same numbers): the top strip and the waist
// half as a share of the height, a side strip as a share of the width.
export const TEAR_CUT = { top: .07, mid: .46, side: .12 } as const;
// The 2D pack's body once the piece is gone, as a CSS polygon over the pack's picture: a ragged edge along the cut (a fixed pattern,
// not random: the same style always tears the same way).
export function tearClip(id: string): string {
  const t = tearOf(id), at = t.line === 'side' ? (t.edge > 0 ? 1 - TEAR_CUT.side : TEAR_CUT.side) : TEAR_CUT[t.line];
  const N = 14, pts = Array.from({ length: N + 1 }, (_, i) => {
    const a = (at + (hash(i * 3.7 + at * 40) - .5) * .012) * 100, b = i / N * 100;
    return t.line === 'side' ? [a, b] : [b, a];
  });
  const f = (p: number[]) => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`, ring = pts.map(f);
  if (t.line === 'side') return `polygon(${(t.edge > 0 ? ['0% 0%', ...ring, '0% 100%'] : [...ring, '100% 100%', '100% 0%']).join(', ')})`;
  return `polygon(${[...ring, '100% 100%', '0% 100%'].join(', ')})`;
}

// ---------- the deal ----------
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // fixed, not random: the same n deals the same way every time
// When each of n things comes, 0 (first) … 1 (last), in this deal's order. A deal changes who is first and who comes together; the
// callers scale the shares to the span the plain left-to-right deal always took, so a series is never slower or faster.
export function dealShares(deal: Deal, n: number): number[] {
  if (n < 2) return n ? [0] : [];
  const mid = (n - 1) / 2, ix = Array.from({ length: n }, (_, i) => i);
  let beat = 0;
  const key = (i: number) => {
    switch (deal) {
      case 'ltr': return i;
      case 'rtl': return n - 1 - i;
      case 'ends': return Math.min(i, n - 1 - i);
      case 'center': return Math.abs(i - mid);
      case 'weave': return (i % 2) * n + i;
      case 'jolt': return i % 2 ? beat : (beat += .5 + hash(i));
      case 'shuffle': return hash(i * 7 + 3);
      case 'pages': return Math.floor(i / 3);
      case 'facets': return (i % 3) * n + i;
      case 'dusk': return i ** 1.8;
    }
  };
  const k = ix.map(key), lo = Math.min(...k), hi = Math.max(...k);
  return k.map(v => (hi > lo ? (v - lo) / (hi - lo) : 0));
}

// ---------- the figure ----------
// A stroke of a figure, in card heights from the card's centre (x right, y up); the figure fills ±1.3. t: 0…1, when it is drawn in;
// pal: 0 = the pack's first colour … 1 = its second; w: 0…1, how bright.
export interface Stroke { pts: [number, number][]; t: number; pal: number; w: number }
const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = 1.3, TAU = Math.PI * 2, cl = (v: number) => Math.min(1, Math.max(0, v));
const poly = (cx: number, cy: number, r: number, n = 10): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r]);

const FIGURES: Record<Motif, () => Stroke[]> = {
  bolt() { // arms that zigzag out of the card's middle and fork, drawn from the middle outward
    const r = rng(8), out: Stroke[] = [];
    const arm = (x: number, y: number, a: number, len: number, w: number, gen: number) => {
      for (let d = 0; d < len; d += .1) {
        const ang = a + (r() - .5) * 1.1, nx = x + Math.cos(ang) * .1, ny = y + Math.sin(ang) * .1;
        out.push({ pts: [[x, y], [nx, ny]], t: cl(Math.hypot(nx, ny) / R), pal: gen ? 1 : 0, w });
        if (gen < 2 && r() < .16) arm(nx, ny, a + (r() < .5 ? -1 : 1) * (.5 + r() * .5), len * .35, w * .7, gen + 1);
        x = nx; y = ny;
      }
    };
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + .2 + (r() - .5) * .3; arm(Math.cos(a) * .3, Math.sin(a) * .3, a, 1.05, 1, 0); }
    return out;
  },
  duel() { // two bundles of beams from opposite corners, converging on the card; sparks where they meet
    const r = rng(3), out: Stroke[] = [];
    for (const [sx, sy, pal] of [[-R, -.78, 0], [R, .78, 1]] as const) {
      const len = Math.hypot(sx, sy), nx = -sy / len, ny = sx / len;
      for (let k = -2; k <= 2; k++) for (let i = 0; i < 14; i++) {
        const at = (u: number): [number, number] => [sx * (1 - u) + nx * k * .09 * (1 - u), sy * (1 - u) + ny * k * .09 * (1 - u)];
        out.push({ pts: [at(i / 14), at((i + 1) / 14)], t: i / 14 * .9, pal, w: k ? .5 : 1 });
      }
    }
    for (let k = 0; k < 14; k++) { const a = r() * TAU, r0 = .55 + r() * .1; out.push({ pts: [[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * (r0 + .12 + r() * .15), Math.sin(a) * (r0 + .12 + r() * .15)]], t: .93 + r() * .06, pal: k % 2, w: 1 }); }
    return out;
  },
  prism() { // an eight-sided gem seen from above: three rings, each vertex joined to the two nearest above it
    const out: Stroke[] = [], N = 8, rings = [.55, .9, 1.25], V = (ri: number, k: number): [number, number] => { const a = k / N * TAU + ri * .2, s = rings[ri] * (1 + ((k + ri) % 2 ? .06 : 0)); return [Math.cos(a) * s, Math.sin(a) * s]; };
    for (let ri = 0; ri < 3; ri++) for (let k = 0; k < N; k++) {
      const t = (k + ri * .7) / (N + 1.4), pal = k / N;
      out.push({ pts: [V(ri, k), V(ri, k + 1)], t, pal, w: .8 });
      if (ri < 2) { out.push({ pts: [V(ri, k), V(ri + 1, k)], t: t + .04, pal, w: .6 }); out.push({ pts: [V(ri, k), V(ri + 1, k + 1)], t: t + .06, pal: (k + 1) / N, w: .5 }); }
    }
    return out;
  },
  archive() { // a notebook page: ruled lines written in top to bottom, a margin, index tabs down the edge
    const out: Stroke[] = [];
    for (let y = -1.2; y <= 1.2; y += .15) for (let s = 0; s < 8; s++) out.push({ pts: [[-1.25 + s * .31, y], [-.94 + s * .31, y]], t: (1.2 - y) / 2.4 * .75 + s * .03, pal: 0, w: .35 });
    for (let s = 0; s < 10; s++) out.push({ pts: [[-.95, 1.25 - s * .25], [-.95, 1 - s * .25]], t: .05 + s * .07, pal: 1, w: .8 });
    for (let k = 0; k < 6; k++) { const y = 1 - k * .4; out.push({ pts: [[1.12, y + .13], [1.28, y + .13], [1.28, y - .13], [1.12, y - .13], [1.12, y + .13]], t: .78 + k * .035, pal: k % 2, w: .9 }); }
    return out;
  },
  path() { // a winding track walked in dashes, a fainter one beside it, waypoints along it
    const out: Stroke[] = [], y = (x: number) => .5 * Math.sin(x * 2.3 + .5) - .18 * x, z = (x: number) => y(x) + .38 + .12 * Math.sin(x * 3.1);
    for (let x = -R; x < R - .1; x += .15) {
      out.push({ pts: [[x, y(x)], [x + .09, y(x + .09)]], t: (x + R) / 2.6 * .95, pal: 0, w: .9 });
      out.push({ pts: [[x + .05, z(x + .05)], [x + .12, z(x + .12)]], t: (x + R) / 2.6 * .95, pal: 1, w: .4 });
    }
    for (const x of [-1.05, -.5, .15, .7, 1.15]) out.push({ pts: poly(x, y(x), .07), t: (x + R) / 2.6 * .95, pal: 1, w: 1 });
    return out;
  },
  spiral() { // three arms turning outward, a dot at each tip
    const out: Stroke[] = [], end = TAU * 1.55, rad = (th: number) => .32 + th / end * .98;
    for (let arm = 0; arm < 3; arm++) {
      const P = (th: number): [number, number] => [Math.cos(th + arm * TAU / 3) * rad(th), Math.sin(th + arm * TAU / 3) * rad(th)];
      for (let th = .3; th < end; th += .22) out.push({ pts: [P(th), P(th + .22)], t: th / end * .95, pal: arm === 1 ? 1 : 0, w: .9 - .3 * th / end });
      out.push({ pts: poly(P(end)[0], P(end)[1], .035, 6), t: .97, pal: 1, w: 1 });
    }
    return out;
  },
  ember() { // tongues of flame sweeping right to left, thinning as they go; embers scattered above
    const r = rng(5), out: Stroke[] = [];
    for (let k = 0; k < 10; k++) {
      const y0 = -1 + k * .22, len = 1.4 + r() * .9, ph = r() * 3;
      for (let i = 0; i < 12; i++) {
        const at = (u: number): [number, number] => [R - u * len, y0 + .35 * Math.sin(u * 3 + ph) * (1 - u * .3) + u * .45];
        out.push({ pts: [at(i / 12), at((i + 1) / 12)], t: cl(i / 12 * len / 2.6 * .9), pal: k % 3 === 0 ? 1 : 0, w: 1 - i / 14 }); // the sweep reaches each point as it travels in from the right
      }
    }
    for (let k = 0; k < 28; k++) { const x = -1.2 + r() * 2.4, y = -1.1 + r() * 2.2; out.push({ pts: [[x, y], [x + .02, y + .06]], t: .05 + r() * .85, pal: 1, w: .6 }); }
    return out;
  },
  balance() { // scales above and a mirror of them below, rays between; drawn from the centre line outward
    const out: Stroke[] = [], seg = (a: [number, number], b: [number, number], pal = 0, w = .9) => out.push({ pts: [a, b], t: cl(Math.max(Math.abs(a[0]), Math.abs(b[0])) / 1.3 * .6), pal, w });
    for (const s of [1, -1]) {
      for (let i = 0; i < 8; i++) seg([-1 + i * .25, s * .78], [-.75 + i * .25, s * .78]);
      seg([0, s * .78], [0, s * 1.15], 1); out.push({ pts: [[-.07, s * 1.15], [.07, s * 1.15], [0, s * 1.25], [-.07, s * 1.15]], t: .1, pal: 1, w: 1 });
      for (const e of [-1, 1]) {
        seg([e, s * .78], [e * .78, s * .5], 1, .6); seg([e, s * .78], [e * 1.22, s * .5], 1, .6);
        out.push({ pts: Array.from({ length: 9 }, (_, i) => [e * (.78 + i / 8 * .44), s * (.5 - Math.sin(i / 8 * Math.PI) * .09)] as [number, number]), t: .55, pal: 0, w: .9 }); // the pan: a shallow dish under the hanger
      }
    }
    for (let k = 0; k < 6; k++) { const a = (k * 30 + 15) * Math.PI / 180; for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) out.push({ pts: [[Math.cos(a) * .6 * mx, Math.sin(a) * .6 * my], [Math.cos(a) * 1.25 * mx, Math.sin(a) * 1.25 * my]], t: .35 + k * .05, pal: 1, w: .4 }); }
    return out;
  },
  rift() { // cracks that run out of the card's middle and fork, with loose fragments beyond
    const r = rng(11), out: Stroke[] = [];
    const crack = (x: number, y: number, a: number, len: number, gen: number, t0: number) => {
      for (let d = 0; d < len; d += .08) {
        a += (r() - .5) * .9; const nx = x + Math.cos(a) * .08, ny = y + Math.sin(a) * .08;
        out.push({ pts: [[x, y], [nx, ny]], t: cl(t0 + Math.hypot(nx, ny) / R * .8 + r() * .1), pal: gen ? 1 : 0, w: gen ? .6 : 1 });
        if (gen < 2 && r() < .18) crack(nx, ny, a + (r() < .5 ? -1 : 1) * (.6 + r() * .6), len * .4, gen + 1, t0);
        x = nx; y = ny;
      }
    };
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + (r() - .5) * .5; crack(Math.cos(a) * .3, Math.sin(a) * .3, a, 1.1, 0, 0); }
    for (let k = 0; k < 7; k++) { const a = r() * TAU, d = .6 + r() * .6; crack(Math.cos(a) * d, Math.sin(a) * d, r() * TAU, .35, 1, .1); }
    return out;
  },
  outline() { // the card's own outline again and again, slightly off, each broken into pieces as if drawn by feel
    const r = rng(2), out: Stroke[] = [], N = 64;
    for (let k = 0; k < 6; k++) {
      const s = .82 + k * .095, rotA = (r() - .5) * .06, ox = (r() - .5) * .03, oy = (r() - .5) * .03;
      const P = (i: number): [number, number] => { const th = i / N * TAU, c = Math.cos(th), sn = Math.sin(th), x = Math.sign(c) * Math.abs(c) ** (2 / 6) * .36 * s, y = Math.sign(sn) * Math.abs(sn) ** (2 / 6) * .5 * s; return [x * Math.cos(rotA) - y * Math.sin(rotA) + ox, x * Math.sin(rotA) + y * Math.cos(rotA) + oy]; };
      const gaps = Array.from({ length: 4 }, () => Math.floor(r() * N));
      for (let i = 0; i < N; i++) if (!gaps.some(g => (i - g + N) % N < 5)) out.push({ pts: [P(i), P(i + 1)], t: k / 6 * .8 + .1 + (i / N) * .06, pal: k % 2, w: .9 - k * .1 });
    }
    return out;
  },
};
const cache: Partial<Record<Motif, Stroke[]>> = {};
export const strokes = (m: Motif): Stroke[] => (cache[m] ||= FIGURES[m]());

// The figure's two inks: the pack's first two colours, lightened until they read on the dark mat (a pack's second colour can be a dark
// grey that would vanish under additive light). The prism's rainbow ignores them.
const lum = (h: number[]) => (.299 * h[0] + .587 * h[1] + .114 * h[2]) / 255;
function ink(hex: string): string {
  let c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < 8 && lum(c) < .62; i++) c = c.map(v => Math.round(v + (255 - v) * .18));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
export const figureInk = (c: readonly [string, string, string]): [string, string] => [ink(c[0]), ink(c[1])];
export const strokeInk = (m: Motif, pal: number, inks: readonly [string, string]) => (m === 'prism' ? `hsl(${Math.round(pal * 360)} 85% 70%)` : inks[pal < .5 ? 0 : 1]);

// How the figure moves while it lives, a seconds after it starts: turned (rad, counter-clockwise), scaled, shifted (card heights,
// y up). The 3D table reads it every frame; the 2D figure samples it into SMIL keyframes, so both move the same way.
const jit = (a: number, k: number) => hash(Math.floor(a * 24) * 2 + k) - .5; // a new shudder 24 times a second
export function life(theme: SeriesTheme, a: number): { rot: number; s: number; dx: number; dy: number } {
  const m = theme.motif, g = Math.exp(-1.8 * a);
  return {
    rot: m === 'spiral' ? a * 1.1 : m === 'prism' ? a * .25 : m === 'balance' ? .3 * g * Math.sin(a * 7) : 0,
    s: m === 'outline' ? 1 + a * .14 : m === 'duel' ? 1 + .07 * g * Math.sin(a * 11) : 1,
    dx: m === 'bolt' ? jit(a, 0) * .05 * Math.exp(-a) : m === 'rift' ? jit(a, 0) * .07 * Math.exp(-.8 * a) : m === 'path' ? -a * .08 : 0,
    dy: m === 'bolt' ? jit(a, 1) * .05 * Math.exp(-a) : m === 'rift' ? jit(a, 1) * .07 * Math.exp(-.8 * a) : m === 'ember' ? a * .2 : 0,
  };
}
export const figureLife = (theme: SeriesTheme) => theme.draw + 1.4; // seconds from the first stroke to gone: drawn in over `draw`, held .8, faded .6

// The same figure as an inline SVG for the 2D mat, 2.6 × 2.6 card heights, y down. Strokes are grouped into ten beats; each beat's
// group fades in when the drawing reaches it and everything fades out at the end (SMIL, no CSS). still: one static frame at 55%,
// for reduced motion (no animate elements at all). The caller sizes and places the box.
export function figureSVG(theme: SeriesTheme, inks: readonly [string, string], amt: number, still = false): string {
  const B = 10, dur = figureLife(theme), groups: Record<string, { d: string; b: number; col: string; sw: number }> = {};
  for (const s of strokes(theme.motif)) {
    const b = Math.min(B - 1, Math.floor(s.t * B)), col = strokeInk(theme.motif, s.pal, inks), sw = s.w >= .7 ? .034 : .018, key = `${b}|${col}|${sw}`;
    (groups[key] ||= { d: '', b, col, sw }).d += `M${s.pts.map(p => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join('L')}`;
  }
  const fade = (b: number) => {
    const on = b / B * theme.draw / dur, off = (theme.draw + .8) / dur;
    return `<animate attributeName="opacity" dur="${dur}s" begin="0s" fill="freeze" keyTimes="0;${on.toFixed(3)};${(on + .02).toFixed(3)};${off.toFixed(3)};1" values="0;0;${amt};${amt};0"/>`;
  };
  const paths = Object.values(groups).map(g => `<g opacity="${still ? (amt * .55).toFixed(2) : 0}" fill="none" stroke="${g.col}" stroke-width="${g.sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${g.d}"/>${still ? '' : fade(g.b)}</g>`).join('');
  if (still) return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true" style="display:block;width:100%;height:100%;overflow:visible"><g transform="scale(1 -1)">${paths}</g></svg>`;
  const N = 28, ts = Array.from({ length: N + 1 }, (_, i) => i / N), L = ts.map(u => life(theme, u * dur)), keys = ts.map(u => u.toFixed(3)).join(';');
  const anim = (type: string, vals: string[]) => `<animateTransform attributeName="transform" type="${type}" dur="${dur}s" begin="0s" fill="freeze" calcMode="${theme.motif === 'bolt' || theme.motif === 'rift' ? 'discrete' : 'linear'}" keyTimes="${keys}" values="${vals.join(';')}"/>`;
  const f = (v: number) => v.toFixed(4);
  // SVG's y is down and its rotation clockwise: the life's y and counter-clockwise rot flip sign
  return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true" style="display:block;width:100%;height:100%;overflow:visible"><g>${anim('translate', L.map(l => `${f(l.dx)} ${f(-l.dy)}`))}<g>${anim('rotate', L.map(l => f(-l.rot * 180 / Math.PI)))}<g>${anim('scale', L.map(l => f(l.s)))}<g transform="scale(1 -1)">${paths}</g></g></g></g></svg>`;
}
