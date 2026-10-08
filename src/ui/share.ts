// Share images: the 欧气鉴定 card (欧气 page) and the per-pack poster (开包 table), both drawn on a canvas in the Black/White DS look and shown in one <dialog>. The card is the page's trainer card (sky-blue face, blue title band, the facts on white strips, the verdict word, the owner's portrait, barcode and ID) with BW windows under it (the distribution, the priciest card); the pack poster is one BW window titled with the set. Pixel type at weight 400 with a hard shadow, the White theme's colours whatever theme the viewer has on.
import { art, home as where } from '../assets.ts';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, rarLabel, RAR } from './common.ts';
import { back, stock } from './card.ts';
import { wordmark, NAME } from '../brand.ts';
import type { ShareSpec } from './mat.ts';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// 超过 99.5% is true for anything at or above it; '99.5+%' read oddly.
export const pctText = (p: number) => p >= 99.5 ? '99.5' : p.toFixed(0);
// A cert number for what a label grades: a hash, so the same thing always prints the same number and one more pack a new one.
// The barcode is drawn from its digits (bar and gap widths alternating, starting and ending on a bar).
export function cert(of: string) {
  let h = 2166136261;
  for (const ch of of) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const d = String((h >>> 0) % 1e8).padStart(8, '0');
  return { cert: `${d.slice(0, 4)} ${d.slice(4)}`, bars: [2, 1, 1, 1, ...[...d].flatMap(c => [1 + +c % 3, 1 + (+c >> 2 & 1), 1 + (+c >> 1 & 1), 1]), 1, 1, 2] };
}
// 95% interval of the percentile from sampling LUCK_TRIALS players (the only error left; sim.ts has no pool to be biased by).
export const margin = (pct: number) => Math.max(0.1, 196 * Math.sqrt(pct / 100 * (1 - pct / 100) / S.LUCK_TRIALS)).toFixed(1);
// Without the priciest card: its value taken off the total, ranked against the same simulated players. Recomputed only when packs move.
let without = { of: '', pct: 0 };
// 欧气鉴定 (DESIGN.md「评级标签」): the verdict printed like the label on a graded-card slab. The page (luck.ts) and the share
// image print the same fields: what was graded (packs, sets, the best card), the grade word and percentile ± its error, a cert number,
// and how much of the total the best card is (small samples are mostly one card; this is what tells a viewer why).
export function grade() {
  const L = G.luck(), s = G.state, best = s.hits[0] || null;
  const sets = SETS.filter(x => s.opened[x.id]).map(x => x.name);
  const pct = L.pct == null ? null : L.pct * 100, bestNow = best ? (L.live ? S.cardPrice(best.set, best.n, best.kind) ?? best.price : best.price) : 0; // same price basis as L.value
  const of = `${L.packs}|${L.value}|${bestNow}`;
  if (best && pct != null && without.of !== of) without = { of, pct: S.luckPercentile(s.packsBy, L.value - bestNow) * 100 };
  const share = best && L.value > 0 ? Math.round(bestNow / L.value * 100) : null, wo = best && pct != null ? without.pct : null;
  return { L, pct, best, bestNow, err: pct == null ? '' : margin(pct), ...cert(`${L.packs}|${Math.round(L.value * 100)}|${best ? best.set + best.n : ''}`),
    share, without: wo,
    // the lines printed under the label on the page and under the slab on the share image, word for word
    head: pct == null ? '' : `开了 ${L.packs} 包，开出总值超过 ${pctText(pct)}% 的模拟玩家`,
    method: pct == null ? '' : `${S.LUCK_TRIALS} 个模拟玩家各开同样这些包（同系列、同包数、同概率）的总值 · 误差 ±${margin(pct)} 个百分点`,
    bestLine: !best ? '还没开出闪卡' : `最贵的一张 ${best.name} ${money(bestNow)}，占总值 ${share}%` + (pct != null && wo! < pct - 0.5 ? `，没开出它只超过 ${pctText(wo!)}%` : ''),
    what: `${L.packs} 包 · ${sets.slice(0, 2).join(' · ')}${sets.length > 2 ? ` 等 ${sets.length} 个系列` : ''}`, short: `${L.packs} 包 · ${sets.length} 个系列` };
}
export type Grade = ReturnType<typeof grade>;
// The big hits pulled, best first: the share image's last line and the page's tally.
export const hits = () => { const t = G.state.tally; return (['MHR', 'SIR', 'HR', 'IR', 'UR'] as const).filter(k => t[k]).map(k => [RAR[k].zh, t[k]] as const); };

