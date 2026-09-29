// 成长 page, part 2: the 手气 odds next to the official ones, under the 柜台 line of the tree (the 技能 themselves are nodes there, upgrades.ts).
import { html } from 'lit-html';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, rarLabel } from './common.ts';

const pct = (v: number) => v.toFixed(v >= 10 ? 1 : 2) + '%';

// 官方 / 你现在: every hit rarity of each unlocked set, the measured rate beside the one your packs open with.
export function odds() {
  const m = G.luckMult();
  return html`<details><summary>手气：官方概率 / 你现在开包的概率${m > 1 ? `（×${m.toFixed(2)}）` : ''}</summary>
    <p class="muted">官方概率是 TCGplayer 实开统计，不会变；手气只改你开包时用的概率。欧气检测记得每一包是按哪套概率开的，只和同样加成的模拟玩家比，加成开出来的好卡不算你运气好。</p>
    ${SETS.filter(s => G.unlocked(s.id)).map(s => { const eff = S.ratesFor(s, m); return html`<table class="tally"><thead><tr><th>${s.name}</th><th>官方</th><th>你现在</th></tr></thead><tbody>
      ${S.HITS.filter(k => s.rates[k]).map(k => html`<tr><td>${rarLabel(k)}</td><td>${pct(s.rates[k])}</td><td>${m > 1 ? html`<b>${pct(eff[k])}</b>` : pct(eff[k])}</td></tr>`)}</tbody></table>`; })}
  </details>`;
}

