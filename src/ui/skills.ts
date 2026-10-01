// 手气, shown in two places that must agree: the 成长 page (the 手气 node and, under it, the odds table here) and the 开包 rail
// (rail.ts). Two names, used the same everywhere: 基础概率 = the TCGplayer measured rate; 游戏加成 = what the
// skill 手气 (game.ts) multiplies it by when YOU open a pack. Everything below is read from G; nothing here is a number of its own.
import { html } from 'lit-html';
import { SETS, type SetConf } from '../sets.ts';
import * as S from '../sim.ts';
import { G, rarLabel } from './common.ts';
export const pct = (v: number) => v.toFixed(v >= 10 ? 1 : 2) + '%';
const x = (m: number) => `×${m.toFixed(2)}`;

// Where 手气 stands: level / cap (the cap counts 名气「手气底子」), the multiplier now, and what the next level costs and gives.
// cost is undefined at the cap, as game.ts skillCost is.
export function luckNow() {
  const lv = G.skill('luck'), max = G.skillMax('luck'), cost = G.skillCost('luck'), perk = G.perk('luck');
  return { lv, max, cost, perk, perkMax: G.PERKS.luck.max, m: G.luckMult(), next: cost == null ? undefined : S.roundM(1 + G.SKILLS.luck.step * (lv + 1)) };
}

// The rarest hit a set has a measured rate for (by card rank, then by the smaller rate): the one the player is hoping for.
export const rarest = (s: SetConf) => S.HITS.filter(k => s.rates[k]).sort((a, b) => S.RANK[b] - S.RANK[a] || s.rates[a] - s.rates[b])[0];

// A level just landing. The 1.2 s stamp on the node (upgrades.ts popped) is gone before it can be read, so the level-up also
// leaves a line that stays for LUCK_NOTE_MS, in the node, the header and the rail. Read-only for callers: both panels ask for the
// same note on their own render and neither consumes it. The first look sets the baseline (a loaded save is not a level-up);
// a lower level (清空存档, 开分店, 破产) drops the note.
const LUCK_NOTE_MS = 10000;
export interface LuckNote { from: number; to: number; m0: number; m1: number; at: number }
let seen: { lv: number; m: number } | undefined, note: LuckNote | undefined;
export function luckUp(): LuckNote | undefined {
  const lv = G.skill('luck'), m = G.luckMult(), now = performance.now();
  if (seen && lv > seen.lv) { note = { from: seen.lv, to: lv, m0: seen.m, m1: m, at: now }; setTimeout(() => document.dispatchEvent(new Event('ptcg:luck')), LUCK_NOTE_MS + 50); }
  else if (seen && lv < seen.lv) note = undefined;
  seen = { lv, m };
  return note && now - note.at < LUCK_NOTE_MS ? note : undefined;
}
export const luckUpText = (n: LuckNote) => `手气 Lv ${n.to}：游戏加成 ${x(n.m0)} → ${x(n.m1)}，下一包起生效`;

// 实测基础 / 游戏加成后: each unlocked set's hit rates beside the rates used for the player's packs.
export function odds() {
  const L = luckNow(), m = L.m;
  return html`<details><summary>手气 Lv ${L.lv}/${L.max}：基础概率 / 游戏加成后的概率${m > 1 ? `（${x(m)}）` : '（还没有加成）'}</summary>
    <p class="muted">基础概率来自 TCGplayer 实开统计。手气给闪卡概率乘同一个游戏系数（Lv ${L.lv} 为 ${x(m)}），只用于你自己开的包。欧气检测按每包实际使用的概率比较，不把技能加成当作额外好运。</p>
    ${SETS.filter(s => G.unlocked(s.id)).map(s => { const eff = S.ratesFor(s, m); return html`<table class="tally"><thead><tr><th>${s.name}</th><th>实测基础</th><th>游戏加成后</th></tr></thead><tbody>
      ${S.HITS.filter(k => s.rates[k]).map(k => html`<tr><td>${rarLabel(k)}</td><td>${pct(s.rates[k])}</td><td>${m > 1 ? html`<b>${pct(eff[k])}</b>` : pct(eff[k])}</td></tr>`)}</tbody></table>`; })}
  </details>`;
}
