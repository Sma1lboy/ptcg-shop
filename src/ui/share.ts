// Share images: the luck card (#share panel, built once then patched, so it stays imperative) and the per-pack poster
// in a <dialog>. Both are drawn on a canvas with the page's own tokens.
import { card } from '../assets.ts';
import { G, $, money } from './common.ts';
import { opened } from './guide.ts';
import type { ShareSpec } from './mat.ts';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- card art for share images ----------
// Local mirror art is same-origin; the CDN fallback (file://, CodePen) needs a CORS-mode load to keep the canvas exportable.
const loadOne = (url: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); setTimeout(() => res(null), 5000); i.src = url; });
async function loadArt(c: { set: string; n: string }) {
  for (const size of ['high', 'low']) { const i = await loadOne(card(c.set, c.n, size)); if (i) return i; }
  return null;
}
const roundRect = (x: CanvasRenderingContext2D, px: number, y: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(px, y, w, h, r); };
function drawArt(x: CanvasRenderingContext2D, img: HTMLImageElement | null, px: number, py: number, w: number, name?: string) { // card art with a soft shadow; a plain frame with the card name when the image can't load (offline)
  const h = img ? w * img.height / img.width : w * 1.4;
  if (!img) {
    roundRect(x, px, py, w, h, w * .046); x.fillStyle = 'rgba(255,255,255,.06)'; x.fill(); x.strokeStyle = css('--mat-gold'); x.lineWidth = 3; x.stroke();
    x.fillStyle = css('--mat-muted'); x.textAlign = 'center'; x.font = `${Math.round(w / 12)}px ${css('--font-body')}`;
    (name ? nameLines(name, 18) : []).forEach((l, i) => x.fillText(l, px + w / 2, py + h / 2 + i * w / 10));
    return h;
  }
  x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 40; x.shadowOffsetY = 16; roundRect(x, px, py, w, h, w * .046); x.fillStyle = '#000'; x.fill(); x.restore();
  x.save(); roundRect(x, px, py, w, h, w * .046); x.clip(); x.drawImage(img, px, py, w, h); x.restore();
  return h;
}

// ---------- share card ----------
let img = '', shownAt = -1;
async function drawCard() {
  await (document.fonts && document.fonts.ready);
  const L = G.luck(), t = G.state.tally, best = G.state.hits[0];
  const art = best ? await loadArt(best) : null;
  const W = 1080, H = 1330, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!, pct = L.pct! * 100;
  const ink = css('--ink'), muted = css('--muted'), line = css('--line');
  const tone = pct >= 70 ? css('--gold') : pct < 30 ? css('--loss') : ink;
  const disp = css('--font-display'), num = css('--font-tag'), body = css('--font-body');
  x.fillStyle = css('--panel'); x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  const T = (s: string, px: number, y: number, o: { w?: number; f?: string; c?: string; a?: CanvasTextAlign } = {}) => { x.font = `${o.w || 400} ${px}px ${o.f || body}`; x.fillStyle = o.c || ink; x.textAlign = o.a || 'left'; x.fillText(s, o.a === 'right' ? W - 80 : 80, y); };
  T('欧气卡铺 · 欧气检测', 34, 110, { c: muted });
  T(L.title, 200, 340, { f: disp, c: tone });
  T(`开了 ${L.packs} 包，总值超过 ${pct.toFixed(0)}% 的模拟玩家`, 38, 420);
  // meter: same six bands as the on-page detector
  const bands: [number, number, string][] = [[0, 10, css('--loss')], [10, 30, `color-mix(in oklab, ${css('--loss')} 45%, ${line})`], [30, 70, line], [70, 90, `color-mix(in oklab, ${css('--gold')} 45%, ${line})`], [90, 100, css('--gold')]];
  const mx = 80, mw = W - 160, my = 480;
  bands.forEach(([a, b, col]) => { x.fillStyle = col; x.fillRect(mx + mw * a / 100 + 1, my, mw * (b - a) / 100 - 2, 24); });
  x.fillStyle = ink; x.fillRect(mx + mw * pct / 100 - 4, my - 12, 8, 48);
  ([['非酋', 0], ['平民', 50], ['欧皇', 100]] as const).forEach(([s, p]) => { x.font = `26px ${body}`; x.fillStyle = muted; x.textAlign = p === 0 ? 'left' : p === 100 ? 'right' : 'center'; x.fillText(s, mx + mw * p / 100, my + 72); });
  [['开出市值', money(L.value)], ['期望市值', money(L.expected)], ['进货成本', money(L.cost)]].forEach(([k, v], i) => {
    x.textAlign = 'left'; x.font = `28px ${body}`; x.fillStyle = muted; x.fillText(k, 80 + i * 320, 660);
    x.font = `600 46px ${num}`; x.fillStyle = ink; x.fillText(v, 80 + i * 320, 720);
  });
  const hitsLine = [['MHR', '超级金卡'], ['SIR', 'SIR'], ['HR', '金卡'], ['IR', 'IR'], ['UR', 'UR']].filter(([k]) => t[k]).map(([k, n]) => `${n} ×${t[k]}`).join('  ') || '这次没出大货';
  x.fillStyle = line; x.fillRect(80, 780, W - 160, 2);
  drawArt(x, art, 700, 830, 300, best && best.name);
  const wrap = art ? 30 : 60; // art takes the right column, so long card names break earlier
  if (best) { T('开出过最贵的', 28, 850, { c: muted }); nameLines(best.name, wrap).forEach((l, i) => T(l, 40, 905 + i * 52)); T(money(best.price), 56, 1040 + (nameLines(best.name, wrap).length - 1) * 52, { f: num, w: 600, c: css('--gold') }); }
  T(hitsLine, 30, 1200, { c: muted });
  T('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计', 26, 1285, { c: muted });
  return c.toDataURL('image/png');
}