// ---------- card art for share images ----------
// Local mirror art is same-origin; the CDN fallback (file://, CodePen) needs a CORS-mode load to keep the canvas exportable.
const loadOne = (url: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); setTimeout(() => res(null), 5000); i.src = url; });
async function loadArt(c: { set: string; n: string; name: string }) {
  for (const size of ['high', 'low']) { const i = await loadOne(art(c.set, c.n, size)); if (i) return i; }
  return loadOne(stock(c.name)); // offline: card.ts's blank stock with the name, the same picture as the 3D table's
}
const roundRect = (x: CanvasRenderingContext2D, px: number, y: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(px, y, w, h, r); };
// The card as card.ts draws it on the page (DESIGN.md「卡面」): the scan filling a 63×88 box with its 3.2 mm corner, a soft shadow;
// card.ts's blank stock when the scan can't load (loadArt). The face-down card is card.ts's back, drawn the same way.
function drawArt(x: CanvasRenderingContext2D, img: HTMLImageElement | null, px: number, py: number, w: number) {
  const h = w * 88 / 63, r = w * .0508;
  x.save(); x.shadowColor = 'rgba(38,43,51,.3)'; x.shadowBlur = 0; x.shadowOffsetX = 4; x.shadowOffsetY = 6; roundRect(x, px, py, w, h, r); x.fillStyle = css('--stock-rim'); x.fill(); x.restore(); // a hard drop shadow, like the pixel text's
  x.save(); roundRect(x, px, py, w, h, r); x.clip();
  if (img) x.drawImage(img, px, py, w, h);
  x.restore();
  return h;
}

// Canvas text falls back to a system face without a word if its font isn't loaded yet, and fonts.ready resolves even when a face
// never loaded. The pixel face is subset by glyphs (and the CDN copy is Latin only), so ask for the exact text it will print.
async function fonts(text: string) {
  if (!document.fonts) return;
  await document.fonts.load(`400 24px ${css('--font-pixel')}`, text).catch(() => null);
}
// Longest start of s that fits in w at the current font, with an ellipsis if cut.
function fit(x: CanvasRenderingContext2D, s: string, w: number) {
  if (x.measureText(s).width <= w) return s;
  let n = s.length; while (n > 1 && x.measureText(s.slice(0, n) + '…').width > w) n--;
  return s.slice(0, n) + '…';
}
// ---------- the BW look: both share images are printed like the page's own windows (DESIGN.md「题材」「训练家卡」) ----------
// The page's White-theme tokens, hardcoded on purpose: the share image is a printed object and must look the same whichever theme the
// viewer has on, and css() would return the dark theme's greys in dark mode. Same values as the :root block in style.css.
const BW = { bg: '#E9ECF0', panel: '#FFFFFF', frame: '#3A4150', frameIn: '#C3CAD6', ink: '#262B33', muted: '#59606D', inkShadow: '#CDD3DC', tcard: '#BFE0F6', band: '#2A74D0', bandShadow: '#16305C',
  gain: '#C8261C', loss: '#56698F', hud: '#252A33', hudInk: '#F2F4F7', hudShadow: '#0B0D10' };
