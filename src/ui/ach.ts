// 成就 page (#ach) and the unlock pop as a BW medal box (DESIGN.md「奖章」): every earned achievement is a round medal struck in its
// tier (铜 / 银 / 金牌, 荣誉 the dark one) with its badge art set in it (the achievement's word when the art is missing), beside a
// small window with its name, what it took, the day and the bonus; the medal opens a 3D one to turn. Not yet: a one-row outline
// with its tier and progress (no badge: a silhouette would give the hidden ones away).
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
const amount = (a: Ach, v: number) => (a.money ? money(v) : v.toLocaleString('en-US'));
const groupName = (g: string) => GROUPS.find(([k]) => k === g)![1];

const tierName = (t: string) => TIERS.find(([k]) => k === t)![1];
const pay = (a: Ach) => (a.cash ? `奖金 ${money(a.cash)}` : '荣誉');

// The medal: its face is the tier (DESIGN.md「奖章」); the badge art (public/gen/badges/<id>.webp, referenced by URL like the story
// art, never inlined) is set in it inside a ring of the tier's foil. Without the art — pen, offline, a file that 404s — the word is
// struck on the face instead (SIR-like words in the price digits, long words smaller); `broken` remembers the ones that failed so a
// re-render doesn't ask for them again. `新`: earned since the player last looked at this page.
const badge = (id: string) => `gen/badges/${id}.webp`;
const broken = new Set<string>();
const lost = (id: string, e: Event) => { // an image that won't load: this medal (page, pop and an open dialog's flat view alike) becomes its word
  broken.add(id);
  const img = e.target as HTMLElement; img.closest('.medal')?.classList.remove('art'); img.remove();
  renderAch();
};
const medal = (t: string, word: string, id = '') => {
  const wide = /^[A-Z]+$/.test(word) ? 'tag' : word.length > 2 ? 'long' : '', art = !!id && !broken.has(id);
  return html`<i class="medal t-${t} ${art ? 'art' : ''}" aria-hidden="true">${art ? html`<img src=${badge(id)} alt="" decoding="async" draggable="false" @error=${(e: Event) => lost(id, e)}>` : ''}<b class=${wide}>${word}</b></i>`;
};
// On the page the medal is a button that opens the 3D one; in the unlock pop (one big link to #ach) it is only the picture.
function earned(a: Ach, cls = '') {
  const at = G.state.ach[a.id], t = tier(a), face = medal(t, a.seal, a.id);
  return html`<li class="medal-row t-${t} ${cls}">
      ${cls ? face : html`<button type="button" class="medal-btn" data-medal=${a.id} aria-label="看奖章：${a.name}">${face}</button>`}
      <div class="m-txt"><p class="m-k">${at > seenAt && !cls ? html`<em class="a-new">新</em>` : ''}${groupName(a.group)} · ${tierName(t)}</p>
        <p class="a-name">${a.name}</p><p class="m-desc">${a.desc}</p>
        <p class="m-foot"><span>${day(at)}</span>${a.cash ? html`<b class="gain">+${money(a.cash)}</b>` : html`<b>荣誉</b>`}</p></div>
    </li>`;
}

