// Share images: the 欧气鉴定 card (欧气 page) and the per-pack poster (开包 table), both a graded-card slab, shown in one <dialog>. Both are drawn on a canvas with the page's own tokens.
import { card } from '../assets.ts';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, rarLabel } from './common.ts';
import { back, stock } from './card.ts';
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
export const hits = () => { const t = G.state.tally; return ([['MHR', '超级金卡'], ['SIR', 'SIR'], ['HR', '金卡'], ['IR', 'IR'], ['UR', 'UR']] as const).filter(([k]) => t[k]).map(([k, n]) => [n, t[k]] as const); };

// ---------- card art for share images ----------
// Local mirror art is same-origin; the CDN fallback (file://, CodePen) needs a CORS-mode load to keep the canvas exportable.
const loadOne = (url: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); setTimeout(() => res(null), 5000); i.src = url; });
async function loadArt(c: { set: string; n: string; name: string }) {
  for (const size of ['high', 'low']) { const i = await loadOne(card(c.set, c.n, size)); if (i) return i; }
  return loadOne(stock(c.name)); // offline: card.ts's blank stock with the name, the same picture as the 3D table's
}
const roundRect = (x: CanvasRenderingContext2D, px: number, y: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(px, y, w, h, r); };
// The card as card.ts draws it on the page (DESIGN.md「卡面」): the scan filling a 63×88 box with its 3.2 mm corner, a soft shadow;
// card.ts's blank stock when the scan can't load (loadArt). The face-down card is card.ts's back, drawn the same way.
function drawArt(x: CanvasRenderingContext2D, img: HTMLImageElement | null, px: number, py: number, w: number) {
  const h = w * 88 / 63, r = w * .0508;
  x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 40; x.shadowOffsetY = 16; roundRect(x, px, py, w, h, r); x.fillStyle = css('--stock-rim'); x.fill(); x.restore();
  x.save(); roundRect(x, px, py, w, h, r); x.clip();
  if (img) x.drawImage(img, px, py, w, h);
  x.restore();
  return h;
}

