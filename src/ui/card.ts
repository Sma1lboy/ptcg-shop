// 卡面: the one way a card is drawn in 2D (DESIGN.md「卡面」): the scan in a 63×88 box with the scan's own 3.2 mm corner, the foil
// reflection by where the real printing is foil, the rarity mark as printed next to the card number, the price under the card, and
// blank card stock while the scan loads or when it can't. Every 2D place that shows a card uses these: lit panels render the
// templates, the imperative mat (mat.ts) takes them as strings through toHTML(). The card back and the basic-energy face are SVG
// images built here, so the mat, the share canvas (share.ts drawImage) and the 3D table (table3d.js, as textures) draw the same picture.
import { html, svg, render, nothing, type TemplateResult } from 'lit-html';
import type { Pull } from '../sim.ts';
import { card as scan } from '../assets.ts';
import { money, rarLabel } from './common.ts';

type Card = Pick<Pull, 'set' | 'n' | 'name' | 'r' | 'kind'>;
// list: a row thumb (32–48px) · thumb: the pack tray (48–72px) · show: binder / ten-pack spread (96–180px) · big: the card in hand (≥ 200px, hi-res)
export type Size = 'list' | 'thumb' | 'show' | 'big';

// Which part of the printed card is foil, by the slot it came from; the 3D table reads the same table ([look, strength of its shader sheen]):
// rev = all but the art box · holo = the art box · full = whole card · etch = whole card, textured (full arts, gold) · ball = Poké/Master Ball pattern outside the art box · cosmos = foil energy.
export const FOIL: Record<string, [string, number]> = { REV: ['rev', .75], R: ['holo', .8], RR: ['full', .75], ACE: ['full', .8], UR: ['etch', 1], IR: ['etch', .8], SIR: ['etch', 1],
  HR: ['etch', 1], MHR: ['etch', 1], PB: ['ball', .85], MB: ['ball', 1], FE: ['cosmos', .85] };

// ---------- rarity mark: the symbol printed after the card number (checked against the scans) ----------
// 14 units = 1em. Stacked stars overlap the way the print does; the gap stroke is the page colour, like the print's white outline.
const star = (x: number, y: number, r: number) => {
  let d = ''; for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, q = i % 2 ? r * .5 : r; d += `${i ? 'L' : 'M'}${(x + q * Math.cos(a)).toFixed(2)} ${(y + q * Math.sin(a)).toFixed(2)}`; }
  return d + 'Z';
};
const one = [star(6, 7.4, 5.6)], two = [star(5.6, 6, 5.2), star(13.4, 8.6, 5.2)];
const MARKS: Record<string, { tone: string; w: number; h?: number; d: string[] }> = {
  C: { tone: 'ink', w: 12, d: ['M1.6 7a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0-8.8 0Z'] },
  U: { tone: 'ink', w: 12, d: ['M6 1.8L11 7L6 12.2L1 7Z'] },
  R: { tone: 'ink', w: 12, d: one }, RR: { tone: 'ink', w: 19, d: two },
  ACE: { tone: 'ace', w: 12, d: one },       // ACE SPEC: one pink star
  UR: { tone: 'silver', w: 19, d: two },     // white stars on the card; silver on our page, where white would vanish
  IR: { tone: 'gold', w: 12, d: one }, SIR: { tone: 'gold', w: 19, d: two },
  HR: { tone: 'gold', w: 19, h: 17, d: [star(9.5, 5.4, 4.8), star(5, 11.8, 4.8), star(14, 11.8, 4.8)] },
  MHR: { tone: 'gold mk-mhr', w: 14, d: ['M7 .8Q8.4 5.6 13.2 7Q8.4 8.4 7 13.2Q5.6 8.4 .8 7Q5.6 5.6 7 .8Z'] }, // four-pointed star, dark outline
};
// REV / PB / MB are printings of a C/U/R card and carry its symbol; basic energy has none. aria: false when the rarity name is written next to it.
const markKey = (c: Pick<Card, 'r' | 'kind'>) => (['REV', 'PB', 'MB'].includes(c.kind) ? c.r : c.kind);
export function mark(c: Pick<Card, 'r' | 'kind'>, aria = true) {
  const k = markKey(c), m = MARKS[k]; if (!m) return nothing;
  return html`<svg class="mk mk-${m.tone}" viewBox="0 0 ${m.w} ${m.h ?? 14}" style="width:${m.w / 14}em;height:${(m.h ?? 14) / 14}em" role=${aria ? 'img' : nothing} aria-hidden=${aria ? nothing : 'true'}>${aria ? svg`<title>${rarLabel(k)}</title>` : nothing}${m.d.map(d => svg`<path d=${d}/>`)}</svg>`;
}

