// Checks the colour constraints in DESIGN.md against the tokens in style.css, both themes. Exit 1 on any failure.
//   node scripts/contrast.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const block = sel => { const i = css.indexOf(sel); return css.slice(i, css.indexOf('}', i)); };
const hexes = s => Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map(m => [m[1], m[2]]));
const light = hexes(block(':root {')), dark = { ...light, ...hexes(block(':root[data-theme="dark"] {')) };

const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const rgb = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
const lum = h => { const [r, g, b] = rgb(h); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const oklch = h => {
  const [r, g, b] = rgb(h), l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return { L: .2104542553 * l + .793617785 * m - .0040720468 * s, H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
};
const hueGap = (a, b) => { const d = Math.abs(oklch(a).H - oklch(b).H); return Math.min(d, 360 - d); };

let bad = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) bad++; };
for (const [name, t] of [['light', light], ['dark', dark]]) {
  console.log(`--- ${name}`);
  for (const [a, b, need] of [['ink', 'bg', 4.5], ['muted', 'bg', 4.5], ['gain', 'bg', 4.5], ['loss', 'bg', 4.5], ['gold', 'bg', 4.5], ['silver', 'bg', 4.5],
    ['ink', 'panel', 4.5], ['muted', 'panel', 4.5], ['sticker-ink', 'sticker', 4.5], ['sticker-edge', 'bg', 3],
    ['mat-ink', 'mat', 4.5], ['mat-muted', 'mat', 4.5], ['mat-gain', 'mat', 4.5], ['mat-loss', 'mat', 4.5], ['mat-gold', 'mat', 4.5],
    ['paper-ink', 'paper', 4.5], ['paper-muted', 'paper', 4.5], ['paper-gain', 'paper', 4.5],
    ['hud-ink', 'hud', 4.5], ['hud-muted', 'hud', 4.5], ['btn-ink', 'btn-face', 4.5], ['danger-ink', 'danger-face', 4.5],
    ['ace', 'bg', 4.5], ['mat-ace', 'mat', 4.5], ['stock-ink', 'stock', 4.5],
    ['mat-ink', 'back-2', 4.5], ['mat-muted', 'back-2', 4.5], ['mat-gain', 'back-2', 4.5], ['foil-gold-3', 'back-2', 3], // light print on the card-back navy; the 荣誉 medal's rim
    ['foil-gold-2', 'back-1', 4.5], // the 荣誉 medal's word, gold on its navy face
    ['frame', 'bg', 3], ['frame', 'panel', 3], ['sel', 'bg', 3], ['sel', 'panel', 3], // the double frame's rim and the menu cursor are UI boundaries (WCAG 1.4.11)
    ['hp-hi', 'hud', 3], ['hp-mid', 'hud', 3], ['hp-lo', 'hud', 3], ['exp', 'hud', 3], // HP / EXP fills against their dark track
    ['paper-ink', 'tcard', 4.5], ['paper-muted', 'tcard', 4.5]]) // the trainer card's print
    check(ratio(t[a], t[b]) >= need, `${a} on ${b}: ${ratio(t[a], t[b]).toFixed(2)}:1 (≥ ${need})`);
  check(ratio(t.ink, t['ink-shadow']) >= 4.5 && ratio(t['ink-shadow'], t.panel) < 1.6, `pixel text shadow sits behind the ink (${ratio(t.ink, t['ink-shadow']).toFixed(2)}:1) and stays faint on the panel (${ratio(t['ink-shadow'], t.panel).toFixed(2)}:1 < 1.6)`);
  check(ratio('#FFFFFF', t['tcard-band']) >= 4.5, `white on the trainer card's title band: ${ratio('#FFFFFF', t['tcard-band']).toFixed(2)}:1 (≥ 4.5)`);
  const dL = oklch(t.bg).L - oklch(t.mat).L;
  check(dL >= .1, `mat is the darkest surface: L(bg) − L(mat) = ${dL.toFixed(3)} (≥ 0.10)`);
  for (const g of ['gold', 'mat-gold', 'fx-gold', 'foil-gold-1', 'foil-gold-3']) check(hueGap(t.sticker, t[g]) >= 20, `accent vs ${g} hue gap: ${hueGap(t.sticker, t[g]).toFixed(0)}° (≥ 20°)`);
  console.log(`     sticker on bg ${ratio(t.sticker, t.bg).toFixed(2)}:1 — below 3:1 the yellow control needs its --sticker-edge outline`);
  check(ratio(t['brand-red'], t['brand-edge']) >= 3 && ratio(t['brand-white'], t['brand-edge']) >= 12, `wordmark: red on its outline ${ratio(t['brand-red'], t['brand-edge']).toFixed(2)}:1 (≥ 3), white on its outline ${ratio(t['brand-white'], t['brand-edge']).toFixed(2)}:1 (≥ 12)`);
  check(ratio(t['brand-white'], t.hud) >= 12 && ratio(t['brand-edge'], '#E9ECF0') >= 12, `wordmark's white ring on the header ${ratio(t['brand-white'], t.hud).toFixed(2)}:1, its dark outline on the share image's pale page ${ratio(t['brand-edge'], '#E9ECF0').toFixed(2)}:1 (≥ 12; the image is white-theme in both themes)`);
  check(hueGap(t['brand-red'], t.sticker) >= 40 && ratio(t['brand-red'], t['brand-white']) >= 3.5, `wordmark red is clear of the yellow accent (${hueGap(t['brand-red'], t.sticker).toFixed(0)}° ≥ 40°) and reads on its white ring (${ratio(t['brand-red'], t['brand-white']).toFixed(2)}:1 ≥ 3.5)`);
}
process.exit(bad ? 1 : 0);
