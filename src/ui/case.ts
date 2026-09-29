// 展示柜 · 镇店之宝: priced singles in the case, and the trophy card.
import { html, render } from 'lit-html';
import * as S from '../sim.ts';
import { G, $, money, rarLabel } from './common.ts';
import { face, mark } from './card.ts';

export function renderCase() {
  const s = G.state, t = s.trophy, pct = G.casePct(), free = G.slots() - s.shown.length;
  const n = Math.min(free, Object.values(s.singles).reduce((a, c) => a + (S.HITS.includes(c.kind) ? c.count : 0), 0));
  render(html`<h2>展示柜 ${s.shown.length}/${G.slots()} · 镇店之宝</h2>
      <div class="case-bar"><span>全柜标价</span><span class="pricer"><button type="button" data-act="caseprice" data-d="-1" aria-label="全柜降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(pct * 100)}%</b>
          <button type="button" data-act="caseprice" data-d="1" aria-label="全柜涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span>
        <button type="button" class="primary" data-act="fillcase" ?disabled=${!n} title="把单卡库存里最贵的闪卡挂进空柜位">${n ? `补满柜位（${n} 张）` : free ? '单卡库存没有闪卡' : '柜位满了'}</button></div>
      <p class="muted">每张卡按自己市价的 ${Math.round(pct * 100)}% 标价，改全柜标价会一起改，单张还能再调。找卡的、收藏党来翻柜，标得越高肯买的人越少；顾客那栏有他们最多肯出几成。</p>
      <ul class="singles">${s.shown.length ? s.shown.map((c, i) => html`<li>${face(c, 'list')}
        <span class="s-name">${c.name}<small>${G.setById(c.set).name} #${c.n} · ${mark(c, false)}${rarLabel(c.kind)} · 市价 ${money(c.price)}</small></span>
        <span class="pricer"><button type="button" data-act="cprice" data-i="${i}" data-d="-1" aria-label="降价" ?disabled=${G.cardPct(c) <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(G.cardPct(c) * 100)}%</b>
          <button type="button" data-act="cprice" data-i="${i}" data-d="1" aria-label="涨价" ?disabled=${G.cardPct(c) >= G.MAX_PCT - 1e-9}>＋</button></span>
        <span class="sticker" title="柜台标价">${money(G.cardAsk(c))}</span>
        <button type="button" data-act="unlist" data-i="${i}">撤下</button></li>`) : html`<li class="muted">空着。点「补满柜位」，或在单卡库存里一张张「上柜」。</li>`}</ul>
      <div class="trophy">${t ? html`${face(t, 'list')}<span>${t.name} ${money(t.price)}<small>收藏党更常来、肯多付 ${Math.round(G.trophyBonus() * 60)}%，不会被卖掉</small></span>
        <button type="button" data-act="untrophy">收回</button>` : html`<span class="muted">没有镇店之宝。单卡越值钱，越能吸引收藏党（上限 +50%）。</span>`}</div>`, $('casepanel'));
}
