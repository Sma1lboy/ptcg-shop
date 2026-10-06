// 找卡委托 (#comm, 货柜 · 展示柜 above the 卡本): the one request a customer has left, if any. The card's face and name, the pay and the time left (shop time, G.commLeft:
// the story pauses it), whether the 卡本 holds the card and, if not, how to get it; 交付 (yellow only when the card is there) and 不接. Rules and numbers live in game.ts (COMM_GAP).
// Frozen while a pack is being revealed (main.ts cardPanels): the cards just pulled are already in the binder and not flipped yet.
import { html, render, nothing } from 'lit-html';
import { G, $, money, bar, rarLabel } from './common.ts';
import { face, cap } from './card.ts';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Where the card is, in words: what the player can do about it.
function whereIs(key: string, setName: string) {
  const s = G.state, n = s.singles[key]?.count ?? 0;
  if (n) return { have: true, text: `卡本里有 ×${n}，可以交付：交一张，另外的留着。` };
  if (s.shown.some(c => c.key === key)) return { have: false, text: '这张在展示柜里：先点柜里的「撤下」放回卡本，才能交付。' };
  if (s.gallery.some(c => c?.key === key)) return { have: false, text: '这张在收藏室里：先放回卡本，才能交付。' };
  return { have: false, text: `卡本里没有。买包的顾客当场拆出它时可能按收卡价（现在 ${Math.round(G.buyPct() * 100)}%）卖给你；也可以开${setName}的包碰运气。图鉴补卡不算，补的卡不进卡本。` };
}

export function renderCommission() {
  const el = $('comm'), s = G.state, c = s.comm;
  el.hidden = !c && !G.lvl('clerk') && s.shopT < G.COMM_OPEN; // nobody asks before the shop has a clerk or has traded COMM_OPEN seconds: nothing to say yet
  if (el.hidden) return;
  if (!c) {
    const wait = s.commAt + G.COMM_GAP - s.shopT;
    render(html`<h2>找卡委托</h2>
      <p class="muted">现在没人来找卡。有顾客想要某张闪卡时，会在这里留一张委托：${G.COMM_LEN / 60} 分钟内交来，给市价 ×${G.COMM_PAY}。不接、过期都没有损失。${wait > 0 ? `下一张最早 ${clock(wait)} 后。` : ''}</p>`, el);
    return;
  }
  const set = G.setById(c.set), left = G.commLeft(), where = whereIs(G.commKey(c), set.name), can = where.have && !G.revealing();
  render(html`<h2>找卡委托 <small>还剩 ${clock(left)}</small></h2>
    <div class="cm">
      <div class="cm-card">${face(c, 'show')}${cap(c, 'show')}</div>
      <div class="cm-main">
        <p class="cm-name"><b>${c.name}</b> <span class="muted">${set.name} #${c.n} · ${rarLabel(c.kind)}</span></p>
        <p>报酬 <b class="gain">${money(c.reward, 'exact')}</b> <span class="muted">（市价 ${money(c.price)} ×${G.COMM_PAY}）</span></p>
        ${bar(left / G.COMM_LEN, `委托还剩 ${clock(left)}`, { hp: true })}
        <p class="cm-have">${where.text}</p>
        <div class="cm-btns">
          <button type="button" class=${can ? 'primary' : nothing} data-act="comm-deliver" ?disabled=${!can} title="从卡本交一张，现金 +${money(c.reward, 'exact')}">交付 ${money(c.reward, 'exact')}</button>
          <button type="button" data-act="comm-dismiss" title="不接这张：没有损失，下一张最早 ${G.COMM_GAP / 60} 分钟后">不接</button>
        </div>
      </div>
    </div>`, el);
}
