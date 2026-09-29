// What every panel shares: the one game instance, DOM lookup, money format, card art URLs, rarity labels.
// Panels only read G.state and call G's methods, never mutate state directly.
import { createGame } from '../game.ts';
import { html } from 'lit-html';
import { card, logo } from '../assets.ts';

export const G = createGame();
export const $ = (id: string) => document.getElementById(id)!;
export const money = (v: number) => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
export const imgUrl = (c: { set: string; n: string }, size = 'low') => card(c.set, c.n, size);
export const logoUrl = (id: string) => logo(id);
// Level as a row of pips (成长 tab): filled up to lv, one per level.
export const pips = (lv: number, max: number) => html`<span class="u-lv" role="img" aria-label="Lv${lv}/${max}">${Array.from({ length: max }, (_, i) => html`<i class=${i < lv ? 'on' : ''}></i>`)}</span>`;

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
export const shelveLabel = (id: string, racked: boolean) => { const n = toShelf(id); return `${racked ? '上架' : '摆上空货架'}${n ? ` ${n} 包` : ''}`; };
