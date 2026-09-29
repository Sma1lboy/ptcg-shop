// 成就 page (#ach) and the unlock pop, in the grading-label language of 欧气鉴定 (DESIGN.md「成就」): every achievement is a small
// label off a graded-card slab. Earned: white label stock, navy print, the inset navy frame, a cert number and the day; the grade
// on the right is the achievement's word in the card-name 黑体. Not yet: the blank label (hairline frame, muted) with its progress.
// Achievements are judged (check) only outside a reveal, so the pop never gives away a pull before its card is flipped;
// the counters (note, watch) are kept on every emit.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import * as FX from '../fx.ts';
import { ACH, GROUPS, check, note, watch, type Ach } from '../achievements.ts';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';
import { storyOpen } from './story.ts';

const day = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const cert = (a: Ach, at: number) => String([...a.id + at].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % 1e8).padStart(8, '0');
const amount = (a: Ach, v: number) => (a.money ? money(v) : v.toLocaleString('en-US'));
const groupName = (g: string) => GROUPS.find(([k]) => k === g)![1];

function label(a: Ach, cls = '') {
  const at = G.state.ach[a.id], hide = a.group === 'hidden' && !at, word = hide ? '？' : a.seal;
  const wide = /^[A-Z]+$/.test(word) ? 'tag' : word.length > 3 ? 'long' : ''; // SIR in the price-label numerals, like the grade digits on a slab
  if (at) return html`<li class="grade ach ${cls}">
      <div class="g-id"><p class="g-k">欧气卡铺 · ${groupName(a.group)}成就</p><p class="a-name">${a.name}</p><p>${a.desc}</p>
        <p class="g-cert"><span>No. ${cert(a, at)}</span><span>${day(at)}</span></p></div>
      <p class="g-grade"><b class=${wide}>${word}</b>${a.cash ? html`<span class="gain">+${money(a.cash)}</span>` : html`<span>荣誉</span>`}</p>
    </li>`;
  const [now, goal] = a.prog(G), bar = goal > 1 && !hide;
  return html`<li class="grade blank ach">
      <div class="g-id"><p class="g-k">${groupName(a.group)} · 待解锁</p><p class="a-name">${hide ? '？？？' : a.name}</p><p>${hide ? a.hint : a.desc}</p>
        ${bar ? html`<p class="a-prog"><span class="a-bar" role="img" aria-label="${amount(a, now)}/${amount(a, goal)}"><i style="width:${Math.min(1, now / goal) * 100}%"></i></span>${amount(a, now)} / ${amount(a, goal)}</p>` : ''}</div>
      <p class="g-grade"><b class=${wide}>${word}</b><span>${a.cash ? `奖金 ${money(a.cash)}` : '荣誉'}</span></p>
    </li>`;
}

export function renderAch() {
  const got = G.state.ach, n = ACH.filter(a => got[a.id]).length, paid = ACH.reduce((s, a) => s + (got[a.id] ? a.cash : 0), 0);
  const last = ACH.filter(a => got[a.id]).sort((a, b) => got[b.id] - got[a.id])[0];
  // the visible achievement closest to done, by share of its goal (the incremental "almost there", like 成长's 下一个目标)
  const near = ACH.filter(a => !got[a.id] && a.group !== 'hidden').map(a => { const [x, g] = a.prog(G); return { a, x, g, p: x / g }; }).filter(o => o.p < 1).sort((p, q) => q.p - p.p)[0];
  render(html`<header class="grow-head ach-head">
      <div class="gh-lv"><p><span>成就</span><b>${n}</b><small>/ ${ACH.length}</small></p>
        <span class="gh-bar" role="img" aria-label="${n}/${ACH.length}"><i style="--p:${n / ACH.length}"></i></span></div>
      ${near ? html`<div class="gh-goal"><p class="gg-k">离得最近</p>
        <p class="gg-what"><b>${near.a.name}</b><span>${near.a.desc}</span></p>
        ${near.g > 1 ? html`<span class="gt-save" role="img" aria-label="${Math.round(near.p * 100)}%"><i style="width:${near.p * 100}%"></i></span><small>${amount(near.a, near.x)} / ${amount(near.a, near.g)} · ${near.a.cash ? `奖金 ${money(near.a.cash)}` : '荣誉'}</small>` : ''}</div>` : html`<p class="gh-goal gg-k">看得见的都解锁了。</p>`}
      <dl class="gh-now">
        <div><dt>奖金已领</dt><dd>${money(paid)}</dd></div>
        <div><dt>最近一个</dt><dd>${last ? last.name : '还没有'}</dd></div>
        <div><dt>隐藏成就</dt><dd>${ACH.filter(a => a.group === 'hidden' && got[a.id]).length} / ${ACH.filter(a => a.group === 'hidden').length}</dd></div>
      </dl>
    </header>
    ${GROUPS.map(([g, name]) => {
      const list = ACH.filter(a => a.group === g), k = list.filter(a => got[a.id]).length;
      // earned first (newest first), then the rest in their designed order
      const sorted = [...list.filter(a => got[a.id]).sort((a, b) => got[b.id] - got[a.id]), ...list.filter(a => !got[a.id])];
      return html`<section class="ach-group"><h2>${name} <small>${k} / ${list.length}${g === 'hidden' ? ' · 解锁之前只有一句提示' : ''}</small></h2>
        <ul class="ach-grid">${sorted.map(a => label(a))}</ul></section>`;
    })}
    <p class="muted ach-note">解锁就发一次奖金（游戏设定，见页脚），不改开包概率、不改价钱。清空存档会连成就一起清掉。</p>`, $('achs'));
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
    : html`<a href="#ach"><ul><li class="grade ach pop">
        <div class="g-id"><p class="g-k">欧气卡铺 · 成就</p><p class="a-name">一次解锁 ${many.length} 个成就</p><p>${many.slice(0, 4).map(x => x.name).join('、')}${many.length > 4 ? ' 等' : ''}</p></div>
        <p class="g-grade"><b>${many.length}</b>${cash ? html`<span class="gain">+${money(cash)}</span>` : ''}</p></li></ul></a>`), el);
  shown = many;
  FX.award();
  clearTimeout(timer); timer = window.setTimeout(next, many.length > 1 ? 6500 : 4800);
}

function flush() {
  if (hold) return;
  const got = check(G);
  if (got.length) queue.push(...got);
  if (!showing) next();
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
  // Tapping anywhere else puts the label away (on a phone it sits over the bottom of the mat); following its link goes to the page.
  document.addEventListener('pointerdown', e => { if (showing && !(e.target as Element).closest('#ach-pop')) next(); });
  $('ach-pop').addEventListener('click', () => { queue = []; next(); });
  flush();
}