// ---------- the slab: both share images are a graded-card slab lying on the playmat (DESIGN.md「评级标签」) ----------
// Canvas text falls back to a system face without a word if its font isn't loaded yet, and fonts.ready resolves even when a face
// never loaded. The CJK display face comes in unicode-range slices, so ask for the exact text it will print.
async function fonts(text: string) {
  if (!document.fonts) return;
  await Promise.all([`900 64px ${css('--font-display')}`, `600 40px ${css('--font-tag')}`].map(f => document.fonts.load(f, text).catch(() => null)));
}
// Longest start of s that fits in w at the current font, with an ellipsis if cut.
function fit(x: CanvasRenderingContext2D, s: string, w: number) {
  if (x.measureText(s).width <= w) return s;
  let n = s.length; while (n > 1 && x.measureText(s.slice(0, n) + '…').width > w) n--;
  return s.slice(0, n) + '…';
}
interface Label { k: string; what: string; short?: string; best?: string; price?: string; cert?: string; bars?: number[]; grade: string; gradeF: string; sub: string }
// Clear acrylic case: body and shadow, the seam where the two halves meet, the label with its inset navy frame, the card in its well,
// and one soft glare across the front. Returns the slab's bottom edge.
function slab(x: CanvasRenderingContext2D, W: number, top: number, cw: number, art: HTMLImageElement | null, L: Label) {
  const pad = 32, lh = 212, ch = cw * 88 / 63, sw = Math.max(cw + pad * 2 + 28, 600), sx = (W - sw) / 2, sh = pad + lh + 40 + ch + pad + 20, cy = top + pad + lh + 40;
  const body = () => roundRect(x, sx, top, sw, sh, 30);
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 70; x.shadowOffsetY = 30; body(); x.fillStyle = css('--mat'); x.fill(); x.restore();
  body(); x.fillStyle = 'rgba(255,255,255,.07)'; x.fill(); x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.45)'; x.stroke();
  roundRect(x, sx + 12, top + 12, sw - 24, sh - 24, 20); x.strokeStyle = 'rgba(255,255,255,.14)'; x.stroke();
  // label
  const lx = sx + pad, ly = top + pad, lw = sw - pad * 2, ink = css('--paper-ink'), muted = css('--paper-muted');
  roundRect(x, lx, ly, lw, lh, 4); x.fillStyle = css('--paper'); x.fill();
  roundRect(x, lx + 9, ly + 9, lw - 18, lh - 18, 2); x.strokeStyle = ink; x.lineWidth = 3; x.stroke();
  const tx = lx + 34, rx = lx + lw - 34;
  x.textBaseline = 'alphabetic'; x.textAlign = 'right'; x.fillStyle = ink;
  // the grade word as big as it can be while the header line beside it still fits
  x.font = `700 26px ${css('--font-body')}`; const kw = x.measureText(L.k).width;
  let fs = 72; do { x.font = `900 ${fs}px ${L.gradeF}`; } while (fs > 44 && lw - 96 - x.measureText(L.grade).width < kw && (fs -= 4));
  const gw = x.measureText(L.grade).width; x.fillText(L.grade, rx, ly + 116);
  x.font = `600 26px ${css('--font-body')}`; x.fillText(L.sub, rx, ly + 162);
  const room = lw - 68 - Math.max(gw, x.measureText(L.sub).width) - 28;
  x.textAlign = 'left';
  x.font = `700 26px ${css('--font-body')}`; x.fillText(fit(x, L.k, room), tx, ly + 58);
  x.font = `24px ${css('--font-body')}`; x.fillText(fit(x, L.short && x.measureText(L.what).width > room ? L.short : L.what, room), tx, ly + 96);
  if (L.best) {
    x.font = `600 30px ${css('--font-tag')}`; const pw = L.price ? x.measureText(L.price).width + 12 : 0;
    x.font = `24px ${css('--font-body')}`; const nm = fit(x, L.best, room - pw); x.fillText(nm, tx, ly + 132);
    if (L.price) { const nw = x.measureText(nm).width; x.font = `600 30px ${css('--font-tag')}`; x.fillText(L.price, tx + nw + 12, ly + 132); }
  }
  if (L.cert && L.bars) {
    // barcode + number end at least a character (28 px) short of the grade's sub line: narrower bars first, then a shorter number
    x.font = `20px ${css('--font-body')}`; const units = L.bars.reduce((a, b) => a + b, 0), fits = (t: string) => units * 1.5 + 14 + x.measureText(t).width <= room;
    const no = [`No. ${L.cert}`, L.cert.replace(' ', ''), ''].find(t => !t || fits(t))!;
    const u = Math.max(1.5, Math.min(3, (room - 14 - x.measureText(no).width) / units)); let bx = tx; L.bars.forEach((w, i) => { if (!(i % 2)) { x.fillStyle = ink; x.fillRect(bx, ly + 150, w * u, 30); } bx += w * u; });
    x.fillStyle = muted; if (no) x.fillText(no, bx + 14, ly + 173);
  }
  // card in its well
  const cx = (W - cw) / 2;
  roundRect(x, cx - 14, cy - 14, cw + 28, ch + 28, 14); x.fillStyle = 'rgba(0,0,0,.3)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 2; x.stroke();
  drawArt(x, art, cx, cy, cw);
  // glare
  x.save(); body(); x.clip();
  const g = x.createLinearGradient(sx, top, sx + sw * .9, top + sh * .6);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.34, 'rgba(255,255,255,0)'); g.addColorStop(.4, 'rgba(255,255,255,.09)'); g.addColorStop(.47, 'rgba(255,255,255,.02)'); g.addColorStop(.6, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(sx, top, sw, sh); x.restore();
  return top + sh;
}
// The playmat the slab lies on: same dark mat as the page (both themes), lit from above.
function mat(x: CanvasRenderingContext2D, W: number, H: number) {
  x.fillStyle = css('--mat'); x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H * .38, 60, W / 2, H * .38, H * .62); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

