// 成就 page (#ach) and the unlock pop, in the grading-label language of 欧气鉴定 (DESIGN.md「成就」): every achievement is a small
// label off a graded-card slab. Earned: the label stock of its tier (白 / 银 / 金 / 黑标), navy print, a cert number and the day; the
// grade on the right is the achievement's word in the card-name 黑体. Not yet: a one-row outline with its tier and progress.
// Achievements are judged (check) only outside a reveal, so the pop never gives away a pull before its card is flipped;
// the counters (note, watch) are kept on every emit.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import * as FX from '../fx.ts';
import { ACH, GROUPS, TIERS, check, note, tier, watch, type Ach } from '../achievements.ts';
import { G, $, money, bar } from './common.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';

const day = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const cert = (a: Ach, at: number) => String([...a.id + at].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % 1e8).padStart(8, '0');
const amount = (a: Ach, v: number) => (a.money ? money(v) : v.toLocaleString('en-US'));
const groupName = (g: string) => GROUPS.find(([k]) => k === g)![1];

const tierName = (t: string) => TIERS.find(([k]) => k === t)![1];
const pay = (a: Ach) => (a.cash ? `奖金 ${money(a.cash)}` : '荣誉');

// An earned label. The label stock is the tier (DESIGN.md「成就」): 白标 the plain white label, 银标 / 金标 a foil band round the
// print, 黑标 the card-back navy with foil print. `新`: earned since the player last looked at this page.
function label(a: Ach, cls = '') {
  const at = G.state.ach[a.id], word = a.seal, t = tier(a);
  const wide = /^[A-Z]+$/.test(word) ? 'tag' : word.length > 3 ? 'long' : ''; // SIR in the price-label numerals, like the grade digits on a slab
  return html`<li class="grade ach t-${t} ${cls}">
      <div class="g-id"><p class="g-k">${at > seenAt && !cls ? html`<em class="a-new">新</em>` : ''}<span class="a-shop">欧气卡铺 · ${groupName(a.group)}成就 · </span>${tierName(t)}</p><p class="a-name">${a.name}</p><p>${a.desc}</p>
        <p class="g-cert"><span>No. ${cert(a, at)}</span><span>${day(at)}</span></p></div>
      <p class="g-grade"><b class=${wide}>${word}</b>${a.cash ? html`<span class="gain">+${money(a.cash)}</span>` : html`<span>荣誉</span>`}</p>
    </li>`;
}
// Not yet earned: only the label's outline, one row: what it is, what to do, how far along, and which stock it would print on.
function todo(a: Ach) {
  const hide = a.group === 'hidden', t = tier(a), [now, goal] = a.prog(G), show = goal > 1 && !hide;
  return html`<li class="ach-todo t-${t}">
      <p class="a-name">${hide ? '？？？' : a.name}</p><p class="a-pay"><i class="a-chip" aria-hidden="true"></i>${tierName(t)} · ${pay(a)}</p>
      <p class="a-desc">${hide ? a.hint : a.desc}</p>
      ${show ? html`<p class="a-prog">${bar(now / goal, `${amount(a, now)}/${amount(a, goal)}`)}${amount(a, now)} / ${amount(a, goal)}</p>` : ''}
    </li>`;
}

const rank = (a: Ach) => TIERS.findIndex(([k]) => k === tier(a));
export function renderAch() {
  const got = G.state.ach, n = ACH.filter(a => got[a.id]).length, paid = ACH.reduce((s, a) => s + (got[a.id] ? a.cash : 0), 0);
  const last = ACH.filter(a => got[a.id]).sort((a, b) => got[b.id] - got[a.id])[0];
  const share = (a: Ach) => { const [x, g] = a.prog(G); return Math.min(1, x / g); };
  // the visible achievement closest to done, by share of its goal (the incremental "almost there", like 成长's 下一个目标)
  const near = ACH.filter(a => !got[a.id] && a.group !== 'hidden').map(a => { const [x, g] = a.prog(G); return { a, x, g, p: x / g }; }).filter(o => o.p < 1).sort((p, q) => q.p - p.p)[0];
  const count = (t: string) => { const l = ACH.filter(a => tier(a) === t); return `${l.filter(a => got[a.id]).length} / ${l.length}`; };
  render(html`<header class="grow-head ach-head">
      <div class="gh-lv"><p><span>成就</span><b>${n}</b><small>/ ${ACH.length}</small></p>
        ${bar(n / ACH.length, `${n}/${ACH.length}`, { k: 'EXP' })}</div>
      ${near ? html`<div class="gh-goal"><p class="gg-k">离得最近</p>
        <p class="gg-what"><b>${near.a.name}</b><span>${near.a.desc}</span></p>
        ${near.g > 1 ? html`${bar(near.p, `${Math.round(near.p * 100)}%`)}<small>${amount(near.a, near.x)} / ${amount(near.a, near.g)} · ${tierName(tier(near.a))} · ${pay(near.a)}</small>` : ''}</div>` : html`<p class="gh-goal gg-k">看得见的都解锁了。</p>`}
      <dl class="gh-now">
        <div><dt>奖金已领</dt><dd>${money(paid)}</dd></div>
        <div><dt>最近一个</dt><dd>${last ? last.name : '还没有'}</dd></div>
        ${TIERS.map(([k, name]) => html`<div class="gh-tier t-${k}"><dt><i class="a-chip" aria-hidden="true"></i>${name}</dt><dd>${count(k)}</dd></div>`)}
      </dl>
    </header>
    ${GROUPS.map(([g, name]) => {
      const list = ACH.filter(a => a.group === g), mine = list.filter(a => got[a.id]), rest = list.filter(a => !got[a.id]);
      // earned: the rarest stock first, newest first within it; not yet: the closest to done first
      mine.sort((a, b) => rank(a) - rank(b) || got[b.id] - got[a.id]);
      rest.sort((a, b) => share(b) - share(a));
      return html`<section class="ach-group"><h2>${name} <small>${mine.length} / ${list.length}${g === 'hidden' ? ' · 解锁之前只有一句提示' : ''}</small></h2>
        ${mine.length ? html`<ul class="ach-grid">${mine.map(a => label(a))}</ul>` : ''}
        ${rest.length ? html`<ul class="ach-todos" aria-label="还没拿到">${rest.map(todo)}</ul>` : ''}</section>`;
    })}
    <p class="muted ach-note">解锁就发一次奖金（游戏设定，见页脚），不改开包概率、不改价钱。标签的底色按奖金分：白标不到 $50，银标 $50 起，金标 $300 起，黑标是只有荣誉的那三个。清空存档会连成就一起清掉。</p>`, $('achs'));
}

