// Share images: the 欧气鉴定 card (欧气 page) and the per-pack poster (开包 table), both a graded-card slab, shown in one <dialog>. Both are drawn on a canvas with the page's own tokens.
import { card } from '../assets.ts';
import { SETS } from '../sets.ts';
import { G, $, money } from './common.ts';
import { back, stock } from './card.ts';
import type { ShareSpec } from './mat.ts';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export const pctText = (p: number) => p >= 99.5 ? '99.5+' : p.toFixed(0);
// A cert number for what a label grades: a hash, so the same thing always prints the same number and one more pack a new one.
// The barcode is drawn from its digits (bar and gap widths alternating, starting and ending on a bar).
export function cert(of: string) {
  let h = 2166136261;
  for (const ch of of) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const d = String((h >>> 0) % 1e8).padStart(8, '0');
  return { cert: `${d.slice(0, 4)} ${d.slice(4)}`, bars: [2, 1, 1, 1, ...[...d].flatMap(c => [1 + +c % 3, 1 + (+c >> 2 & 1), 1 + (+c >> 1 & 1), 1]), 1, 1, 2] };
}
// 欧气鉴定 (DESIGN.md「评级标签」): the verdict printed like the label on a graded-card slab. The page (luck.ts) and the share
// image print the same fields: what was graded (packs, sets, the best card), the grade word and percentile, a cert number.
export function grade() {
  const L = G.luck(), s = G.state, best = s.hits[0] || null;
  const sets = SETS.filter(x => s.opened[x.id]).map(x => x.name);
  return { L, pct: L.pct == null ? null : L.pct * 100, best, ...cert(`${L.packs}|${Math.round(L.value * 100)}|${best ? best.set + best.n : ''}`),
    what: `${L.packs} 包 · ${sets.slice(0, 2).join(' · ')}${sets.length > 2 ? ` 等 ${sets.length} 个系列` : ''}`, short: `${L.packs} 包 · ${sets.length} 个系列` };
}
export type Grade = ReturnType<typeof grade>;

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
  const pad = 32, lh = 212, ch = cw * 88 / 63, sw = cw + pad * 2 + 28, sx = (W - sw) / 2, sh = pad + lh + 40 + ch + pad + 20, cy = top + pad + lh + 40;
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
  x.font = `900 ${L.grade.length > 3 ? 58 : 72}px ${L.gradeF}`; const gw = x.measureText(L.grade).width; x.fillText(L.grade, rx, ly + 116);
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
    const u = 3; let bx = tx; L.bars.forEach((w, i) => { if (!(i % 2)) { x.fillStyle = ink; x.fillRect(bx, ly + 150, w * u, 30); } bx += w * u; });
    x.fillStyle = muted; x.font = `20px ${css('--font-body')}`; x.fillText(`No. ${L.cert}`, bx + 14, ly + 173);
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
async function drawCard() {
  const g = grade(), L = g.L, t = G.state.tally, best = g.best, pct = pctText(g.pct!);
  await fonts(L.title + '欧气卡铺鉴定' + (best ? best.name : ''));
  const art = best ? await loadArt(best) : await loadOne(back()); // no hit yet: the card lies face down
  const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; // 3:4, the phone-feed shape
  const x = c.getContext('2d')!, mi = css('--mat-ink'), mm = css('--mat-muted'), body = css('--font-body'), num = css('--font-tag');
  mat(x, W, H);
  const y = slab(x, W, 48, 580, art, { k: '欧气卡铺 · 欧气鉴定', what: g.what, short: g.short, best: best?.name, price: best ? money(best.price) : '', cert: g.cert, bars: g.bars,
    grade: L.title, gradeF: css('--font-display'), sub: `超过 ${pct}%` });
  // the numbers under the slab, the way a listing states what is in the case
  const cols: [string, string][] = [['开出市值', money(L.value)], ['期望市值', money(L.expected)], ['进货成本', money(L.cost)]];
  cols.forEach(([k, v], i) => {
    const cx = W / 2 + (i - 1) * 300; x.textAlign = 'center';
    x.font = `24px ${body}`; x.fillStyle = mm; x.fillText(k, cx, y + 62);
    x.font = `600 44px ${num}`; x.fillStyle = mi; x.fillText(v, cx, y + 110);
  });
  const hitsLine = [['MHR', '超级金卡'], ['SIR', 'SIR'], ['HR', '金卡'], ['IR', 'IR'], ['UR', 'UR']].filter(([k]) => t[k]).map(([k, n]) => `${n} ×${t[k]}`).join('  ·  ') || '这次没出大货';
  x.font = `26px ${body}`; x.fillStyle = mm; x.fillText(`开了 ${L.packs} 包，总值超过 ${pct}% 的模拟玩家　${hitsLine}`, W / 2, y + 168);
  x.font = `22px ${body}`; x.fillText('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计', W / 2, H - 30);
  return c.toDataURL('image/png');
}

