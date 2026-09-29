// 开包 page side rail: which sealed packs are in the warehouse (open one, open a stack, or buy one and open it), and where the
// luck verdict stands. The mat never returns to idle after the first pack, so this is how the player switches sets without leaving the page.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, logoUrl, batchBtn } from './common.ts';
import { hold } from './mat.ts';

// While a pack is in hand (mat.ts hold) the buttons are off: opening another would drop the one being revealed. The stock already
// counts the pack in hand; the luck line waits, it would show the pull early.
export function renderRail() {
  const s = G.state, L = G.luck();
  render(html`<h2>仓库里的包</h2>
    <ul class="rail-sets">${SETS.filter(x => G.unlocked(x.id)).map(x => {
      const n = s.stock[x.id] || 0, w = G.wholesale(x.id);
      return html`<li><img src="${logoUrl(x.id)}" alt="" loading="lazy"><span class="rs-name">${x.name}<small>${n ? `仓库 ${n} 包` : '仓库空了'}</small></span>
        <span class="rs-btns">${n ? html`<button type="button" data-act="open1" data-id="${x.id}" ?disabled=${hold}>开 1 包</button>${n > 1 ? html`<button type="button" data-act="${batchBtn(x.id).act}" data-id="${x.id}" ?disabled=${hold}>${batchBtn(x.id).text}</button>` : ''}`
          : html`<button type="button" data-act="buyopen" data-id="${x.id}" ?disabled=${hold || s.cash < w}>进 1 包就开 ${money(w)}</button>`}</span></li>`;
    })}</ul>
    ${hold ? html`<p class="rail-more muted">手里这包翻完，再开下一包。</p>` : html`<p class="rail-more"><a href="#shelf">去货柜进货、上架、定价 →</a></p>`}
    ${!hold && L.pct != null ? html`<a class="rail-luck" href="#luck"><span>欧气</span><b>${L.title}</b><span>超过 ${(L.pct! * 100).toFixed(0)}% 的模拟玩家 →</span></a>` : ''}`, $('rail'));
}