// Chinese/English mixed names have no spaces to break on: split by character count.
const nameLines = (name: string, n: number) => name.match(new RegExp(`.{1,${n}}`, 'g')) || [name];

// One pack or one batch, straight from the mat: the best card is the poster.
async function drawPack(d: ShareSpec) {
  await (document.fonts && document.fonts.ready);
  const art = await loadArt(d.best), W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!, ink = css('--ink'), gold = css('--mat-gold'), loss = css('--mat-loss'), gain = css('--mat-gain');
  const num = css('--font-tag'), body = css('--font-body');
  const T = (s: string, px: number, y: number, o: { w?: number; f?: string; c?: string; a?: CanvasTextAlign } = {}) => { x.font = `${o.w || 400} ${px}px ${o.f || body}`; x.fillStyle = o.c || ink; x.textAlign = o.a || 'left'; x.fillText(s, o.a === 'right' ? W - 80 : o.a === 'center' ? W / 2 : 80, y); };
  x.fillStyle = css('--mat'); x.fillRect(0, 0, W, H); // same dark playmat as the page, both themes
  const g = x.createRadialGradient(W / 2, 560, 60, W / 2, 560, 720); g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const mi = css('--mat-ink'), mm = css('--mat-muted');
  T(`欧气卡铺 · ${d.set}${d.n > 1 ? ` × ${d.n} 包` : ''}`, 34, 100, { c: mm });
  const aw = 470, ay = 150 + drawArt(x, art, (W - aw) / 2, 150, aw, d.best.name);
  T(d.best.name, 46, ay + 80, { a: 'center', c: mi });
  T(money(d.best.price), 92, ay + 180, { a: 'center', f: num, w: 600, c: gold });
  T(d.n > 1 ? `最好的一包 ${money(d.bestPack)} · ${d.rank}` : d.rank, d.rank.length > 26 ? 32 : 38, ay + 250, { a: 'center', c: mi });
  const diff = d.value - d.cost;
  T(`${d.n > 1 ? '共开出' : '开出'} ${money(d.value)} · 进货 ${money(d.cost)} · ${diff >= 0 ? '赚' : '亏'} ${money(Math.abs(diff))}`, 30, ay + 310, { a: 'center', c: diff >= 0 ? gain : loss });
  T('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计 · 欧气卡铺', 24, H - 44, { a: 'center', c: mm });
  return c.toDataURL('image/png');
}

// A modal with the finished image: on phones long-press saves it, on desktop the buttons do.
export async function showPack(d: ShareSpec) {
  let dlg = document.getElementById('share-pop') as HTMLDialogElement | null;
  if (!dlg) { const el = dlg = document.createElement('dialog'); el.id = 'share-pop'; el.addEventListener('click', e => { if (e.target === el || (e.target as HTMLElement).dataset.close) el.close(); }); document.body.append(el); }
  dlg.innerHTML = '<p class="muted">正在生成…</p>'; dlg.showModal();
  const url = await drawPack(d), text = `我在欧气卡铺开出了 ${d.best.name}（${money(d.best.price)}），${d.rank}`;
  dlg.innerHTML = `<img src="${url}" alt="${text}"><div class="btns"><a class="dl" href="${url}" download="ouqi-pack.png">下载 PNG</a><button type="button" id="pop-copy">复制文字</button><button type="button" class="ghost" data-close="1">关闭</button></div>`;
  $('pop-copy').onclick = e => navigator.clipboard?.writeText(text + ' ' + location.href).then(() => { (e.target as HTMLElement).textContent = '已复制'; });
}

export async function renderShare() {
  const el = $('share'), n = opened();
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  if (!el.firstChild) {
    el.innerHTML = `<h2>分享欧气</h2><button type="button" id="make-card">生成分享图</button><div id="card-out"></div>`;
    $('make-card').onclick = async () => {
      shownAt = opened(); img = await drawCard();
      const text = `我在欧气卡铺开了 ${G.luck().packs} 包，欧气排在 ${(G.luck().pct! * 100).toFixed(0)}%：${G.luck().title}`;
      $('card-out').innerHTML = `<img src="${img}" alt="${text}"><div class="btns"><a class="dl" href="${img}" download="ouqi.png">下载 PNG</a><button type="button" id="copy-text">复制文字</button></div>`;
      $('copy-text').onclick = e => navigator.clipboard?.writeText(text + ' ' + location.href).then(() => { (e.target as HTMLElement).textContent = '已复制'; });
    };
  }
  // a card from fewer packs than now is stale
  if (shownAt !== -1 && shownAt !== n) { $('card-out').innerHTML = ''; shownAt = -1; }
}
