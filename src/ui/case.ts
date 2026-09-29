// 展示柜 · 镇店之宝: priced singles in the case, and the trophy card.
import { html, render } from 'lit-html';
import { G, $, money, imgUrl, rar } from './common.ts';

export function renderCase() {
  const s = G.state, t = s.trophy;
  render(html`<h2>展示柜 ${s.shown.length}/${G.slots()} · 镇店之宝</h2>
      <p class="muted">柜里每张卡自己定价（占市价的比例）。找卡的、收藏党会来翻柜；标得越高，肯买的人越少。</p>
      <ul class="singles">${s.shown.length ? s.shown.map((c, i) => html`<li><span class="glyph t${rar(c).t}">${rar(c).g}</span>
        <span class="s-name">${c.name}<small>${G.setById(c.set).name} #${c.n} · 市价 ${money(c.price)}</small></span>
        <span class="pricer"><button type="button" data-act="cprice" data-i="${i}" data-d="-1" aria-label="降价" ?disabled=${G.cardPct(c) <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(G.cardPct(c) * 100)}%</b>
          <button type="button" data-act="cprice" data-i="${i}" data-d="1" aria-label="涨价" ?disabled=${G.cardPct(c) >= G.MAX_PCT - 1e-9}>＋</button></span>
        <span class="sticker" title="柜台标价">${money(G.cardAsk(c))}</span>
        <button type="button" data-act="unlist" data-i="${i}">撤下</button></li>`) : html`<li class="muted">空着。在单卡库存里点「上柜」。</li>`}</ul>
      <div class="trophy">${t ? html`<img src="${imgUrl(t)}" crossorigin="anonymous" alt="${t.name}"><span>${t.name} ${money(t.price)}<small>收藏党更常来、肯多付 ${Math.round(G.trophyBonus() * 60)}%，不会被卖掉</small></span>
        <button type="button" data-act="untrophy">收回</button>` : html`<span class="muted">没有镇店之宝。单卡越值钱，越能吸引收藏党（上限 +50%）。</span>`}</div>`, $('casepanel'));
}