// ---------- the card back, the basic-energy face and blank stock, as SVG images (2D <img>, share.ts drawImage, table3d.js textures) ----------
// Energy has no card art in the data: a basic energy card is recognised by its type mark (leaf, flame, drop, bolt, eye, fist,
// crescent, triangle), white on the type colour, not by a character in a display face (「火」 in the display font read as 「活」).
// Marks are our own drawings on a 100×100 box; `cut` is drawn over `d` in the circle colour. Print colours, same in both themes.
const ENERGY: Record<string, { col: string; d: string; cut?: string; rot?: number; dot?: number[] }> = {
  草: { col: '#3E9B4F', rot: -32, d: 'M50 16C67 27 75 45 70 62C66 75 58 81 50 81C42 81 34 75 30 62C25 45 33 27 50 16ZM48.6 81H51.4V92H48.6Z',
    cut: 'M48.8 30H51.2V80H48.8ZM50 46L61 38L62 40L50 49ZM50 60L64 51L65 53L50 63ZM50 52L38 44L37 46L50 55ZM50 66L36 58L35 60L50 69Z' },
  火: { col: '#D8492C', d: 'M50 14C55 30 72 37 72 57C72 72 62 83 50 83C38 83 28 72 28 57C28 46 34 38 40 32C40 41 43 46 47 48C44 36 45 25 50 14Z',
    cut: 'M50 57C55 62 58 66 57 72C56 77 53 79 50 79C47 79 44 77 43 72C42 66 45 62 50 57Z' },
  水: { col: '#2F7FC9', d: 'M50 14C58 30 73 44 73 60C73 73 63 84 50 84C37 84 27 73 27 60C27 44 42 30 50 14Z', cut: 'M37 60C37 68 42 74 49 76C44 72 41 67 41 60Z' },
  雷: { col: '#E7B521', d: 'M57 12L28 55H46L39 88L72 41H54L63 12Z' },
  超: { col: '#8C52B3', d: 'M14 50C26 30 74 30 86 50C74 70 26 70 14 50Z', cut: 'M64 50A14 14 0 1 0 36 50A14 14 0 1 0 64 50Z', dot: [50, 50, 7] },
  斗: { col: '#B4622F', d: 'M27 40A6 6 0 0 1 39 40V46H40V36A6 6 0 0 1 52 36V46H53V36A6 6 0 0 1 65 36V46H66V40A6 6 0 0 1 78 40V64C78 75 70 82 60 82H43C33 82 27 75 27 66Z',
    cut: 'M38.7 37H40.3V50H38.7ZM51.7 33H53.3V50H51.7ZM64.7 37H66.3V50H64.7ZM27 55H55C60 55 63 58 63 62C63 66 60 68 55 68H44V65.5H55C58 65.5 60 64 60 62C60 60 58 58 55 58H27Z' },
  恶: { col: '#2E4652', d: 'M72 32A28 28 0 1 0 72 68A23 23 0 1 1 72 32Z' },
  钢: { col: '#8996A5', d: 'M50 16L82 74H18Z', cut: 'M50 40L64 66H36Z' },
};
const W = 512, H = 715; // 63×88
const tok = (n: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
const url = (s: string) => 'data:image/svg+xml,' + encodeURIComponent(s);
const rr = (x: number, y: number, w: number, h: number, r: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
let backURL = '';
// The shop's emblem on the back and the binder (table3d.js drawBinder): a four-point sparkle — 欧气, the luck in the pack — in a
// diamond frame. On a 100-unit box around 0,0. Deliberately no circle split by a band: that reads as a Poké Ball.
export const EMBLEM = { outer: 104, inner: 80, star: 'M0-34L7-7L34 0L7 7L0 34L-7 7L-34 0L-7-7Z' };
export function back() { // the shop's own back: navy, a lighter swirl, the emblem (not the official back)
  if (!backURL) {
    const b1 = tok('--back-1', '#1D3F86'), b2 = tok('--back-2', '#0E214D'), ring = tok('--back-ring', '#E9ECF2'), cx = W / 2, cy = H / 2;
    const swirl = Array.from({ length: 9 }, (_, k) => `<ellipse cx="60" cy="0" rx="250" ry="70" transform="rotate(${((k + 1) * .7 * 180 / Math.PI).toFixed(2)})"/>`).join('');
    const sq = (s: number, r: number, fill: string) => `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${r}" transform="rotate(45)" fill="${fill}"/>`;
    backURL = url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${H * .7}" fx="${W * .3}" fy="${H * .22}" fr="20"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="${b2}"/><g fill="url(#g)">${rr(24, 24, W - 48, H - 48, 16)}</g>
      <g transform="translate(${cx} ${cy})" fill="rgb(120,160,255)" fill-opacity=".05">${swirl}</g>
      <g transform="translate(${cx} ${cy}) scale(1.3)">${sq(EMBLEM.outer, 12, ring)}${sq(EMBLEM.inner, 6, b2)}<path d="${EMBLEM.star}" fill="${ring}"/></g></svg>`);
  }
  return backURL;
}
const energyURLs: Record<string, string> = {};
export function energy(name: string) { // basic energy: the type mark on the type colour, the way the printed card is recognised (not a character in a display face)
  const t = name.slice(2, 3) in ENERGY ? name.slice(2, 3) : '钢';
  if (!energyURLs[name]) {
    const e = ENERGY[t], rim = tok('--stock-rim', '#C9CED6'), ink = tok('--stock-ink', '#1F2833');
    const font = tok('--font-body', 'sans-serif').replace(/"/g, "'"), cx = W / 2, cy = Math.round(H * .44), py = Math.round(H * .74), k = 154 / 50;
    const rays = Array.from({ length: 24 }, (_, i) => `<path transform="rotate(${(i + 1) * 15})" d="M0 0L${H} -26L${H} 26Z"/>`).join('');
    energyURLs[name] = url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><clipPath id="c">${rr(22, 22, W - 44, H - 44, 14)}</clipPath>
      <radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${H * .7}" fr="30"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${e.col}" stop-opacity=".35"/><stop offset="1" stop-color="${e.col}"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="${rim}"/><g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="url(#g)"/><g transform="translate(${cx} ${cy})" fill="#fff" fill-opacity=".16">${rays}</g></g>
      <circle cx="${cx}" cy="${cy}" r="166" fill="#fff" fill-opacity=".95"/>
      <g transform="translate(${cx - 154} ${cy - 154}) scale(${k})"><circle cx="50" cy="50" r="50" fill="${e.col}"/><g${e.rot ? ` transform="rotate(${e.rot} 50 50)"` : ''}><path d="${e.d}" fill="#fff"/>${e.cut ? `<path d="${e.cut}" fill="${e.col}"/>` : ''}${e.dot ? `<circle cx="${e.dot[0]}" cy="${e.dot[1]}" r="${e.dot[2]}" fill="#fff"/>` : ''}</g></g>
      <rect x="60" y="${py}" width="${W - 120}" height="84" rx="42" fill="#fff" fill-opacity=".88"/>
      <text x="${cx}" y="${py + 57}" text-anchor="middle" font-family="${font}" font-weight="600" font-size="44" fill="${ink}">${name}</text>
      <text x="44" y="66" font-family="${font}" font-weight="500" font-size="24" fill="${ink}" fill-opacity=".6">基础能量</text></svg>`);
  }
  return energyURLs[name];
}

// Blank card stock with the name, for a scan that can't load where there's no DOM to print it on (the 3D table): the same
// silver rim, paper and print as .cf-failed. The name is Latin in the data, so it wraps on words.
export function stock(name: string) {
  const rim = tok('--stock-rim', '#C9CED6'), paper = tok('--stock', '#E9ECF0'), ink = tok('--stock-ink', '#1F2833'), font = tok('--font-body', 'sans-serif').replace(/"/g, "'");
  const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const lines = name.match(/.{1,14}(\s|$)|\S+/g) || [name];
  return url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${rim}"/><rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="${paper}"/>
    <g font-family="${font}" text-anchor="middle" fill="${ink}"><g font-weight="600" font-size="40">${lines.map((l, i) => `<text x="${W / 2}" y="${Math.round(H * .45 + i * 50)}">${esc(l.trim())}</text>`).join('')}</g>
    <text x="${W / 2}" y="${Math.round(H * .7)}" font-size="26" fill-opacity=".7">卡图没加载出来</text></g></svg>`);
}

// ---------- the card ----------
// alt: say the card's name (the binder, where nothing else does); elsewhere the name is written next to the card or on its button.
export function face(c: Card, size: Size, alt = false) {
  const foil = FOIL[c.kind]?.[0], e = c.r === 'E';
  return html`<span class="cf cf-${size}${foil ? ` f-${foil}` : ''}" role=${alt ? 'img' : nothing} aria-label=${alt ? c.name : nothing}>
    <img class="cf-art" src=${e ? energy(c.name) : scan(c.set, c.n, size === 'big' ? 'high' : 'low')} alt="" crossorigin=${e ? nothing : 'anonymous'}
      decoding="async" loading=${size === 'show' || size === 'list' ? 'lazy' : 'eager'}><span class="cf-miss" aria-hidden="true">${c.name}<small>卡图没加载出来</small></span>${foil ? html`<i class="cf-foil"></i>` : nothing}</span>`;
}
export const backFace = () => html`<span class="cf cf-back"><img class="cf-art" src=${back()} alt=""></span>`;
// Under the card: the mark (and at big size the rarity's name) on the left, the market price in label numerals on the right.
// Market prices are never label-yellow: that is only for prices the player sets (DESIGN.md).
export const cap = (c: Card & { price: number }, size: Size) =>
  html`<span class="cf-cap">${mark(c)}${size === 'big' ? html`<span class="cf-rar">${rarLabel(c.kind)}</span>` : nothing}<b class="cf-price">${money(c.price)}</b></span>`;

// A failed scan shows blank stock with the name: one capture listener (load/error don't bubble) for lit panels and the mat alike.
// Cleared on load too, since lit re-uses an <img> for another card when a list shifts.
const flag = (e: Event) => { const t = e.target; if (t instanceof HTMLImageElement && t.classList.contains('cf-art')) t.parentElement!.classList.toggle('cf-failed', e.type === 'error'); };
document.addEventListener('error', flag, true); document.addEventListener('load', flag, true);

// For the mat, which is built from strings: render the template once into a scratch box and hand back its markup. The templates
// above bind attributes only (no events, no properties), so the markup is the whole card; lit's markers are just comments.
const scratch = document.createElement('div');
export const toHTML = (t: TemplateResult | typeof nothing) => { render(t, scratch); return scratch.innerHTML; };
