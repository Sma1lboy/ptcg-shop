// What every panel shares: the one game instance, DOM lookup, money format, card art URLs, rarity labels.
// Panels only read G.state and call G's methods, never mutate state directly.
import { createGame } from '../game.ts';
import { card, logo } from '../assets.ts';

export const G = createGame();
export const $ = (id: string) => document.getElementById(id)!;
export const money = (v: number) => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
export const imgUrl = (c: { set: string; n: string }, size = 'low') => card(c.set, c.n, size);
export const logoUrl = (id: string) => logo(id);

// Rarity symbols as printed on SV cards; `jp` is the name Chinese/Japanese players use. t = tier (0 bulk … 5 SIR/HR/MHR) for flip time, sound and glow.
export const RAR: Record<string, { g: string; zh: string; jp?: string; t: number }> = {
  E: { g: '', zh: '基础能量', t: 0 }, FE: { g: '', zh: '闪能量', t: 2 },
  C: { g: '●', zh: '普通', t: 0 }, U: { g: '◆', zh: '非普通', t: 0 }, R: { g: '★', zh: '稀有', t: 1 },
  REV: { g: '', zh: '反闪', t: 1 }, RR: { g: '★★', zh: '双稀有 RR', t: 2 }, ACE: { g: 'ACE', zh: 'ACE SPEC', t: 2 },
  PB: { g: '◓', zh: '精灵球闪', t: 2 }, UR: { g: '★★', zh: '超稀有 UR', jp: 'SR', t: 3 },
  IR: { g: '★', zh: '插画稀有 IR', jp: 'AR', t: 4 }, MB: { g: '◓', zh: '大师球闪', t: 4 },
  SIR: { g: '★★', zh: '特殊插画 SIR', jp: 'SAR', t: 5 }, HR: { g: '★★★', zh: '金卡 HR', jp: 'UR', t: 5 },
  MHR: { g: '✦', zh: '超级金卡 MHR', jp: 'MUR', t: 5 }, // Mega Evolution series: four-pointed star, replaces HR
};
export const rar = (c: { kind: string; r: string }) => RAR[c.kind] || RAR[c.r] || RAR.C;
export const rarLabel = (k: string) => { const r = RAR[k]; return r.jp ? `${r.zh}（${r.jp}）` : r.zh; };
