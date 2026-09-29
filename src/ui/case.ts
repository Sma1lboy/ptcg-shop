// 展示柜 · 镇店之宝: priced singles in the case, the two single-card prices (单卡标价 for the case and the binder, 收卡价 for
// counter sellers, GAMEPLAY §14), and the trophy card.
import { html, render } from 'lit-html';
import { G, $, money, rarLabel } from './common.ts';
import { face, mark } from './card.ts';

export function renderCase() {
  const s = G.state, t = s.trophy, pct = G.casePct(), buy = G.buyPct(), free = G.slots() - s.shown.length;
  const n = G.caseMoves(), fillText = free > 0 ? `补满柜位（${n} 张）` : `换上大卡（${n} 张）`;
  render(html`<h2>展示柜 ${s.shown.length}/${G.slots()} · 镇店之宝</h2>
      <div class="case-bar"><span class="cb-k">单卡标价<span class="pricer"><button type="button" data-act="caseprice" data-d="-1" aria-label="单卡降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(pct * 100)}%</b>
          <button type="button" data-act="caseprice" data-d="1" aria-label="单卡涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span></span>
        <span class="cb-k">收卡价<span class="pricer"><button type="button" data-act="buyprice" data-d="-1" aria-label="收卡价降一档" ?disabled=${buy <= G.BUY_MIN + 1e-9}>−</button><b>${Math.round(buy * 100)}%</b>
          <button type="button" data-act="buyprice" data-d="1" aria-label="收卡价提一档" ?disabled=${buy >= G.BUY_MAX - 1e-9}>＋</button></span></span>
        <button type="button" class="primary" data-act="fillcase" ?disabled=${!n} title="把卡本里最贵的闪卡挂进空柜位；柜位满了就把比柜里最便宜那张更贵的换上去">${n ? fillText : free ? '卡本里没有闪卡' : '柜里已是最贵的'}</button></div>
      <p class="muted">每张卡按自己市价的 ${Math.round(pct * 100)}% 卖：找卡的翻展示柜和卡本（一次最多带走 ${G.SEEK_N} 张），收藏党只看展示柜里 $${G.BIG_CARD} 以上的卡，所以大卡上柜。
        买完包当场拆的拆包玩家，闪卡按市价的 ${Math.round(buy * 100)}% 卖给你（他们心里平均要 ${Math.round(G.SELLER.tol * 100)}%，同行收 ${Math.round(G.BUYLIST * 100)}%）；卡本满 ${G.BINDER} 张、欠着九姐的账时不收；九姐来收账前 ${G.BILL_KEEP / 60} 分钟，收银机里先留够那张账。</p>
      <ul class="singles">${s.shown.length ? s.shown.map((c, i) => html`<li>${face(c, 'list')}
        <span class="s-name">${c.name}<small>${G.setById(c.set).name} #${c.n} · ${mark(c, false)}${rarLabel(c.kind)} · 市价 ${money(c.price)}</small></span>
        <span class="pricer"><button type="button" data-act="cprice" data-i="${i}" data-d="-1" aria-label="降价" ?disabled=${G.cardPct(c) <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(G.cardPct(c) * 100)}%</b>
          <button type="button" data-act="cprice" data-i="${i}" data-d="1" aria-label="涨价" ?disabled=${G.cardPct(c) >= G.MAX_PCT - 1e-9}>＋</button></span>
        <span class="sticker" title="柜台标价">${money(G.cardAsk(c))}</span>
        <button type="button" data-act="unlist" data-i="${i}">撤下</button></li>`) : html`<li class="muted">空着。点「补满柜位」，或在卡本里一张张「上柜」。</li>`}</ul>
      <div class="trophy">${t ? html`${face(t, 'list')}<span>${t.name} ${money(t.price)}<small>收藏党更常来、肯多付 ${Math.round(G.trophyBonus() * 60)}%，不会被卖掉</small></span>
        <button type="button" data-act="untrophy">收回</button>` : html`<span class="muted">没有镇店之宝。单卡越值钱，越能吸引收藏党（上限 +50%）。</span>`}</div>`, $('casepanel'));
}