// ---------- 新 and the 成就 tab dot: feat.achSeen is the last moment the player had this page open. Labels earned after the moment
// they came in (seenAt) wear 新 for this visit; the tab dot counts the ones earned since they last looked ----------
let seenAt = Infinity;
const onPage = () => location.hash === '#ach';
function looked() {
  const f = G.state.feat;
  f.achSeen ??= G.now();                        // a save from before this: what it already has counts as seen
  if (onPage()) { if (seenAt === Infinity) seenAt = f.achSeen; f.achSeen = G.now(); } else seenAt = Infinity;
  const k = Object.values(G.state.ach).filter(t => t > f.achSeen).length, el = $('ach-n');
  el.hidden = !k; render(html`${k}<span class="visually-hidden"> 个新成就</span>`, el);
}

// ---------- unlock pop: the label prints out at the counter's edge, one at a time; more than three at once (an old save's
// first visit) come as one label ----------
let queue: Ach[] = [], showing = false, timer = 0, shown: Ach[] | null = null;
const wait = () => hold || storyOpen(); // a reveal or the story: a label printed now would spoil the card or sit unseen under the dialog
function next() {
  const el = $('ach-pop');
  if (!queue.length || wait()) { showing = false; el.hidden = true; return; }
  showing = true;
  const many = queue.length > 3 ? queue.splice(0) : [queue.shift()!], a = many[0], cash = many.reduce((s, x) => s + x.cash, 0);
  el.hidden = false;
  render(keyed(`${a.id}${many.length}`, many.length === 1
    ? html`<a href="#ach"><ul>${label(a, 'pop')}</ul></a>`
    : html`<a href="#ach"><ul><li class="grade ach pop ${many.some(x => tier(x) === 'black') ? 't-black' : many.some(x => tier(x) === 'gold') ? 't-gold' : ''}">
        <div class="g-id"><p class="g-k">欧气卡铺 · 成就</p><p class="a-name">一次解锁 ${many.length} 个成就</p><p>${many.slice(0, 4).map(x => x.name).join('、')}${many.length > 4 ? ' 等' : ''}</p></div>
        <p class="g-grade"><b>${many.length}</b>${cash ? html`<span class="gain">+${money(cash)}</span>` : ''}</p></li></ul></a>`), el);
  shown = many;
  // 金标 / 黑标 print with a foil sweep, a shower of sparks and a bell on top of the press
  const big = many.some(x => ['gold', 'black'].includes(tier(x)));
  FX.award(big);
  if (big) FX.burst(el.querySelector('.grade'), 3);
  clearTimeout(timer); timer = window.setTimeout(next, many.length > 1 ? 6500 : 4800);
}

function flush() {
  if (hold) return;
  const got = check(G);
  if (got.length) queue.push(...got);
  if (!showing) next();
  looked();
  renderAch();
}
// the story opened over a label: take it back into the queue, so it prints again with its full time once the dialog closes
function onStory() {
  if (!storyOpen()) return flush();
  if (!showing) return;
  clearTimeout(timer); showing = false; $('ach-pop').hidden = true;
  if (shown) queue.unshift(...shown);
}

export function initAch() {
  G.on(ev => { if (ev?.open) note(G, ev.open); watch(G); flush(); });
  document.addEventListener('ptcg:release', flush);
  document.addEventListener('ptcg:story', onStory);
  addEventListener('hashchange', () => { looked(); renderAch(); });
  // Tapping anywhere else puts the label away (on a phone it sits over the bottom of the mat); following its link goes to the page.
  document.addEventListener('pointerdown', e => { if (showing && !(e.target as Element).closest('#ach-pop')) next(); });
  $('ach-pop').addEventListener('click', () => { queue = []; next(); });
  flush();
}
