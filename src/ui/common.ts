// What every panel shares: the one game instance, DOM lookup, money format, card art URLs, rarity labels.
// Panels only read G.state and call G's methods, never mutate state directly.
import { createGame } from '../game.ts';
import { html, nothing } from 'lit-html';
import { card, logo } from '../assets.ts';
import { SETS } from '../sets.ts';

// Dev-only shop clock (`npm run dev`; the build and the pen use Date.now as is): reviewers and the maintainer can run the shop faster
// or jump over a wait instead of sitting it out in real minutes. `?speed=4` in the URL, or from the console / a test driver:
// __dev.speed(n) (n× wall clock from now), __dev.skip(sec) (trades sec seconds at once, in steps short enough not to count as
// 离开), __dev.now(). Every UI comparison against a game timestamp uses G.now(), so a fast clock stays consistent on screen.
const DEV = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;
let devBase = Date.now(), devAt = devBase, devSpeed = DEV ? Math.max(1, +(new URLSearchParams(location.search).get('speed') || 1)) : 1;
const devClock = () => devAt + (Date.now() - devBase) * devSpeed;
export const G = createGame(DEV ? { now: devClock } : {});
if (DEV) (window as unknown as { __dev: unknown }).__dev = {
  now: () => G.now(),
  speed(n: number) { devAt = devClock(); devBase = Date.now(); devSpeed = Math.max(0, n); return devSpeed; },
  skip(sec: number) { for (let t = 0; t < sec; t += 10) { devAt += Math.min(10, sec - t) * 1000; G.tick(G.revealing()); } return G.now(); },
};
export const $ = (id: string) => document.getElementById(id)!;
// Big sums shorten: $123.4K from $100,000, $1.23M from a million (the debt, late revenue); below that, whole dollars from $1,000.
// Quotes use cents even above $1,000; overview readouts retain the compact format.
const exactMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: number, mode?: 'exact'): string => v < 0 ? '−' + money(-v, mode) : '$' + (mode === 'exact' ? exactMoney.format(v) : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e5 ? `${(v / 1e3).toFixed(1)}K` : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
export const imgUrl = (c: { set: string; n: string }, size = 'low') => card(c.set, c.n, size);
export const logoUrl = (id: string) => logo(id);
// The BW status bar (DESIGN.md「状态条」): the dark plate of a battle box with the fill on a pale track. EXP (the default) is
// progress toward something — a level, an unlock, a price; HP is what the till has against what is owed, coloured by what is left
// (over half, over a fifth, below). k names the bar on its plate (HP / EXP); a bar inside a sentence goes without it.
export function bar(p: number, label: string, o: { hp?: boolean; k?: string } = {}) {
  const v = Math.max(0, Math.min(1, p || 0));
  return html`<span class="bar${o.hp ? ' hp' : ''}" data-k=${o.k ?? nothing} data-hp=${o.hp ? (v > .5 ? 'hi' : v > .2 ? 'mid' : 'lo') : nothing} role="img" aria-label=${label}><i style="--p:${v}"></i></span>`;
}

// Rarity names, always written in Chinese in text (the printed symbols are card.ts mark()); `jp` is the name Chinese/Japanese players use for the same tier.
// t = tier (0 bulk … 5 SIR/HR/MHR) for flip time, sound and glow.
export const RAR: Record<string, { zh: string; jp?: string; t: number }> = {
  E: { zh: '基础能量', t: 0 }, FE: { zh: '闪能量', t: 2 },
  C: { zh: '普通', t: 0 }, U: { zh: '非普通', t: 0 }, R: { zh: '稀有', t: 1 },
  REV: { zh: '反闪', t: 1 }, RR: { zh: '双稀有', t: 2 }, ACE: { zh: 'ACE SPEC', t: 2 },
  PB: { zh: '精灵球闪', t: 2 }, UR: { zh: '超稀有', jp: 'SR', t: 3 },
  IR: { zh: '插画稀有', jp: 'AR', t: 4 }, MB: { zh: '大师球闪', t: 4 },
  SIR: { zh: '特殊插画', jp: 'SAR', t: 5 }, HR: { zh: '金卡', jp: 'UR', t: 5 },
  MHR: { zh: '超级金卡', jp: 'MUR', t: 5 }, // Mega Evolution series: replaces HR
};
export const rar = (c: { kind: string; r: string }) => RAR[c.kind] || RAR[c.r] || RAR.C;
export const rarLabel = (k: string) => { const r = RAR[k]; return r.jp ? `${r.zh}（${r.jp}）` : r.zh; };
// Names only, for a line that would otherwise print codes: rarNames(['RR', 'ACE', 'PB']) → 双稀有/ACE SPEC/精灵球闪.
export const rarNames = (ks: readonly string[]) => ks.map(k => RAR[k]?.zh ?? k).join('/');

// 上架 from a set row's key (refillQuote) and the sold-out box keeps 1 pack in the back room, so a new player who shelves a fresh box can
// still open one. The count is what will actually move (the set's shelves, or one empty shelf, hold so many).
export function toShelf(id: string) {
  const own = G.shelves().filter(r => r.id === id), room = own.length ? own.reduce((a, r) => a + G.depth() - r.qty, 0) : G.depth();
  const st = G.state.stock[id] || 0;
  return Math.min(room, st > 1 ? st - 1 : st);
}
// The 顾客 / 没买到 window's name: the last MISS_WINDOW, or 开店以来 while every walk-in so far still falls inside it (a new shop
// 1 minute in has not had 10 minutes of customers).
export const lately = () => (G.state.cust.visits <= G.state.recent.length ? '开店以来' : `${G.MISS_WINDOW / 60} 分钟里`);
// The batch button: with 2–9 packs in the back room and cash for the rest, it tops up to 10 first — only a batch of exactly 10 is
// a 十连 (the achievement and the 十连 stats count those), and a player reading 「开 9 包」 takes it for one.
export function batchBtn(id: string, again = false) {
  const n = G.state.stock[id] || 0, fill = n > 1 && n < 10 && G.state.cash >= G.wholesale(id) * (10 - n) ? 10 - n : 0;
  return { act: fill ? 'fill10' : 'open10', text: fill ? `补 ${fill} 包，开十连` : `${again ? '再开' : '开'} ${Math.min(10, n)} 包` };
}
// 进满: as many packs as the back room has room for and the cash covers (late in the game a shelf sells out in a minute or two,
// and the clerk carries the back room onto the shelves between rounds, so one press stands for twenty 进 10).
export function restock(id: string) {
  const room = G.WAREHOUSE - (G.state.stock[id] || 0), n = Math.max(0, Math.min(room, Math.floor(G.state.cash / G.wholesale(id))));
  return { n, text: `${n === room ? '进满' : '进'} ${n}`, title: `进 ${n} 包 ${money(n * G.wholesale(id), 'exact')}${n < room ? `（仓库还能放 ${room}，钱只够这些）` : '，仓库放满'}` };
}
// 补到满's gap (the older name was 进一架): what fills this set's shelves (one empty shelf when it has none yet) plus the one pack 上架 keeps back for the player to open,
// less what the back room already holds; capped by the cash. The guide's first buy and the usual restock (DESIGN.md「引导」): ten packs
// sold out in about half a minute, a shelf of forty sells for minutes. n 0 when the back room already covers the shelf.
export function shelfFill(id: string) {
  const own = G.shelves().filter(r => r.id === id), room = own.length ? own.reduce((a, r) => a + G.depth() - r.qty, 0) : G.depth();
  const want = Math.max(0, Math.min(room + 1 - (G.state.stock[id] || 0), G.WAREHOUSE - (G.state.stock[id] || 0)));
  const n = Math.min(want, Math.floor(G.state.cash / G.wholesale(id)));
  return { n, full: n === want, text: `进 ${n} 包`, title: `进 ${n} 包 ${money(n * G.wholesale(id), 'exact')}，数量按货架缺口、仓库空间和现金计算` };
}
// The sold-out box's quote once a clerk is hired: the shelf's worth (shelfFill) plus as much more for the back room as the 闲钱 covers,
// up to its room. The clerk carries the back room onto the shelf between rounds, so one press lasts many sell-outs instead of one
// (a reviewer pressed restock ~14 times in minutes 30→60). Capped by 闲钱, not cash: it never eats the bill or the next 下一步 money set aside.
export function deepFill(id: string) {
  const f = shelfFill(id), w = G.wholesale(id), stock = G.state.stock[id] || 0;
  if (!G.lvl('clerk') || !G.state.auto[id] || f.n <= 1) return f;
  const n = Math.min(G.WAREHOUSE - stock, f.n + Math.max(0, Math.floor((G.spare() - f.n * w) / w)));
  return n <= f.n ? f : { n, full: f.full, text: `进 ${n} 包`, title: `进 ${n} 包 ${money(n * w, 'exact')}：一架的量，加上闲钱够的仓库存货，店员会接着搬上架` };
}
// 补到满: the one key of a set's row on 货架 (shelf.ts), the same quote as the sold-out box (notice.ts fix): from the back room when it holds
// more than the 1 pack 上架 keeps back (上架 N 包, free), else buy the shelf's gap and shelve it in the same press (events.ts 'refill'; with a
// clerk on the set, deepFill's bigger quote). ok false: the key is off, and text/title say why — no empty shelf for a set on none, the shelf is
// already full, or the cash does not reach 2 packs. A partial fill (cash short) says how many, not 「到满」.
export interface Quote { act: 'refill' | 'shelve'; n: number; cost: number; ok: boolean; text: string; title: string }
export function refillQuote(id: string, alone = true): Quote {
  const s = G.state, w = G.wholesale(id), stock = s.stock[id] || 0, racks = G.shelves(), own = racks.filter(r => r.id === id).length;
  if (!own && !racks.some(r => !r.id)) return { act: 'refill', n: 0, cost: 0, ok: false, text: '补到满', title: '没有空货架：在「更多」里给它换一个货架，或到成长里加一个货架' };
  const up = toShelf(id);
  if (stock > 1 && up) return { act: 'shelve', n: up, cost: 0, ok: true, text: `上架 ${up} 包`, title: `从仓库上架 ${up} 包，不另进货；仓库留 1 包自己拆` };
  const f = alone ? deepFill(id) : shelfFill(id);
  if (f.n > 1) {
    const cost = f.n * w;
    return { act: 'refill', n: f.n, cost, ok: true, text: `${f.full ? '补到满' : `补 ${f.n} 包`} ${money(cost, 'exact')}`,
      title: `进 ${f.n} 包 ${money(cost, 'exact')} 并上架，仓库留 1 包自己拆${f.full ? '' : '；现金只够这些'}` };
  }
  const full = !!own && G.shelfQty(id) >= own * G.depth();
  return { act: 'refill', n: 0, cost: 0, ok: false, text: full ? '货架已满' : '补到满', title: full ? '这个系列的货架已经满了' : '现金不够进 2 包' };
}
// A set customers keep asking for that is on no shelf, while every shelf is taken: the shelf whose set sold to the fewest buyers
// in the same window says so and offers the swap (G.place). Only when more came for the missing set than bought from that shelf,
// so a busy shop doesn't nag. Said in the missing set's row (shelf.ts) and under the 找卡的 table (goals.ts).
export function swapHint(): { i: number; id: string; miss: number; buyers: number } | null {
  const racks = G.shelves(); if (racks.some(r => !r.id)) return null;
  const want = SETS.filter(x => G.unlocked(x.id) && !racks.some(r => r.id === x.id)).map(x => ({ id: x.id, miss: G.missed(x.id) })).sort((a, b) => b.miss - a.miss)[0];
  if (!want?.miss) return null;
  const since = G.now() - G.MISS_WINDOW * 1000, buyers = (id: string) => G.state.recent.filter(v => v.at > since && v.r === 'sold' && v.set === id && v.n && !v.card && v.t !== 'seeker').length / racks.filter(r => r.id === id).length;
  const idle = racks.map((r, i) => ({ i, b: buyers(r.id!) })).sort((a, b) => a.b - b.b)[0];
  return want.miss > idle.b ? { i: idle.i, id: want.id, miss: want.miss, buyers: Math.round(idle.b) } : null;
}