// All short text is the pixel face at weight 400 (canvas fakes bold and smears the pixels), sizes in whole multiples of 12 so the 12 px grid
// lands on device pixels, with the BW hard shadow: the string drawn once offset in the shadow colour, then in ink.
// Long Chinese sentences (the method line, the best-card line, the pack's rank sentence) are the body font (`plain`, system sans) at 26–30 px:
// in pixel type they run past the window.
const pixel = (size: number) => `400 ${size}px ${css('--font-pixel')}`;
const plain = (size: number) => `400 ${size}px ${css('--font-body')}`;
// `face` is `plain` for what comes out of the card data (card names): the pixel face holds only the glyphs the game's own text prints.
function text(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, color: string, align: CanvasTextAlign = 'left', shadow: string | null = BW.inkShadow, face = pixel) {
  x.font = face(size); x.textAlign = align; x.textBaseline = 'alphabetic';
  if (shadow) { const d = Math.max(2, Math.round(size / 32) * 2); x.fillStyle = shadow; x.fillText(s, px + d, py + d); }
  x.fillStyle = color; x.fillText(s, px, py);
}
// The largest of `sizes` at which s fits in w (the smallest if none does).
function pixelFit(x: CanvasRenderingContext2D, s: string, w: number, sizes: number[], face = pixel) {
  for (const z of sizes) { x.font = face(z); if (x.measureText(s).width <= w) return z; }
  return sizes[sizes.length - 1];
}
// A pixel line that shrinks through `sizes` to fit w, and is cut with an ellipsis only at the smallest.
function line(x: CanvasRenderingContext2D, s: string, px: number, py: number, w: number, sizes: number[], color: string, align: CanvasTextAlign = 'left', shadow: string | null = BW.inkShadow, face = pixel) {
  const z = pixelFit(x, s, w, sizes, face); x.font = face(z); text(x, fit(x, s, w), px, py, z, color, align, shadow, face);
}
// Body-font text broken into lines of at most w (Chinese breaks anywhere).
function wrap(x: CanvasRenderingContext2D, s: string, w: number) {
  const out: string[] = []; let cur = '';
  for (const ch of s) { if (cur && x.measureText(cur + ch).width > w) { out.push(cur); cur = ch; } else cur += ch; }
  if (cur) out.push(cur);
  return out;
}
// Diagonal stripes (CSS `repeating-linear-gradient(135deg, transparent 0 p, color p 2p)` at 2×), clipped to the box by the caller.
function stripes(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, p: number, color: string) {
  const s = p * Math.SQRT2; x.fillStyle = color;
  for (let c = X + Y - h; c < X + Y + w + h; c += 2 * s) { const a = c + s, b = c + 2 * s; x.beginPath(); x.moveTo(a, Y); x.lineTo(b, Y); x.lineTo(b - h, Y + h); x.lineTo(a - h, Y + h); x.fill(); }
}
// The DS bottom screen behind everything: --bg under the body's faint ink stripe.
function screen(x: CanvasRenderingContext2D, W: number, H: number) {
  x.fillStyle = BW.bg; x.fillRect(0, 0, W, H);
  stripes(x, 0, 0, W, H, 12, 'rgba(38,43,51,.04)');
}
// A BW window at 2×: --frame rim, a gap of white, the --frame-in rule; with a title, its dark title bar (the panel h2). Returns the top of the content.
function win(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, title?: string) {
  roundRect(x, X, Y + 8, w, h, 20); x.fillStyle = 'rgba(0,0,0,.08)'; x.fill();
  roundRect(x, X, Y, w, h, 20); x.fillStyle = BW.frame; x.fill();
  roundRect(x, X + 6, Y + 6, w - 12, h - 12, 14); x.fillStyle = BW.panel; x.fill();
  roundRect(x, X + 13, Y + 13, w - 26, h - 26, 8); x.strokeStyle = BW.frameIn; x.lineWidth = 2; x.stroke();
  if (!title) return Y + 6;
  x.beginPath(); x.roundRect(X + 6, Y + 6, w - 12, 68, [14, 14, 0, 0]); x.fillStyle = BW.hud; x.fill();
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(X + 6, Y + 68, w - 12, 6);
  line(x, title, X + 36, Y + 54, w - 72, [36, 24], BW.hudInk, 'left', BW.hudShadow);
  return Y + 74;
}
// A small text box (a card's plate): rim, white, rule.
function box(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  roundRect(x, X, Y, w, h, r); x.fillStyle = BW.frame; x.fill();
  roundRect(x, X + 4, Y + 4, w - 8, h - 8, r - 4); x.fillStyle = BW.panel; x.fill();
  roundRect(x, X + 9, Y + 9, w - 18, h - 18, Math.max(2, r - 9)); x.strokeStyle = BW.frameIn; x.lineWidth = 2; x.stroke();
}
// The barcode from its bar/gap widths (cert()), squeezed to w.
function bars(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, b: number[]) {
  const u = w / b.reduce((a, c) => a + c, 0); let bx = X; x.fillStyle = BW.ink;
  b.forEach((n, i) => { if (!(i % 2)) x.fillRect(Math.round(bx), Y, Math.max(1, Math.round(n * u)), h); bx += n * u; });
}

