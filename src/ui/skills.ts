// 技能: cash-bought skill levels (经营 and 幸运), and the 手气 odds next to the official ones.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money, rarLabel } from './common.ts';

const pct = (v: number) => v.toFixed(v >= 10 ? 1 : 2) + '%';

// 官方 / 你现在: every hit rarity of each unlocked set, the measured rate beside the one your packs open with.
function odds() {
  const m = G.luckMult();
  return html`<details><summary>手气：官方概率 / 你现在开包的概率${m > 1 ? `（×${m.toFixed(2)}）` : ''}</summary>
    <p class="muted">官方概率是 TCGplayer 实开统计，不会变；手气只改你开包时用的概率。欧气检测记得每一包是按哪套概率开的，只和同样加成的模拟玩家比，加成开出来的好卡不算你运气好。</p>
    ${SETS.filter(s => G.unlocked(s.id)).map(s => { const eff = S.ratesFor(s, m); return html`<table class="tally"><thead><tr><th>${s.name}</th><th>官方</th><th>你现在</th></tr></thead><tbody>
      ${S.HITS.filter(k => s.rates[k]).map(k => html`<tr><td>${rarLabel(k)}</td><td>${pct(s.rates[k])}</td><td>${m > 1 ? html`<b>${pct(eff[k])}</b>` : pct(eff[k])}</td></tr>`)}</tbody></table>`; })}
  </details>`;
}

export function renderSkills() {
  render(html`<h2 class="eyebrow">技能 · 用现金升级</h2><ul class="ups">${Object.entries(G.SKILLS).map(([k, sk]) => {
    const lv = G.skill(k), cost = G.skillCost(k), ok = G.canLearn(k);
    return html`<li><span class="u-name">${sk.name}<small>${sk.group} · ${sk.desc}。${sk.fx(lv)}${cost == null ? '' : ` → ${sk.fx(lv + 1)}`}</small></span><span class="u-lv">Lv${lv}/${sk.max}</span>
        ${cost == null ? html`<span class="muted">已满级</span>` : html`<button type="button" data-act="learn" data-k="${k}" ?disabled=${!ok || G.state.cash < cost} title="${ok ? '' : '要先雇店员（店铺升级）'}">${money(cost)}</button>`}</li>`;
  })}</ul>${odds()}`, $('skills'));
}
