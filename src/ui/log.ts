// 店内动态: every walk-in (G.state.recent) and the shop's own events (G.state.log) as one till roll, newest first.
// A customer line says who came, what for, and how it ended (with the price they balked at and the most they would pay);
// shop lines are what you and the clerk did. Money sits in its own column. New lines are keyed, so only they animate in.
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import type { Visit, State } from '../game.ts';
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
    case 'flipper:sold': return v.card ? `收走 ${v.card}（标价是市价的 ${pc(v.pct!)}）` : `整架扫走 ${v.n} 包${set(v.set)}：标价是市价的 ${pc(v.pct!)}，他肯出到 ${pc(v.max!)}`;
    case 'flipper:pricey': return v.why === 'cool' ? `${set(v.set)}刚收过一批还没出手，这次不收` : `只收低于市价 ${pc(v.max!)} 的货，空手走了`;
    case 'flipper:none': return '店里没货可扫';
    case 'seeker:none': return `想找一张${v.set ? `${set(v.set)}的` : ''} ${G.SEEK[v.tier!].join('/')}，柜里没有`;
    case 'collector:none': return `想看 $${G.BIG_CARD} 以上的卡，柜里没有`;
    default: return v.r === 'sold' ? `买走 ${v.card}` : dear(` ${v.card} `); // seeker / collector at the case
  }
}
const amt = (x?: number) => (x ? html`<em class=${x < 0 ? 'loss' : ''}>${x < 0 ? '−' : '+'}${money(Math.abs(x))}</em>` : html`<em></em>`);

// At 80 walk-ins a minute 30 single lines last 20 seconds, so within a minute the everyday visits merge into one line per
// (who, how it ended, which set / what they asked for): 「拆包玩家 ×23 买走 61 包同行之旅 +$540」. What carries its own detail
// stays a line of its own: a case card sold or balked at, a flipper's sweep. A group is placed by its first visitor, so it
// grows in place instead of jumping to the top every second; its key is stable, so only a new group animates in.
const group = (v: Visit) => (v.card || (v.t === 'flipper' && v.r === 'sold') ? '' : `${Math.floor(v.at / 60000)}:${v.t}:${v.r}:${v.why || ''}:${v.t === 'seeker' ? v.tier : v.set || ''}`);
function merged(vs: Visit[]) {
  const v = vs[0], name = set(v.set), n = vs.length, top = (xs: number[]) => spread(xs.map((x, i) => x * vs[i].price!));
  switch (`${v.t}:${v.r}`) {
    case 'opener:sold': return `买走 ${vs.reduce((a, x) => a + x.n!, 0)} 包${name}${vs.some(x => x.miss) ? `（${vs.filter(x => x.miss).length} 位想要的没货，改买这个）` : ''}`;
    case 'opener:pricey': return v.why === 'budget' ? `想拆${name}，身上的钱不够一包 ${money(v.pct! * v.price!)}` : `嫌${name}贵：标价 ${money(v.pct! * v.price!)}，最多肯出 ${top(vs.map(x => x.max!))}`;
    case 'opener:none': return `想拆${name}，货架上没有`;
    case 'flipper:pricey': return v.why === 'cool' ? `${name}刚收过一批还没出手，这次不收` : '嫌贵，空手走了';
    default: return n > 1 ? said(v).replace(/^想找一张.*?的 /, '想找一张 ') : said(v); // seekers merge across sets
  }
}
const spread = (xs: number[]) => { xs = [...xs].sort((a, b) => a - b); return xs[0] === xs.at(-1) ? money(xs[0]) : `${money(xs[0])}–${money(xs.at(-1)!)}`; };

export function renderLog() {
  const s = G.state, groups = new Map<string, Visit[]>();
  const rows: { at: number; key: string; vs?: Visit[]; l?: State['log'][number] }[] = s.log.map(l => ({ at: l.t, key: `l${l.t}${l.text}`, l }));
  for (const v of s.recent) { // newest first, so a group's last member is its first visitor
    const g = group(v), vs = g && groups.get(g);
    if (vs) vs.push(v); else { const row = { at: v.at, key: g ? `g${g}` : `v${v.at}`, vs: [v] }; rows.push(row); if (g) groups.set(g, row.vs); }
  }
  for (const r of rows) if (r.vs) r.at = r.vs.at(-1)!.at;
  rows.sort((a, b) => b.at - a.at); rows.length = Math.min(rows.length, 30);
  if (!rows.length) { render(html`<li>还没有动静。先进点货。</li>`, $('log')); return; }
  // the minute is printed once, on the newest line of that minute
  render(repeat(rows, r => r.key, (r, i) => {
    const t = hhmm(r.at), time = html`<time>${i && hhmm(rows[i - 1].at) === t ? '' : t}</time>`;
    if (r.vs) { const vs = r.vs, v = vs[0], n = vs.length, gain = vs.reduce((a, x) => a + (x.gain || 0), 0);
      return html`<li class="r-${v.r}">${time}<b>${G.TYPES[v.t].name}${n > 1 ? html` <small>×${n}</small>` : ''}</b><span>${n > 1 ? merged(vs) : said(v)}</span>${amt(gain)}</li>`; }
    const l = r.l!; return html`<li class="shop ${l.tone}">${time}<span>${l.text}</span>${amt(l.amt)}</li>`;
  }), $('log'));
}
