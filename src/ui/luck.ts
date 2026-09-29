// 欧气检测: the verdict as a grading label, where your total sits among the simulated players (the same chart and sentences as the
// share image, share.ts), per-rarity tally with exact tail odds.
import { html, render, svg } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money, rarLabel } from './common.ts';
import { mark } from './card.ts';
import { grade, pctText, type Grade } from './share.ts';

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
    <p class="g-grade"><b class=${g.L.title.length > 3 ? 'long' : ''}>${g.L.title}</b><span>超过 ${pctText(g.pct)}%</span></p>
  </figure>`;
}

// The simulated players' totals (S.luckBins, the bins share.ts's spread() draws): bars you beat in ink, the rest faint; 你 on a
// pin above, 期望 as a tick under the axis. Bars are an SVG stretched to the box; the words are HTML so they don't stretch.
const side = (x: number) => x < .12 ? 'l' : x > .88 ? 'r' : '';
function dist(g: Grade) {
  const L = g.L, B = S.luckBins(S.luckSamples(G.state.packsBy), L.value, L.expected), top = Math.max(...B.bins);
  return html`<figure class="dist" role="img" aria-label="${g.head}；期望 ${money(L.expected)}">
    <div class="dist-plot">
      <svg viewBox="0 0 ${B.bins.length} 1" preserveAspectRatio="none" aria-hidden="true">${B.bins.map((c, i) => c ? svg`<rect class=${B.beat(i) ? 'on' : ''} x=${i + .12} width=".76" y=${1 - Math.max(.04, c / top)} height=${Math.max(.04, c / top)}></rect>` : '')}</svg>
      <i class="dist-you ${side(B.you)}" style="left:${B.you * 100}%"><b>你 ${money(L.value)}</b></i>
    </div>
    <p class="dist-axis"><span class="dist-exp ${side(B.exp)}" style="left:${B.exp * 100}%">期望 ${money(L.expected)}</span></p>
  </figure>`;
}

// Exact binomial tail for one rarity: how likely a player is to be at least this lucky (or unlucky).
// Kept until packsBy changes (a pack is opened): the panel re-renders on every tick, the tail only moves when packs do.
let tails: Record<string, number> = {}, tailsOf = '';
function tailLabel(k: string, got: number, exp: number) {
  const by = JSON.stringify(G.state.packsBy); if (by !== tailsOf) { tails = {}; tailsOf = by; }
  const p = tails[`${k}:${got}`] ??= S.hitTail(G.state.packsBy, k, got), pct = p * 100;
  return `${got >= exp ? '≥' : '≤'}${got}　${pct < 0.1 ? '<0.1' : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}
export function renderLuck() {
  const g = grade(), L = g.L, e = G.expectedTally(), t = G.state.tally, pct = g.pct;
  const rows = ['RR', 'ACE', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR', 'MHR'].filter(k => e[k] > 0 || t[k]);
  render(html`<h2 id="luck-h">欧气检测</h2>
      <div class="lk-a">${label(g)}
      ${pct == null ? html`<p class="verdict-sub">拿你开出的总市值，和 ${S.LUCK_TRIALS} 个开了同样这些包（同系列、同包数、同概率）的模拟玩家比。</p>` : html`
      <p class="g-act"><button type="button" class="primary" data-act="shareluck">生成分享图</button><small>分享图印的就是这张标签和下面这张分布</small></p>
      <p class="dist-head">${g.head}</p>
      ${dist(g)}
      <p class="dist-note">${g.method}</p>
      <p class="dist-best">${g.bestLine}${g.best && L.packs < 300 ? html`<small>包数少时，总值主要看有没有开出一两张大卡。</small>` : ''}${L.boosted ? html`<small>其中 ${L.boosted} 包开的时候有手气加成，它们只和同样加成的模拟玩家比。</small>` : ''}</p>`}</div>
      ${L.packs ? html`<div class="lk-b"><dl class="kv">
        <div><dt>开出市值</dt><dd>${money(L.value)}</dd></div>
        <div><dt>期望市值</dt><dd>${money(L.expected)}<small class="dd-note">整包标价的 ${Math.round(L.expected / L.listEV * 100)}%</small></dd></div>
        <div><dt>进货成本</dt><dd>${money(L.cost)}</dd></div></dl>
      <p class="muted basis-note">开出市值按 TCGplayer <b>现在</b>的单卡市价重算，和模拟玩家同一口径${L.live ? '' : '（旧存档：早期开的包只能按开包当时的价格）'}。期望只有整包标价的 ${Math.round(L.expected / L.listEV * 100)}%，是因为标价里有密封溢价，见页脚「价格口径」。</p>
      <table class="tally"><thead><tr><th>稀有度</th><th>开出</th><th>期望</th><th title="按你开每一包时的概率（官方概率，有手气时是加成后的），开到这么多或更多（更少）的概率">开成这样的概率</th></tr></thead><tbody>
        ${rows.map(k => html`<tr class="${(t[k] || 0) >= (e[k] || 0) ? 'up' : ''}"><td>${mark({ kind: k, r: k }, false)}${rarLabel(k)}</td><td>${t[k] || 0}</td><td>${(e[k] || 0).toFixed(1)}</td><td>${tailLabel(k, t[k] || 0, e[k] || 0)}</td></tr>`)}
      </tbody></table></div>` : ''}`, $('luck'));
}