// ---------- share card: the trainer card, then what a stranger needs to read the score, then the priciest card ----------
// The trainer card is the page's `.tcard` (luck.ts card()) drawn at 2×: rounded rim + white inner line, sky-blue striped face, blue title
// band, the facts on white strips, the verdict word big with 超过 N% under it, the owner's portrait, barcode and ID at the foot.
function tcard(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, g: Grade, who: HTMLImageElement | null) {
  const r = 28, L = g.L;
  roundRect(x, X, Y + 8, w, h, r); x.fillStyle = 'rgba(0,0,0,.12)'; x.fill(); // the card's 0 4px 0 drop shadow
  roundRect(x, X, Y, w, h, r); x.fillStyle = BW.ink; x.fill(); // the 3px rim
  const fx = X + 6, fy = Y + 6, fw = w - 12, fh = h - 12, fr = r - 6;
  roundRect(x, fx, fy, fw, fh, fr); x.fillStyle = BW.tcard; x.fill();
  x.save(); roundRect(x, fx, fy, fw, fh, fr); x.clip();
  stripes(x, fx, fy, fw, fh, 16, 'rgba(255,255,255,.28)');
  if (who) x.imageSmoothingEnabled = false, x.drawImage(who, X + w - 30 - who.width * 2, Y + h - 6 - who.height * 2, who.width * 2, who.height * 2); // 2× the page's 1×, whole pixels
  x.restore();
  roundRect(x, fx + 3, fy + 3, fw - 6, fh - 6, fr - 3); x.strokeStyle = BW.tcard; x.lineWidth = 6; x.stroke(); // inset 3px of card colour over the stripes
  roundRect(x, fx + 7, fy + 7, fw - 14, fh - 14, fr - 7); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); // and the 1px white line
  // title band
  x.beginPath(); x.roundRect(X + 14, Y + 14, w - 28, 68, [18, 18, 0, 0]); x.fillStyle = BW.band; x.fill();
  text(x, '训练家卡', X + 42, Y + 60, 36, '#fff', 'left', BW.bandShadow);
  text(x, '欧气鉴定', X + w - 42, Y + 60, 36, '#fff', 'right', BW.bandShadow);
  // the facts: 店 / 开了 / 最贵, on white strips beside the portrait
  const rx = X + 38, rw = w - 38 - 30 - (who ? who.width * 2 : 0) - 24, best = g.best;
  const rows: [string, string, string?][] = [['店', `PTCG卡店 · 第 ${G.state.branch.n + 1} 家`], ['开了', g.what, g.short]];
  if (best) rows.push(['最贵', best.name, money(g.bestNow)]);
  rows.forEach(([k, v, alt], i) => {
    const ry = Y + 100 + i * 56;
    roundRect(x, rx, ry, rw, 48, 12); x.fillStyle = 'rgba(255,255,255,.78)'; x.fill();
    text(x, k, rx + 20, ry + 33, 24, BW.band, 'left', null);
    const vx = rx + 20 + 72 + 16; let room = rw - (vx - rx) - 20;
    x.font = pixel(24);
    if (best && i === 2) { const pw = x.measureText(alt!).width; x.font = plain(24); const nm = fit(x, v, room - pw - 16), nw = x.measureText(nm).width; text(x, nm, vx, ry + 33, 24, BW.ink, 'left', null, plain); text(x, alt!, vx + nw + 16, ry + 33, 24, BW.ink, 'left', null); return; }
    text(x, fit(x, alt && x.measureText(v).width > room ? alt : v, room), vx, ry + 33, 24, BW.ink, 'left', null);
  });
  // the verdict word, then how far above the simulated players it stands
  const pctS = `超过 ${pctText(g.pct!)}%`, gap = 24;
  x.font = pixel(36); const pw = x.measureText(pctS).width, gz = pixelFit(x, L.title, rw - pw - gap, [96, 72, 48]); // the word as big as it can be with 超过 N% beside it
  x.font = pixel(gz); const gw = x.measureText(L.title).width;
  text(x, L.title, rx, Y + 100 + 172 + 92, gz, BW.ink, 'left');
  text(x, pctS, rx + gw + gap, Y + 100 + 172 + 92, 36, BW.ink, 'left');
  // barcode and ID at the foot
  bars(x, rx, Y + h - 58, 184, 28, g.bars);
  text(x, `ID No. ${g.cert}`, rx + 184 + 16, Y + h - 34, 24, BW.muted, 'left', null);
}

