// 店内动态: every walk-in (G.state.recent) and the shop's own events (G.state.log) as one till roll, newest first.
// A customer line says who came, what for, and how it ended (with the price they balked at and the most they would pay);
// shop lines are what you and the clerk did. Money sits in its own column. New lines are keyed, so only they animate in.
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import type { Visit } from '../game.ts';
import { G, $, money } from './common.ts';

const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
const set = (id?: string) => (id ? G.setById(id).name : '');
const pc = (x: number) => `${Math.round(x * 100)}%`;

function said(v: Visit) {
  const ask = money(v.pct! * v.price!), max = money(v.max! * v.price!);
  const dear = (what: string) => (v.why === 'budget' ? `看中${what}（${ask}），身上的钱不够` : `嫌${what}贵：标价 ${ask}，最多肯出 ${max}`);
  switch (`${v.t}:${v.r}`) {
    case 'opener:sold': return `买走 ${v.n} 包${set(v.set)}${v.miss ? `（想要的${set(v.miss)}没货）` : ''}`;
    case 'opener:pricey': return v.why === 'budget' ? `想拆${set(v.set)}，身上的钱不够一包 ${ask}` : dear(set(v.set));
    case 'opener:none': return `想拆${set(v.set)}，货架上没有`;
    case 'flipper:sold': return v.card ? `收走 ${v.card}（标价是市价的 ${pc(v.pct!)}）` : `扫走 ${v.n} 包${set(v.set)}（标价是市价的 ${pc(v.pct!)}）`;
    case 'flipper:pricey': return v.why === 'cool' ? `${set(v.set)}刚收过一批还没出手，这次不收` : `只收低于市价 ${pc(v.max!)} 的货，空手走了`;
    case 'flipper:none': return '店里没货可扫';
    case 'seeker:none': return `想找一张${v.set ? `${set(v.set)}的` : ''} ${G.SEEK[v.tier!].join('/')}，柜里没有`;
    case 'collector:none': return `想看 $${G.BIG_CARD} 以上的卡，柜里没有`;
    default: return v.r === 'sold' ? `买走 ${v.card}` : dear(` ${v.card} `); // seeker / collector at the case
  }
}
const amt = (x?: number) => (x ? html`<em class=${x < 0 ? 'loss' : ''}>${x < 0 ? '−' : '+'}${money(Math.abs(x))}</em>` : html`<em></em>`);

export function renderLog() {
  const s = G.state;
  const rows = [...s.recent.map(v => ({ at: v.at, key: `v${v.at}`, v })), ...s.log.map(l => ({ at: l.t, key: `l${l.t}${l.text}`, l }))]
    .sort((a, b) => b.at - a.at).slice(0, 30);
  if (!rows.length) { render(html`<li>还没有动静。先进点货。</li>`, $('log')); return; }
  // the minute is printed once, on the newest line of that minute
  render(repeat(rows, r => r.key, (r, i) => {
    const t = hhmm(r.at), time = html`<time>${i && hhmm(rows[i - 1].at) === t ? '' : t}</time>`;
    if ('v' in r) { const v = r.v!; return html`<li class="r-${v.r}">${time}<b>${G.TYPES[v.t].name}</b><span>${said(v)}</span>${amt(v.gain)}</li>`; }
    const l = r.l!; return html`<li class="shop ${l.tone}">${time}<span>${l.text}</span>${amt(l.amt)}</li>`;
  }), $('log'));
}
