// 欧气检测: percentile among simulated players, meter, per-rarity tally with exact tail odds.
import { html, render } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money, RAR, rarLabel } from './common.ts';

const BANDS: [number, number, string][] = [[0, 10, '非酋'], [10, 30, '小非'], [30, 70, '平民'], [70, 90, '小欧'], [90, 99, '欧洲人'], [99, 100, '欧皇']];
// Exact binomial tail for one rarity: how likely a player is to be at least this lucky (or unlucky).
function tailLabel(k: string, got: number, exp: number) {
  const p = S.hitTail(G.state.packsBy, k, got), pct = p * 100;
  return `${got >= exp ? '≥' : '≤'}${got} 的概率 ${pct < 0.1 ? '<0.1' : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}
export function renderLuck() {
  const L = G.luck(), e = G.expectedTally(), t = G.state.tally;
  const pct = L.pct == null ? null : L.pct * 100;
  const rows = ['RR', 'ACE', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR', 'MHR'].filter(k => e[k] > 0 || t[k]);
  render(html`<h2 class="eyebrow" id="luck-h">欧气检测</h2>
      <p class="verdict ${pct == null ? '' : pct >= 70 ? 'lucky' : pct < 30 ? 'unlucky' : ''}">${L.title}</p>
      <p class="verdict-sub">${pct == null ? '开几包就能测。拿你开出的总市值，和同样开了这些包的几千个模拟玩家比（每个系列先抽 6 万包建分布）。'
        : html`开了 ${L.packs} 包，开出总值超过 <b>${pct.toFixed(0)}%</b> 的模拟玩家。总市值被少数几张大卡左右，误差约 ±1–3 个百分点。${L.boosted ? `其中 ${L.boosted} 包开的时候有手气加成，它们只和同样加成的模拟玩家比。` : ''}`}</p>
      <div class="meter" role="img" aria-label="欧气百分位 ${pct == null ? '未测' : pct.toFixed(1)}">
        ${BANDS.map(([a, b, n]) => html`<span style="flex:${b - a}" title="${n} ${a}–${b}%"></span>`)}
        ${pct == null ? '' : html`<i style="left:${pct}%"></i>`}
      </div>
      <div class="meter-labels">${BANDS.map(([a, b, n]) => html`<span style="flex:${Math.max(b - a, 8)}">${n}</span>`)}</div>
      ${L.packs ? html`<dl class="kv">
        <div><dt>开出市值</dt><dd>${money(L.value)}</dd></div>
        <div><dt>期望市值</dt><dd>${money(L.expected)}<small class="dd-note">整包标价的 ${Math.round(L.expected / L.listEV * 100)}%</small></dd></div>
        <div><dt>进货成本</dt><dd>${money(L.cost)}</dd></div></dl>
      <p class="muted basis-note">开出市值按 TCGplayer <b>现在</b>的单卡市价重算，和模拟玩家同一口径${L.live ? '' : '（旧存档：早期开的包只能按开包当时的价格）'}。期望只有整包标价的 ${Math.round(L.expected / L.listEV * 100)}%，是因为标价里有密封溢价，见页脚「价格口径」。</p>
      <table class="tally"><thead><tr><th>稀有度</th><th>开出</th><th>期望</th><th title="按你开每一包时的概率（官方概率，有手气时是加成后的），开到这么多或更多（更少）的概率">概率</th></tr></thead><tbody>
        ${rows.map(k => html`<tr class="${(t[k] || 0) >= (e[k] || 0) ? 'up' : ''}"><td><span class="glyph">${RAR[k].g}</span>${rarLabel(k)}</td><td>${t[k] || 0}</td><td>${(e[k] || 0).toFixed(1)}</td><td>${tailLabel(k, t[k] || 0, e[k] || 0)}</td></tr>`)}
      </tbody></table>` : ''}`, $('luck'));
}