// Where the player's total sits among the simulated players (S.luckSamples, the draws luckPercentile counts): one bar per slice of a
// log money axis (totals are right-skewed; one big card is a long way right), bars the player beat filled in ink, the rest pale,
// like the page's distribution.
function spread(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, sims: Float64Array, you: number, exp: number) {
  const B = S.luckBins(sims, you, exp), top = Math.max(...B.bins), bw = w / B.bins.length, yx = px + B.you * w;
  B.bins.forEach((c, i) => {
    if (!c) return;
    const bh = Math.max(3, c / top * h), bx = px + i * bw;
    x.fillStyle = B.beat(i) ? BW.ink : BW.frameIn; x.fillRect(bx + 1, py + h - bh, bw - 2, bh);
  });
  x.fillStyle = BW.muted; x.fillRect(px, py + h, w, 2);
  const ex = px + B.exp * w; x.fillRect(ex - 1, py + h, 2, 12);
  const el = `期望 ${money(exp)}`; x.font = pixel(24); const ew = x.measureText(el).width / 2;
  text(x, el, Math.min(px + w - ew, Math.max(px + ew, ex)), py + h + 40, 24, BW.muted, 'center', null);
  x.fillStyle = BW.ink; x.fillRect(yx - 2, py - 10, 4, h + 10);
  const yl = `你 ${money(you)}`, al = yx > px + w - 90 ? 'right' : yx < px + 90 ? 'left' : 'center';
  text(x, yl, yx, py - 18, 36, BW.ink, al);
}
// The bottom line of both images: where the numbers come from on the left, the wordmark on the right.
function footer(x: CanvasRenderingContext2D, W: number, H: number, X: number) {
  text(x, '卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计', X + 8, H - 26, 24, BW.muted, 'left');
  wordmark(x, NAME, W - X - 8, H - 24, 30, 'right');
}

async function drawCard() {
  const g = grade(), L = g.L, best = g.best, sims = S.luckSamples(G.state.packsBy), bestLine = g.bestLine, hitList = hits().map(([n, c]) => `${n} ×${c}`), hitsLine = hitList.join(' · ');
  await fonts(L.title + 'PTCG卡店模拟器鉴定训练家卡店开了最贵超过期望你战利品分布' + g.what + g.head + hitsLine + `ID No. ${g.cert}` + `第${G.state.branch.n + 1}家` + '卡价市价概率实开统计 · ' + money(L.value) + money(L.expected) + (best ? money(g.bestNow) : ''));
  const [art, who] = await Promise.all([best ? loadArt(best) : loadOne(back()), loadOne('gen/story/owner.webp')]); // no hit yet: the card lies face down
  const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; // 3:4, the phone-feed shape
  const x = c.getContext('2d')!, X = 48, CW = W - 96;
  screen(x, W, H);
  tcard(x, X, 48, CW, 442, g, who);
  // window 1: against whom, how sure. The head is a pixel line while it fits; the method is a long sentence, so it is body-font text
  let y = 48 + 442 + 8 + 26, top = win(x, X, y, CW, 424, '欧气分布');
  line(x, g.head, X + 40, top + 52, CW - 80, [36, 24], BW.ink);
  spread(x, X + 60, top + 130, CW - 120, 80, sims, L.value, L.expected);
  x.font = plain(26); x.fillStyle = BW.muted; x.textAlign = 'left';
  const parts = g.method.split(' · '); // two clauses of one line each when they split cleanly, so 「±1.3」 never breaks across lines
  (parts.length === 2 ? parts : wrap(x, g.method, CW - 80)).slice(0, 2).forEach((s, i) => x.fillText(s, X + 40, top + 210 + 82 + i * 34));
  // window 2: the priciest card, and the tally of big hits
  y += 424 + 26; top = win(x, X, y, CW, 375, '战利品');
  const aw = 180, ax = X + CW - 40 - aw, ay = top + 24; drawArt(x, art, ax, ay, aw);
  x.font = plain(30); x.fillStyle = BW.ink; x.textAlign = 'left';
  const room = ax - 40 - (X + 40), lines = wrap(x, bestLine, room); lines.slice(0, 4).forEach((s, i) => x.fillText(s, X + 40, ay + 34 + i * 44));
  // the tally is as many pixel lines as it takes, entries kept whole, ending at the card's foot
  const tally: string[] = []; x.font = pixel(24);
  for (const h of hitList) { const last = tally.length - 1; if (last >= 0 && x.measureText(`${tally[last]} · ${h}`).width <= room) tally[last] += ` · ${h}`; else tally.push(h); }
  tally.forEach((s, i) => text(x, s, X + 40, ay + aw * 88 / 63 - 8 - (tally.length - 1 - i) * 36, 24, BW.muted, 'left'));
  footer(x, W, H, X);
  return c.toDataURL('image/png');
}

