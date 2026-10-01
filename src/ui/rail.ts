// 开包 page side rail: which sealed packs are in the warehouse (open one, open a stack, or buy one and open it), where 手气 stands
// (level, 游戏加成 beside the 实测基础概率), and where the luck verdict stands. The mat never returns to idle after the first pack, so
// this is how the player switches sets without leaving the page.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, logoUrl, batchBtn, rarNames } from './common.ts';
import * as S from '../sim.ts';
import { hold } from './mat.ts';
import { luckNow, luckUp, luckUpText, rarest, pct } from './skills.ts';

// 手气 next to the packs it changes. 基础概率 is the TCGplayer measured rate; 游戏加成 is the skill's multiplier on
// the hit rarities, applied only when you open a pack. One row per unlocked set: its rarest hit, official against what it opens at.
// Shown while a pack is in hand too: the level says nothing about the pull. A pack already opened keeps the odds it was opened at.
function boost() {
  const L = luckNow(), up = luckUp(), cash = G.state.cash, lv0 = L.lv === 0;
  const rows = SETS.filter(x => G.unlocked(x.id)).flatMap(x => { const k = rarest(x); return k ? [{ name: x.name, rar: rarNames([k]), off: x.rates[k], now: S.ratesFor(x, L.m)[k] }] : []; });
  return html`<section class="rail-luck" aria-label="手气">
    <strong>手气 Lv ${L.lv}/${L.max}${lv0 ? ' · 还没有游戏加成' : L.cost == null ? ` · 满级 · 游戏加成 ×${L.m.toFixed(2)}` : ` · 游戏加成 ×${L.m.toFixed(2)}`}</strong>
    ${up ? html`<strong class="luck-got" role="status">${luckUpText(up)}</strong>` : ''}
    <span>基础概率来自 TCGplayer 实开统计。手气是额外的游戏加成，只用于你自己开的包${lv0 ? '；当前没有加成' : ''}。</span>
    <table class="tally"><thead><tr><th>最稀有的闪卡</th><th>实测基础</th><th>游戏加成后</th></tr></thead><tbody>
      ${rows.map(r => html`<tr><td>${r.name}<br><small class="muted">${r.rar}</small></td><td>${pct(r.off)}</td><td>${L.m > 1 ? html`<strong>${pct(r.now)}</strong>` : pct(r.now)}</td></tr>`)}</tbody></table>
    ${L.cost == null
      ? html`<span>已经满级${L.perk ? `（含名气「手气底子」多 ${L.perk} 级）` : ''}。${L.perk < L.perkMax ? `名气「手气底子」还能再多 ${L.perkMax - L.perk} 级上限。` : ''}</span>`
      : html`<span>${lv0 ? '学第 1 级' : '下一级'} ${money(L.cost)}：游戏加成 ×${L.next!.toFixed(2)}${cash < L.cost ? `，还差 ${money(L.cost - cash)}` : ''}</span>
        <p class="rail-more"><a href="#grow">去成长页${lv0 ? '学' : '升级'}手气 →</a></p>`}
  </section>`;
}

// While a pack is in hand (mat.ts hold) the buttons are off: opening another would drop the one being revealed. The stock already
// counts the pack in hand; the luck line waits, it would show the pull early.
export function renderRail() {
  const s = G.state, L = G.luck();
  render(html`<h2>仓库里的包</h2>
    ${s.debt > 0 ? html`<p class="rail-more">还欠九姐 <b>${money(s.debt)}</b>，按周还款。<a href="#grow">查看账本 →</a></p>` : ''}
    <ul class="rail-sets">${SETS.filter(x => G.unlocked(x.id)).map(x => {
      const n = s.stock[x.id] || 0, w = G.wholesale(x.id);
      return html`<li><img src="${logoUrl(x.id)}" alt="" loading="lazy"><span class="rs-name">${x.name}<small>${n ? `仓库 ${n} 包` : '仓库空了'}</small></span>
        <span class="rs-btns">${n ? html`<button type="button" data-act="open1" data-id="${x.id}" ?disabled=${hold}>开 1 包</button>${n > 1 ? html`<button type="button" data-act="${batchBtn(x.id).act}" data-id="${x.id}" ?disabled=${hold}>${batchBtn(x.id).text}</button>` : ''}`
          : html`<button type="button" data-act="buyopen" data-id="${x.id}" ?disabled=${hold || s.cash < w}>进 1 包就开 ${money(w)}</button>`}</span></li>`;
    })}</ul>
    ${hold ? html`<p class="rail-more muted">先翻完手里这包，才能开下一包。</p>` : html`<p class="rail-more"><a href="#shelf">去货柜进货、上架、定价 →</a></p>`}
    ${boost()}
    ${!hold && L.pct != null ? html`<a class="rail-luck" href="#luck"><span>欧气</span><b>${L.title}</b><span>超过 ${(L.pct! * 100).toFixed(0)}% 的模拟玩家 →</span></a>` : ''}`, $('rail'));
}
document.addEventListener('ptcg:luck', renderRail); // the 手气 level-up line times out (skills.ts luckUp)
