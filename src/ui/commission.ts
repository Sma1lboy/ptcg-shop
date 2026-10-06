// 找卡委托 (#comm, 货柜 · 展示柜 above the 卡本): the one request a customer has left, if any. With none open it is a one-line status (the rules
// are in the footer's 游戏设定). With one: the card's face and name, the pay and the time left (shop time, G.commLeft: the story pauses it),
// where the card is and, if not in the 卡本, how to get it; 不接. 交付 is not here: it is the yellow key on the 卡本 pocket that holds the card (singles.ts).
// Frozen while a pack is being revealed (main.ts cardPanels): the cards just pulled are already in the binder and not flipped yet.
import { html, render, nothing } from 'lit-html';
import { G, $, money, bar, rarLabel } from './common.ts';
import { hold } from './mat.ts';
import { face, cap } from './card.ts';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Where the card is, in words: what the player can do about it.
function whereIs(key: string, setName: string) {
  const s = G.state, n = s.singles[key]?.count ?? 0;
  if (n) return `卡本里有 ×${n}：到下面标着「委托」的那格点「交付」，交一张，另外的留着。`;
  if (s.shown.some(c => c.key === key)) return '这张在展示柜里：先点柜里的「撤下」放回卡本，才能交付。';
  if (s.gallery.some(c => c?.key === key)) return '这张在收藏室里：先放回卡本，才能交付。';
  return `卡本里没有。买包的顾客当场拆出它时可能按收卡价（现在 ${Math.round(G.buyPct() * 100)}%）卖给你；也可以开${setName}的包碰运气。图鉴补卡不算，补的卡不进卡本。`;
}
// 开包找它: while the card is nowhere in the shop, the request can be chased right here — ten packs of its set (the back room's first,
// the rest bought at the wholesale price), else one. A gamble the player sees the odds of (G.cardOdds: one pack, and at least one in
// ten), not a way to make money: opening is a loss per pack (页脚「价格口径」). A blind reviewer's wish: the minutes waiting for money
// had nothing cheap and repeatable to do, and chasing a $63 request meant hunting through 货柜's 更多.
function chase(set: string, n: string) {
  // bought with 闲钱 only (cash beyond the next bill), like the binder's 连开到出新卡: a gamble never eats 九姐's money
  const st = G.state.stock[set] || 0, w = G.wholesale(set), need = Math.max(0, 10 - st), cash = G.spare(), p = G.cardOdds(set, n);
  const key = st >= 10 ? { act: 'open10', text: '开 10 包找它', title: `开仓库里的 10 包（仓库 ${st} 包）` }
    : cash >= need * w ? { act: 'fill10', text: `进 ${need} 包开十连 ${money(need * w, 'exact')}`, title: `${st ? `仓库的 ${st} 包加上` : ''}按进货价进 ${need} 包，开十连` }
    : st >= 1 ? { act: 'open1', text: '开 1 包找它', title: `开仓库里的 1 包（仓库 ${st} 包）` }
    : cash >= w ? { act: 'buyopen', text: `进 1 包开 ${money(w, 'exact')}`, title: '按进货价进 1 包，马上拆' } : null;
  const ten = 1 - (1 - p) ** 10;
  return {
    odds: p > 0 ? html`<p class="muted">按当前手气平均约 ${Math.round(1 / p).toLocaleString('en-US')} 包出一张，开十连至少出一张约 ${Math.max(1, Math.round(ten * 100))}%；开包平均是亏的，碰运气不保证。</p>` : nothing,
    key: key ? html`<button type="button" data-act="${key.act}" data-id="${set}" title="${key.title}" ?disabled=${hold}>${key.text}</button>` : nothing,
  };
}

export function renderCommission() {
  const el = $('comm'), s = G.state, c = s.comm;
  el.hidden = !c && !G.lvl('clerk') && s.shopT < G.COMM_OPEN; // nobody asks before the shop has a clerk or has traded COMM_OPEN seconds: nothing to say yet
  if (el.hidden) return;
  if (!c) {
    const wait = s.commAt + G.COMM_GAP - s.shopT;
    render(html`<h2>找卡委托 <small>现在没有委托${wait > 0 ? ` · 下一张最早 ${clock(wait)} 后` : ''}</small></h2>`, el);
    return;
  }
  const set = G.setById(c.set), left = G.commLeft(), key = G.commKey(c), where = whereIs(key, set.name);
  const missing = !(s.singles[key]?.count) && !s.shown.some(x => x.key === key) && !s.gallery.some(x => x?.key === key) && G.unlocked(c.set);
  const ch = missing ? chase(c.set, c.n) : null;
  render(html`<h2>找卡委托 <small>还剩 ${clock(left)}</small></h2>
    <div class="cm">
      <div class="cm-card">${face(c, 'show')}${cap(c, 'show')}</div>
      <div class="cm-main">
        <p class="cm-name"><b>${c.name}</b> <span class="muted">${set.name} #${c.n} · ${rarLabel(c.kind)}</span></p>
        <p>报酬 <b class="gain">${money(c.reward, 'exact')}</b> <span class="muted">（市价 ${money(c.price)} ×${G.COMM_PAY}）</span></p>
        ${bar(left / G.COMM_LEN, `委托还剩 ${clock(left)}`, { hp: true })}
        <p class="cm-have">${where}</p>
        ${ch?.odds ?? nothing}
        <div class="cm-btns">
          ${ch?.key ?? nothing}<button type="button" data-act="comm-dismiss" title="不接这张：没有损失，下一张最早 ${G.COMM_GAP / 60} 分钟后">不接</button>
        </div>
      </div>
    </div>`, el);
}