// One pack or one batch, straight from the mat: a window titled with the set, the pack's rank among packs of its set and what it
// opened to, the best card on a plate, and the profit or loss.
async function drawPack(d: ShareSpec) {
  // bottom half reads from the bottom: a 5th-percentile pack is 后 5%, not a boastful 前 95%
  const top = d.pct >= .995 ? '前 0.5%' : d.pct >= .5 ? `前 ${Math.max(1, Math.round((1 - d.pct) * 100))}%` : `后 ${Math.max(1, Math.round(d.pct * 100))}%`;
  // A batch with more than one hit lays out what the table shows after it (table3d.js): the dearest big, the next few RR-and-up
  // cards in a row under it, each on a plate with name, rarity and price, and the rest as one line 「另 N 张 · 合计 $x」.
  const row = d.n > 1 ? d.front.filter(c => c !== d.best).slice(0, 4) : [], rest = d.count - 1 - row.length, restV = d.value - d.best.price - row.reduce((a, c) => a + c.price, 0);
  const sub = d.n > 1 ? `最好的一包 ${money(d.bestPack)}` : '同系列的包里', what = d.n > 1 ? `${d.n} 包共开出` : '这包开出', diff = d.value - d.cost;
  const gain = `市价 ${money(d.value)} · 进货 ${money(d.cost)} · 按市价${diff >= 0 ? '赚' : '亏'} ${money(Math.abs(diff))}`, rank = d.rank.length > 30 ? d.rank.slice(0, 30) + '…' : d.rank;
  await fonts(top + d.set + row.map(c => rarLabel(c.kind)).join('') + '另张合计' + sub + what + gain + rarLabel(d.best.kind) + money(d.value) + '卡价市价概率实开统计PTCG卡店模拟器 · ');
  const [art, ...arts] = await Promise.all([d.best, ...row].map(loadArt)), W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!, X = 48, CW = W - 96, WB = H - 96;
  screen(x, W, H);
  const t = win(x, X, 48, CW, WB - 48, d.set), rt = X + CW - 44;
  // header: the rank big on the left, the value on the right
  text(x, top, X + 44, t + 120, 96, BW.ink, 'left');
  text(x, sub, X + 44, t + 164, 24, BW.muted, 'left', null);
  text(x, what, rt, t + 60, 24, BW.muted, 'right', null);
  text(x, money(d.value), rt, t + 120, pixelFit(x, money(d.value), 420, [72, 48]), BW.ink, 'right');
  x.fillStyle = BW.frameIn; x.fillRect(X + 44, t + 190, CW - 88, 2);
  // the best card, then the row of the next ones
  const aw = row.length ? 200 : 480, ay = t + 216, ah = drawArt(x, art, X + (CW - aw) / 2, ay, aw);
  let y = ay + ah + 24;
  const plate = (cx: number, py: number, pw: number, cd: { name: string; kind: string; price: number }, big: boolean) => {
    box(x, cx, py, pw, 112, 12);
    if (!big) { // narrow plate: name, rarity and price on a line each
      line(x, cd.name, cx + pw / 2, py + 44, pw - 24, [24], BW.ink, 'center', null, plain);
      x.font = pixel(24); const rl = rarLabel(cd.kind); // the full name when it fits, else the short one
      text(x, x.measureText(rl).width <= pw - 24 ? rl : RAR[cd.kind]?.zh ?? cd.kind, cx + pw / 2, py + 74, 24, BW.muted, 'center', null);
      line(x, money(cd.price), cx + pw / 2, py + 100, pw - 24, [24], BW.ink, 'center', null);
      return;
    }
    line(x, cd.name, cx + pw / 2, py + 52, pw - 24, [36, 24], BW.ink, 'center', null, plain);
    text(x, rarLabel(cd.kind), cx + 20, py + 92, 24, BW.muted, 'left', null);
    line(x, money(cd.price), cx + pw - 20, py + 92, pw - 40 - 96, [36], BW.ink, 'right', null);
  };
  plate(X + (CW - Math.max(aw, 560)) / 2, y, Math.max(aw, 560), d.best, true); y += 112 + 26;
  if (row.length) {
    const cw = 150, gap = 32, rw = row.length * cw + (row.length - 1) * gap, ry = y;
    row.forEach((cd, i) => { const cx = X + (CW - rw) / 2 + i * (cw + gap), ch = drawArt(x, arts[i], cx, ry, cw); plate(cx - 10, ry + ch + 12, cw + 20, cd, false); });
    y = ry + cw * 88 / 63 + 12 + 112;
    text(x, `另 ${rest} 张 · 合计 ${money(restV)}`, X + CW / 2, y + 36, 24, BW.muted, 'center', null);
  }
  // the outcome sits at the foot of the window: gain red, loss slate
  const wb = 48 + WB - 48;
  x.fillStyle = BW.frameIn; x.fillRect(X + 44, wb - 150, CW - 88, 2);
  x.font = plain(30); x.fillStyle = BW.ink; x.textAlign = 'center'; x.fillText(rank, X + CW / 2, wb - 96);
  line(x, gain, X + CW / 2, wb - 46, CW - 88, [36, 24], diff >= 0 ? BW.gain : BW.loss, 'center');
  footer(x, W, H, X);
  return c.toDataURL('image/png');
}

