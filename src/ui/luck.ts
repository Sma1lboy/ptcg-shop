// 欧气检测: the verdict as a grading label, percentile among simulated players, meter, per-rarity tally with exact tail odds.
import { html, render, svg } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money, RAR, rarLabel } from './common.ts';
import { grade, pctText, type Grade } from './share.ts';

const BANDS: [number, number, string][] = [[0, 10, '非酋'], [10, 30, '小非'], [30, 70, '平民'], [70, 90, '小欧'], [90, 99, '欧洲人'], [99, 100, '欧皇']];
function barcode(b: number[]) {
  let x = 0;
  const rects = b.map((w, i) => { const r = i % 2 ? null : svg`<rect x=${x} width=${w} height="1"></rect>`; x += w; return r; });
  return html`<svg class="g-bar" viewBox="0 0 ${x} 1" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

function label(g: Grade) {
  if (g.pct == null) return html`<figure class="grade blank"><div class="g-id"><p class="g-k">欧气卡铺 · 欧气鉴定</p><p>开几包就能鉴定</p></div>
    <p class="g-grade"><b>待鉴定</b></p></figure>`;
  return html`<figure class="grade" aria-label="欧气鉴定：${g.L.title}，超过 ${pctText(g.pct)}% 的模拟玩家">
    <div class="g-id">
      <p class="g-k">欧气卡铺 · 欧气鉴定</p>
      <p>${g.what}</p>
      ${g.best ? html`<p class="g-best"><span>${g.best.name}</span><b>${money(g.best.price)}</b></p>` : ''}
      <p class="g-cert">${barcode(g.bars)}<span>No. ${g.cert}</span></p>
    </div>
    <p class="g-grade"><b>${g.L.title}</b><span>超过 ${pctText(g.pct)}%</span></p>
  </figure>`;
}

// Exact binomial tail for one rarity: how likely a player is to be at least this lucky (or unlucky).
function tailLabel(k: string, got: number, exp: number) {
  const p = S.hitTail(G.state.packsBy, k, got), pct = p * 100;
  return `${got >= exp ? '≥' : '≤'}${got}　${pct < 0.1 ? '<0.1' : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}
export function renderLuck() {
  const g = grade(), L = g.L, e = G.expectedTally(), t = G.state.tally, pct = g.pct;
  const rows = ['RR', 'ACE', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR', 'MHR'].filter(k => e[k] > 0 || t[k]);
  render(html`<h2 id="luck-h">欧气检测</h2>
      ${label(g)}
      ${pct == null ? '' : html`<p class="g-act"><button type="button" class="primary" data-act="shareluck">生成分享图</button><small>一块评级卡壳：这张标签 + 你开出过最贵的卡</small></p>`}
      <p class="verdict-sub">${pct == null ? '拿你开出的总市值，和同样开了这些包的几千个模拟玩家比（每个系列先抽 6 万包建分布）。'
        : html`开了 ${L.packs} 包，开出总值超过 <b>${pctText(pct)}%</b> 的模拟玩家。总市值被少数几张大卡左右，误差约 ±1–3 个百分点。${L.boosted ? `其中 ${L.boosted} 包开的时候有手气加成，它们只和同样加成的模拟玩家比。` : ''}`}</p>
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
      <table class="tally"><thead><tr><th>稀有度</th><th>开出</th><th>期望</th><th title="按你开每一包时的概率（官方概率，有手气时是加成后的），开到这么多或更多（更少）的概率">开成这样的概率</th></tr></thead><tbody>
        ${rows.map(k => html`<tr class="${(t[k] || 0) >= (e[k] || 0) ? 'up' : ''}"><td><span class="glyph">${RAR[k].g}</span>${rarLabel(k)}</td><td>${t[k] || 0}</td><td>${(e[k] || 0).toFixed(1)}</td><td>${tailLabel(k, t[k] || 0, e[k] || 0)}</td></tr>`)}
      </tbody></table>` : ''}`, $('luck'));
}