// ---------- the 3D medal (src/badge3d.js): a native dialog with the coin to turn. The flat medal is there first and stays when the
// coin can't run (no WebGL, three.js didn't load, the context was lost); reduced motion gets the coin without the idle spin. The
// renderer lives and draws only while the dialog is open ----------
function openMedal(a: Ach) {
  const focus = document.activeElement as HTMLElement | null, dialog = document.createElement('dialog'), t = tier(a);
  dialog.id = 'medal-view'; dialog.className = 'inspect medal-view'; dialog.setAttribute('aria-labelledby', 'mv-name');
  render(html`<header class="inspect-head"><h2 id="mv-name">${a.name}</h2><button type="button" data-close aria-label="关闭奖章">关闭</button></header>
    <div class="mv-stage t-${t}"><div class="mv-flat">${medal(t, a.seal, a.id)}</div></div>
    <p class="m-k">${groupName(a.group)} · ${tierName(t)}</p><p class="m-desc">${a.desc}</p>
    <p class="m-foot"><span>${day(G.state.ach[a.id])}</span>${a.cash ? html`<b class="gain">+${money(a.cash)}</b>` : html`<b>荣誉</b>`}</p>
    <div class="inspect-controls"><button type="button" data-flip hidden>翻面</button></div>
    <p class="inspect-help">拖动或用方向键转动奖章，背面是章上的字。Esc 或点击框外关闭。</p>`, dialog);
  const stage = dialog.querySelector<HTMLElement>('.mv-stage')!, flat = dialog.querySelector<HTMLElement>('.mv-flat')!, flip = dialog.querySelector<HTMLButtonElement>('[data-flip]')!;
  let view: { flip(): void; dispose(): void } | null = null, outside = false;
  const coin = () => { flat.hidden = false; flip.hidden = true; view = null; }; // the context was lost: back to the flat medal
  import('../badge3d.js').then(m => m.mountBadge(stage, {
    front: broken.has(a.id) ? null : badge(a.id), seal: a.seal, name: a.name, tier: t, label: `${a.name}，${tierName(t)}`,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, onLost: coin,
  })).then(v => {
    if (!v) return;
    if (!dialog.open) return v.dispose(); // closed while three.js was loading
    view = v; flat.hidden = true; flip.hidden = false;
  }).catch(e => console.warn('[ach] 3D medal unavailable; the flat medal stays', e));
  flip.addEventListener('click', () => view?.flip());
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  const isOutside = (e: PointerEvent) => { const b = dialog.getBoundingClientRect(); return e.target === dialog && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom); };
  dialog.addEventListener('pointerdown', e => { outside = isOutside(e); });
  dialog.addEventListener('pointerup', e => { if (outside && isOutside(e)) dialog.close(); outside = false; });
  dialog.addEventListener('close', () => { view?.dispose(); view = null; dialog.remove(); if (focus?.isConnected) focus.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.focus();
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
        ${mine.length ? html`<ul class="ach-grid">${mine.map(a => earned(a))}</ul>` : ''}
        ${rest.length ? html`<ul class="ach-todos" aria-label="还没拿到">${rest.map(todo)}</ul>` : ''}</section>`;
    })}
    <p class="muted ach-note">解锁就发一次奖金（游戏设定，见页脚），不改开包概率、不改价钱。奖章按奖金分：铜牌不到 $50，银牌 $50 起，金牌 $300 起，荣誉是只有荣誉、没有奖金的那三个。清空存档会连成就一起清掉。</p>`, $('achs'));
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
    ? html`<a href="#ach"><ul>${earned(a, 'pop')}</ul></a>`
    : html`<a href="#ach"><ul><li class="medal-row pop">
        ${medal(many.some(x => tier(x) === 'black') ? 'black' : many.some(x => tier(x) === 'gold') ? 'gold' : many.some(x => tier(x) === 'silver') ? 'silver' : 'white', String(many.length))}
        <div class="m-txt"><p class="m-k">成就</p><p class="a-name">一次解锁 ${many.length} 个成就</p><p class="m-desc">${many.slice(0, 4).map(x => x.name).join('、')}${many.length > 4 ? ' 等' : ''}</p>
        ${cash ? html`<p class="m-foot"><span></span><b class="gain">+${money(cash)}</b></p>` : ''}</div></li></ul></a>`), el);
  shown = many;
  // 金牌 / 荣誉 strike with a sheen, a shower of sparks and a bell on top of the press
  const big = many.some(x => ['gold', 'black'].includes(tier(x)));
  FX.award(big);
  if (big) FX.burst(el.querySelector('.medal'), 3);
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
  $('achs').addEventListener('click', e => {
    const id = (e.target as Element).closest<HTMLElement>('[data-medal]')?.dataset.medal, a = ACH.find(x => x.id === id);
    if (a && G.state.ach[a.id]) openMedal(a);
  });
  flush();
}