// ---------- share card: the 欧气鉴定 label on a slab holding the priciest card ever pulled ----------
// Where the player's total sits among the simulated players (S.luckSamples, the draws luckPercentile counts): one bar per slice of a
// log money axis (totals are right-skewed; one big card is a long way right), bars the player beat filled in ink, the rest muted.
function spread(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, sims: Float64Array, you: number, exp: number) {
  const mi = css('--mat-ink'), mm = css('--mat-muted'), num = css('--font-tag'), B = S.luckBins(sims, you, exp), top = Math.max(...B.bins), bw = w / B.bins.length, yx = px + B.you * w;
  B.bins.forEach((c, i) => {
    if (!c) return;
    const bh = Math.max(3, c / top * h), bx = px + i * bw;
    x.fillStyle = B.beat(i) ? mi : mm; x.globalAlpha = B.beat(i) ? .8 : .32; x.fillRect(bx + 1, py + h - bh, bw - 2, bh);
  });
  x.globalAlpha = 1; x.fillStyle = mm; x.fillRect(px, py + h, w, 2);
  const ex = px + B.exp * w; x.fillRect(ex - 1, py + h, 2, 12);
  x.textAlign = 'center'; x.font = `22px ${css('--font-body')}`; x.fillText(`期望 ${money(exp)}`, Math.min(px + w - 70, Math.max(px + 70, ex)), py + h + 36);
  x.fillStyle = mi; x.fillRect(yx - 2, py - 14, 4, h + 14);
  x.font = `600 28px ${num}`; x.textAlign = yx > px + w - 90 ? 'right' : yx < px + 90 ? 'left' : 'center'; x.fillText(`你 ${money(you)}`, yx, py - 22);
}
async function drawCard() {
  const g = grade(), L = g.L, best = g.best, pct = pctText(g.pct!), sims = S.luckSamples(G.state.packsBy), bestLine = g.bestLine;
  await fonts(L.title + '欧气卡铺鉴定' + g.head + g.method + bestLine + hits().flat().join('') + `你期望${money(L.value)}${money(L.expected)}`);
  const art = best ? await loadArt(best) : await loadOne(back()); // no hit yet: the card lies face down
  const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; // 3:4, the phone-feed shape
  const x = c.getContext('2d')!, mi = css('--mat-ink'), mm = css('--mat-muted'), body = css('--font-body');
  mat(x, W, H);
  const y = slab(x, W, 40, 460, art, { k: '欧气卡铺 · 欧气鉴定', what: g.what, short: g.short, best: best?.name, price: best ? money(g.bestNow) : '', cert: g.cert, bars: g.bars,
    grade: L.title, gradeF: css('--font-display'), sub: `超过 ${pct}%` });
  // under the slab, what a stranger needs to read the grade: against whom, how sure, and why
  x.textAlign = 'center'; x.fillStyle = mi; x.font = `600 34px ${body}`;
  x.fillText(g.head, W / 2, y + 54);
  spread(x, 130, y + 112, W - 260, 96, sims, L.value, L.expected);
  x.textAlign = 'center'; x.fillStyle = mm; x.font = `22px ${body}`;
  x.fillText(g.method, W / 2, y + 284);
  x.fillStyle = mi; x.font = `28px ${body}`; x.fillText(fit(x, bestLine, W - 120), W / 2, y + 330);
  const hitsLine = hits().map(([n, c]) => `${n} ×${c}`).join('  ·  ');
  x.fillStyle = mm; x.font = `24px ${body}`; if (hitsLine) x.fillText(hitsLine, W / 2, y + 368);
  x.font = `20px ${body}`; x.fillText('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计 · 欧气卡铺', W / 2, H - 22);
  return c.toDataURL('image/png');
}