// One pack or one batch, straight from the mat: the best card in a slab, graded by where the pack ranks among packs of its set.
async function drawPack(d: ShareSpec) {
  // bottom half reads from the bottom: a 5th-percentile pack is 后 5%, not a boastful 前 95%
  const top = d.pct >= .995 ? '前 0.5%' : d.pct >= .5 ? `前 ${Math.max(1, Math.round((1 - d.pct) * 100))}%` : `后 ${Math.max(1, Math.round(d.pct * 100))}%`;
  await fonts(top + d.set + d.best.name);
  const art = await loadArt(d.best), W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!, mi = css('--mat-ink'), mm = css('--mat-muted'), body = css('--font-body');
  mat(x, W, H);
  const y = slab(x, W, 48, 580, art, { k: `欧气卡铺 · ${d.set}`, what: d.n > 1 ? `${d.n} 包共开出 ${money(d.value)}` : `这包开出 ${money(d.value)}`,
    best: d.best.name, price: money(d.best.price), ...cert(`${d.set}|${d.n}|${Math.round(d.value * 100)}|${d.best.n}`), grade: top, gradeF: css('--font-tag'), sub: d.n > 1 ? `最好的一包 ${money(d.bestPack)}` : '同系列的包里' });
  const diff = d.value - d.cost;
  x.textAlign = 'center';
  x.font = `30px ${body}`; x.fillStyle = mi; x.fillText(d.rank.length > 30 ? d.rank.slice(0, 30) + '…' : d.rank, W / 2, y + 76);
  x.font = `28px ${body}`; x.fillStyle = diff >= 0 ? css('--mat-gain') : css('--mat-loss');
  x.fillText(`${d.n > 1 ? '共开出' : '开出'} ${money(d.value)} · 进货 ${money(d.cost)} · ${diff >= 0 ? '赚' : '亏'} ${money(Math.abs(diff))}`, W / 2, y + 130);
  x.font = `22px ${body}`; x.fillStyle = mm; x.fillText('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计 · 欧气卡铺', W / 2, H - 30);
  return c.toDataURL('image/png');
}

// A modal with the finished image: on phones long-press saves it, on desktop the buttons do.
async function pop(draw: () => Promise<string>, text: string, file: string) {
  let dlg = document.getElementById('share-pop') as HTMLDialogElement | null;
  if (!dlg) { const el = dlg = document.createElement('dialog'); el.id = 'share-pop'; el.addEventListener('click', e => { if (e.target === el || (e.target as HTMLElement).dataset.close) el.close(); }); document.body.append(el); }
  dlg.innerHTML = '<p class="muted">正在生成…</p>'; dlg.showModal();
  const url = await draw();
  dlg.innerHTML = `<img src="${url}" alt="${text}"><div class="btns"><a class="dl" href="${url}" download="${file}">下载 PNG</a><button type="button" id="pop-copy">复制文字</button><button type="button" class="ghost" data-close="1">关闭</button></div>`;
  $('pop-copy').onclick = e => navigator.clipboard?.writeText(text + ' ' + location.href).then(() => { (e.target as HTMLElement).textContent = '已复制'; });
}
export const showPack = (d: ShareSpec) => pop(() => drawPack(d), `我在欧气卡铺开出了 ${d.best.name}（${money(d.best.price)}），${d.rank}`, 'ouqi-pack.png');
export const showLuck = () => { const L = G.luck(); return pop(drawCard, `我在欧气卡铺开了 ${L.packs} 包，欧气超过 ${pctText(L.pct! * 100)}% 的模拟玩家：${L.title}`, 'ouqi.png'); };
