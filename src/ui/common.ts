// What every panel shares: the one game instance, DOM lookup, money format, card art URLs, rarity labels.
// Panels only read G.state and call G's methods, never mutate state directly.
import { createGame } from '../game.ts';
import { html, nothing } from 'lit-html';
import { card, logo } from '../assets.ts';

export const G = createGame();
export const $ = (id: string) => document.getElementById(id)!;
// Big sums shorten: $123.4K from $100,000, $1.23M from a million (the debt, late revenue); below that, whole dollars from $1,000.
export const money = (v: number): string => v < 0 ? '−' + money(-v) : '$' + (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e5 ? `${(v / 1e3).toFixed(1)}K` : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
export const imgUrl = (c: { set: string; n: string }, size = 'low') => card(c.set, c.n, size);
export const logoUrl = (id: string) => logo(id);
// The BW status bar (DESIGN.md「状态条」): the dark plate of a battle box with the fill on a pale track. EXP (the default) is
// progress toward something — a level, an unlock, a price; HP is what the till has against what is owed, coloured by what is left
// (over half, over a fifth, below). k names the bar on its plate (HP / EXP); a bar inside a sentence goes without it.
export function bar(p: number, label: string, o: { hp?: boolean; k?: string } = {}) {
  const v = Math.max(0, Math.min(1, p || 0));
  return html`<span class="bar${o.hp ? ' hp' : ''}" data-k=${o.k ?? nothing} data-hp=${o.hp ? (v > .5 ? 'hi' : v > .2 ? 'mid' : 'lo') : nothing} role="img" aria-label=${label}><i style="--p:${v}"></i></span>`;
}

// Rarity names; `jp` is the name Chinese/Japanese players use. t = tier (0 bulk … 5 SIR/HR/MHR) for flip time, sound and glow. The printed symbols are card.ts mark().
export const RAR: Record<string, { zh: string; jp?: string; t: number }> = {
  E: { zh: '基础能量', t: 0 }, FE: { zh: '闪能量', t: 2 },
  C: { zh: '普通', t: 0 }, U: { zh: '非普通', t: 0 }, R: { zh: '稀有', t: 1 },
  REV: { zh: '反闪', t: 1 }, RR: { zh: '双稀有 RR', t: 2 }, ACE: { zh: 'ACE SPEC', t: 2 },
  PB: { zh: '精灵球闪', t: 2 }, UR: { zh: '超稀有 UR', jp: 'SR', t: 3 },
  IR: { zh: '插画稀有 IR', jp: 'AR', t: 4 }, MB: { zh: '大师球闪', t: 4 },
  SIR: { zh: '特殊插画 SIR', jp: 'SAR', t: 5 }, HR: { zh: '金卡 HR', jp: 'UR', t: 5 },
  MHR: { zh: '超级金卡 MHR', jp: 'MUR', t: 5 }, // Mega Evolution series: replaces HR
};
export const rar = (c: { kind: string; r: string }) => RAR[c.kind] || RAR[c.r] || RAR.C;
export const rarLabel = (k: string) => { const r = RAR[k]; return r.jp ? `${r.zh}（${r.jp}）` : r.zh; };

// 上架 from the set table and the 顾客 panel keeps 1 pack in the back room, so a new player who shelves a fresh box can still open
// one; the shelf's own 补满 moves them all. The count is what will actually move (the set's shelves, or one empty shelf, hold so many).
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
  return { n, text: `${n === room ? '进满' : '进'} ${n}`, title: `进 ${n} 包 ${money(n * G.wholesale(id))}${n < room ? `（仓库还能放 ${room}，钱只够这些）` : '，仓库放满'}` };
}
export const shelveLabel = (id: string, racked: boolean) => { const n = toShelf(id); return `${racked ? '上架' : '摆上空货架'}${n ? ` ${n} 包` : ''}`; };
