// 成就 page (#ach) and the unlock pop. The metaphor is the shop's stamp card (集章卡): one paper card per group, a stamp slot per
// achievement; a stamped slot carries the rubber stamp in card-back blue ink with the day it was stamped. When a stamp is earned
// a small stamp card slides onto the counter and the stamp comes down on it. Stamps are judged (check) only outside a reveal,
// so the pop never gives away a pull before its card is flipped; the per-pack counters (note) are kept on every open.
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import * as FX from '../fx.ts';
import { ACH, GROUPS, check, note, type Ach } from '../achievements.ts';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';

const day = (t: number) => { const d = new Date(t); return `${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`; };
const rot = (id: string) => [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 23 - 11; // each stamp lands a little crooked, always the same way
const amount = (a: Ach, v: number) => (a.money ? money(v) : v.toLocaleString('en-US'));
const secret = (a: Ach) => a.group === 'hidden' && !G.state.ach[a.id];

// The rubber stamp: a double ring, the seal text (2–4 characters) and the date it was stamped. Unstamped: the slot's printed outline.
function stampOf(a: Ach, at?: number, cls = '') {
  const txt = secret(a) && !at ? '？' : a.seal;
  return html`<span class="stamp ${at ? 'inked' : 'empty'} n${Math.min(txt.length, 4)} ${/^[A-Z]+$/.test(txt) ? 'latin' : ''} ${cls}" style="--rot:${rot(a.id)}deg" aria-hidden="true">
    <b>${txt}</b>${at ? html`<small>${day(at)}</small>` : nothing}</span>`;
}

function slot(a: Ach) {
  const at = G.state.ach[a.id], [now, goal] = a.prog(G), hide = secret(a);
  return html`<li class="slot ${at ? 'got' : ''}">
    ${stampOf(a, at)}
    <p class="sl-name">${hide ? '？？？' : a.name}</p>
    <p class="sl-desc">${hide ? a.hint : a.desc}</p>
    ${at ? html`<p class="sl-meta">${day(at)} 盖章${a.cash ? html` · <span class="gain">+${money(a.cash)}</span>` : ''}</p>`
      : html`<p class="sl-meta">${goal > 1 && !hide ? html`<span class="sl-bar" role="img" aria-label="${amount(a, now)}/${amount(a, goal)}"><i style="width:${Math.min(1, now / goal) * 100}%"></i></span>${amount(a, now)} / ${amount(a, goal)} · ` : ''}${a.cash ? `奖金 ${money(a.cash)}` : '只有章'}</p>`}
  </li>`;
}

export function renderAch() {
  const got = G.state.ach, n = ACH.filter(a => got[a.id]).length, paid = ACH.reduce((s, a) => s + (got[a.id] ? a.cash : 0), 0);
  const last = ACH.filter(a => got[a.id]).sort((a, b) => got[b.id] - got[a.id])[0];
  // the nearest visible stamp that is not in yet, by share of its goal (the incremental "almost there")
  const near = ACH.filter(a => !got[a.id] && a.group !== 'hidden').map(a => { const [x, g] = a.prog(G); return { a, x, g, p: x / g }; }).filter(o => o.p < 1).sort((p, q) => q.p - p.p)[0];
  render(html`<header class="grow-head ach-head">
      <p class="gh-lv"><span>集章</span><b>${n}</b><small>/ ${ACH.length} 枚</small></p>
      <span class="gh-bar" role="img" aria-label="${n}/${ACH.length}"><i style="--p:${n / ACH.length}"></i></span>
      <dl class="gh-now">
        <div><dt>奖金已领</dt><dd>${money(paid)}</dd></div>
        <div><dt>最近一枚</dt><dd>${last ? `${last.name} · ${day(got[last.id])}` : '还没有'}</dd></div>
        ${near ? html`<div><dt>离得最近</dt><dd>${near.a.name} · ${near.g > 1 ? `${amount(near.a, near.x)}/${amount(near.a, near.g)}` : '差一步'}</dd></div>` : ''}
      </dl>
    </header>
    <div class="scards">${GROUPS.map(([g, label]) => {
      const list = ACH.filter(a => a.group === g), k = list.filter(a => got[a.id]).length;
      return html`<article class="scard" aria-label="${label}集章卡">
        <header><b>欧气卡铺</b><span>${label} · 集章卡</span><small>${k} / ${list.length}</small></header>
        <ol class="slots">${list.map(slot)}</ol>
        ${g === 'hidden' ? html`<footer>隐藏的章盖上之前只露一句提示。</footer>` : ''}
      </article>`;
    })}</div>
    <p class="muted ach-note">盖章就发奖金（一次性现金，写在页脚「游戏设定」里），不改开包概率、不改价钱。清空存档会连章一起清掉。</p>`, $('stamps'));
}

// ---------- unlock pop: one stamp card at a time; a burst of more than three (an old save's first visit) comes as one card ----------
let queue: Ach[] = [], showing = false, timer = 0;
function next() {
  const el = $('stamp-pop');
  if (!queue.length) { showing = false; el.hidden = true; return; }
  showing = true;
  const many = queue.length > 3 ? queue.splice(0) : [queue.shift()!], a = many[0], at = G.state.ach[a.id], cash = many.reduce((s, x) => s + x.cash, 0);
  el.hidden = false;
  render(keyed(`${a.id}${many.length}`, html`<a class="sp-card" href="#ach">
      <span class="sp-stamps">${many.slice(0, 3).map((x, i) => stampOf(x, at, `slam d${i}`))}</span>
      <span class="sp-txt"><small>${many.length > 1 ? `一次盖了 ${many.length} 枚章` : `${GROUPS.find(([g]) => g === a.group)![1]} · 集章卡`}</small>
        <b>${many.length > 1 ? many.slice(0, 3).map(x => x.name).join('、') + (many.length > 3 ? ' 等' : '') : a.name}</b>
        ${many.length === 1 ? html`<span>${a.desc}</span>` : ''}
        ${cash ? html`<em class="gain">奖金 +${money(cash)}</em>` : html`<em>只有章，没有奖金</em>`}</span>
    </a>`), el);
  FX.stamp();
  clearTimeout(timer); timer = window.setTimeout(next, many.length > 1 ? 6500 : 4800);
}

function flush() {
  if (hold) return;
  const got = check(G);
  if (got.length) { queue.push(...got); if (!showing) next(); }
  renderAch();
}

export function initAch() {
  G.on(ev => { if (ev?.open) note(G, ev.open); flush(); });
  document.addEventListener('ptcg:release', flush);
  // Tapping anywhere else puts the card away (on a phone it sits over the bottom of the mat); following its link goes to the page.
  document.addEventListener('pointerdown', e => { if (showing && !(e.target as Element).closest('#stamp-pop')) next(); });
  $('stamp-pop').addEventListener('click', () => { queue = []; next(); });
  flush();
}