// One pack or one batch, straight from the mat: the best card in a slab, graded by where the pack ranks among packs of its set.
async function drawPack(d: ShareSpec) {
  // bottom half reads from the bottom: a 5th-percentile pack is 后 5%, not a boastful 前 95%
  const top = d.pct >= .995 ? '前 0.5%' : d.pct >= .5 ? `前 ${Math.max(1, Math.round((1 - d.pct) * 100))}%` : `后 ${Math.max(1, Math.round(d.pct * 100))}%`;
  // A batch with more than one hit lays out what the table shows after it (table3d.js): the dearest in the slab, the next few RR-and-up
  // cards in a row under it, each on a plate with name, rarity and price, and the rest as one line 「另 N 张 · 合计 $x」.
  const row = d.n > 1 ? d.front.filter(c => c !== d.best).slice(0, 4) : [], rest = d.count - 1 - row.length, restV = d.value - d.best.price - row.reduce((a, c) => a + c.price, 0);
  await fonts(top + d.set + d.best.name + row.map(c => c.name + rarLabel(c.kind)).join('') + '另张合计');
  const [art, ...arts] = await Promise.all([d.best, ...row].map(loadArt)), W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!, mi = css('--mat-ink'), mm = css('--mat-muted'), body = css('--font-body'), tag = css('--font-tag');
  mat(x, W, H);
  let y = slab(x, W, row.length ? 36 : 48, row.length ? 360 : 580, art, { k: `欧气卡铺 · ${d.set}`, what: d.n > 1 ? `${d.n} 包共开出 ${money(d.value)}` : `这包开出 ${money(d.value)}`,
    best: d.best.name, price: money(d.best.price), ...cert(`${d.set}|${d.n}|${Math.round(d.value * 100)}|${d.best.n}`), grade: top, gradeF: css('--font-tag'), sub: d.n > 1 ? `最好的一包 ${money(d.bestPack)}` : '同系列的包里' });
  if (row.length) {
    const cw = 160, gap = 28, rw = row.length * cw + (row.length - 1) * gap, ry = y + 32;
    row.forEach((cd, i) => {
      const cx = (W - rw) / 2 + i * (cw + gap), ch = drawArt(x, arts[i], cx, ry, cw), py = ry + ch + 10;
      roundRect(x, cx - 6, py, cw + 12, 96, 6); x.fillStyle = 'rgba(0,0,0,.34)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1.5; x.stroke();
      x.textAlign = 'center'; x.fillStyle = mi; x.font = `600 21px ${body}`; x.fillText(fit(x, cd.name, cw), cx + cw / 2, py + 28);
      x.fillStyle = mm; x.font = `17px ${body}`; x.fillText(fit(x, rarLabel(cd.kind), cw), cx + cw / 2, py + 54);
      x.fillStyle = mi; x.font = `600 26px ${tag}`; x.fillText(money(cd.price), cx + cw / 2, py + 84);
    });
    y = ry + cw * 88 / 63 + 106;
    x.textAlign = 'center'; x.fillStyle = mm; x.font = `24px ${body}`; x.fillText(`另 ${rest} 张 · 合计 ${money(restV)}`, W / 2, y + 36);
    y += 26;
  }
  const diff = d.value - d.cost;
  x.textAlign = 'center';
  x.font = `30px ${body}`; x.fillStyle = mi; x.fillText(d.rank.length > 30 ? d.rank.slice(0, 30) + '…' : d.rank, W / 2, y + (row.length ? 56 : 76));
  x.font = `28px ${body}`; x.fillStyle = diff >= 0 ? css('--mat-gain') : css('--mat-loss');
  x.fillText(`${d.n > 1 ? '共开出' : '开出'} ${money(d.value)} · 进货 ${money(d.cost)} · ${diff >= 0 ? '赚' : '亏'} ${money(Math.abs(diff))}`, W / 2, y + (row.length ? 102 : 130));
  x.font = `22px ${body}`; x.fillStyle = mm; x.fillText('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计 · 欧气卡铺', W / 2, H - 30);
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
  $('pop-copy').onclick = e => navigator.clipboard?.writeText(text + ' ' + location.href).then(() => { (e.target as HTMLElement).textContent = '已复制'; });
  if (canShare) $('pop-share').onclick = () => navigator.share({ files: [png], text }).catch(() => null); // cancelled sheet rejects; nothing to do
}
export const showPack = (d: ShareSpec) => pop(() => drawPack(d), `我在欧气卡铺开出了 ${d.best.name}（${money(d.best.price)}），${d.rank}`, 'ouqi-pack.png');
export const showLuck = () => {
  const g = grade(), L = g.L;
  return pop(drawCard, `我在欧气卡铺开了 ${L.packs} 包，开出总值超过 ${pctText(g.pct!)}%（±${g.err}）的模拟玩家：${L.title}。${g.best ? `最贵的一张 ${g.best.name} ${money(g.bestNow)}，占总值 ${g.share}%。` : ''}`, 'ouqi.png');
};