// A modal with the finished image. Phones get the system share sheet (a PNG file: straight into chat apps or Photos; a data-URL
// download does nothing on iOS Safari) and long-press on the image; desktop gets download.
async function pop(draw: () => Promise<string>, text: string, file: string) {
  let dlg = document.getElementById('share-pop') as HTMLDialogElement | null;
  if (!dlg) { const el = dlg = document.createElement('dialog'); el.id = 'share-pop'; el.addEventListener('click', e => { if (e.target === el || (e.target as HTMLElement).dataset.close) el.close(); }); document.body.append(el); }
  dlg.innerHTML = '<p class="muted">正在生成…</p>'; dlg.showModal();
  const url = await draw(), png = new File([await (await fetch(url)).blob()], file, { type: 'image/png' });
  const canShare = !!navigator.canShare?.({ files: [png] }), touch = matchMedia('(pointer: coarse)').matches;
  dlg.innerHTML = `<img src="${url}" alt="${text}"><div class="btns">${canShare ? '<button type="button" class="primary" id="pop-share">分享图片</button>' : ''}${canShare && touch ? '' : `<a class="dl${canShare ? '' : ' primary'}" href="${url}" download="${file}">下载 PNG</a>`}<button type="button" id="pop-copy">复制文字</button><button type="button" class="ghost" data-close="1">关闭</button></div>${touch ? '<p class="muted pop-hint">也可以长按图片保存到相册</p>' : ''}`;
  const home = where(); // where the game is: the native sheet carried only the picture and the line, and whoever got it couldn't find the game
  $('pop-copy').onclick = e => navigator.clipboard?.writeText(text + ' ' + home).then(() => { (e.target as HTMLElement).textContent = '已复制'; });
  if (canShare) $('pop-share').onclick = () => navigator.share({ files: [png], text: `${text} ${home}` }).catch(() => null); // cancelled sheet rejects; nothing to do
}
export const showPack = (d: ShareSpec) => pop(() => drawPack(d), `我在 PTCG卡店模拟器 开出了 ${d.best.name}（${money(d.best.price)}）；${d.n > 1 ? '其中最好的一包' : '这包'}${d.rank}`, 'ptcg-shop-pack.png');
export const showLuck = () => {
  const g = grade(), L = g.L;
  return pop(drawCard, `我在 PTCG卡店模拟器 开了 ${L.packs} 包，开出总值超过 ${pctText(g.pct!)}%（±${g.err}）的模拟玩家：${L.title}。${g.best ? `最贵的一张 ${g.best.name} ${money(g.bestNow)}，占总值 ${g.share}%。` : ''}`, 'ptcg-shop.png');
};
