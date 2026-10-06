// Top bar: cash is the one big number (and flashes what just came in or went out); stock, walk-ins, sales, singles value sit a step below.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { G, $, money, bar } from './common.ts';
import { nextStep } from './upgrades.ts';

let lastCash: number | null = null, delta = 0, stamp = 0, lastHeld = 0, seenAt = G.now(), why = '', lastAt = 0;
let lastExtra: { tickets: number; idle: number; offline: number } | null = null, lastCommPaid: number | null = null;

// What the till's change was made of, when it all came from the counter: packs sold stay a bare 「+$」 (the 第一笔生意 note says what
// it is), a case card sold reads 「卖卡 +$」, hits bought off a customer 「收卡 −$」 — a net −$136 with packs sold and cards bought in the
// same second read as money gone for nothing. 找卡委托 paid is 「交付 +$」 (comm). Other changes (including the player's buys) are explicitly labelled as a net, not a transaction price.
function sources(d: number, extra: { tickets: number; idle: number; offline: number }, comm: number) {
  const vs = G.state.recent.filter(v => v.at > seenAt);
  seenAt = Math.max(seenAt, ...vs.map(v => v.at));
  const sum = (f: (v: (typeof vs)[number]) => number) => vs.reduce((a, v) => a + f(v), 0);
  const packs = sum(v => (v.r === 'sold' && !v.card ? v.gain || 0 : 0)), cards = sum(v => (v.r === 'sold' && v.card ? v.gain || 0 : 0)), paid = sum(v => v.paid || 0);
  if (Math.abs(packs + cards - paid + extra.tickets + extra.idle + extra.offline + comm - d) >= .01) return '';
  return [packs >= .005 ? `卖包 +${money(packs)}` : '', cards >= .005 ? `卖卡 +${money(cards)}` : '', paid >= .005 ? `收卡 −${money(paid)}` : '', comm >= .005 ? `交付 +${money(comm)}` : '',
    extra.tickets >= .005 ? `门票 +${money(extra.tickets)}` : '', extra.idle >= .005 ? `挂机奖励 +${money(extra.idle)}` : '', extra.offline >= .005 ? `离线奖励 +${money(extra.offline)}` : ''].filter(Boolean).join(' · ');
}

// reveal: a pack is being revealed — the till and the shelf keep moving (sales go on), but the singles' worth stays where it was, or it
// would give away the pull before its card is flipped
export function renderStats(reveal = false) {
  const s = G.state, shelves = G.shelves(), stock = Object.values(s.stock).reduce((a, b) => a + b, 0), shelf = shelves.reduce((a, o) => a + o.qty, 0);
  const empty = shelves.some(r => r.id && !r.qty && !G.shelfQty(r.id)); // another stocked facing of the same set is not sold out
  const held = reveal ? lastHeld : Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0);
  lastHeld = held;
  const extra = { tickets: 0, idle: 0, offline: 0 };
  if (lastExtra) for (const k of ['tickets', 'idle', 'offline'] as const) extra[k] = Math.max(0, s.extra[k] - lastExtra[k]);
  lastExtra = { ...s.extra };
  const comm = lastCommPaid == null ? 0 : Math.max(0, s.commPaid - lastCommPaid); lastCommPaid = s.commPaid; // 找卡委托 paid since the last render
  if (lastCash != null && Math.abs(s.cash - lastCash) >= .005) {
    // changes in one go (都补上 buys and shelves set after set, one emit each) add up to one tag: it showed only the last set's −$
    const now = performance.now(), same = now - lastAt < 60; lastAt = now;
    if (same) { delta += s.cash - lastCash; why = ''; } else { delta = s.cash - lastCash; why = sources(delta, extra, comm); stamp++; }
  }
  else if (lastCash == null) seenAt = Math.max(seenAt, ...s.recent.map(v => v.at)); // what happened before this page opened isn't news
  lastCash = s.cash;
  render(html`<p class="cash"><span class="k">现金</span><b>${money(s.cash)}</b>${stamp ? keyed(stamp, html`<span class="delta ${delta >= 0 ? 'gain' : 'loss'}" aria-hidden="true">${why || `净 ${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), 'exact')}`}</span>`) : ''}</p>
    <dl class="sub">${([
      ['shelf', '货架', `${shelf} 包`], ['stock', '仓库', `${stock} 包`], ['rate', '到店', `${(G.rate() * 60).toFixed(1)}/分`], ['sales', '成交', s.customers], ['held', '单卡市值', money(held)],
    ] as const).map(([k, n, v]) => html`<div data-k=${k} ?data-empty=${k === 'shelf' && empty} title=${k === 'shelf' && empty ? '有系列卖空，去货柜补货上架' : n}><dt>${n}</dt><dd>${k === 'shelf' && empty
      ? html`<a href="#shelf" aria-label="货架 ${v}，有系列卖空，去货柜补货">${v}</a>` : v}</dd></div>`)}</dl>`, $('stats'));
}

// 攒钱目标: 成长's 下一步 in sight on 货柜, where the player waits (a reviewer sat out four stretches of 2 minutes not knowing for what or
// how long). The ETA is the 闲钱's own climb over the last few minutes (sales net of restocks and bills), shown only when it is climbing
// and has been watched for a minute: no promise from gross sales.
const spareSeen: [number, number][] = [];
function goal() {
  const g = nextStep(); if (!g || G.canBranch()) return '';
  const now = G.now(), spare = G.spare();
  spareSeen.push([now, spare]); while (spareSeen.length && spareSeen[0][0] < now - 300e3) spareSeen.shift();
  const [t0, s0] = spareSeen[0], per = now - t0 >= 60e3 ? (spare - s0) / ((now - t0) / 60e3) : 0, left = g.cost - spare;
  return html`<p class="pm-goal"><span>下一个目标：<b>${g.name} Lv ${g.lv + 1}</b> ${money(g.cost)}</span>
    ${bar(spare / g.cost, `闲钱 ${money(Math.max(0, spare))} / ${money(g.cost)}`)}
    <small>${left <= 0 ? html`闲钱够了 · <a href="#grow">去成长升级</a>` : `还差 ${money(left)}${per > 0 ? `，照最近几分钟闲钱涨的速度约 ${Math.max(1, Math.ceil(left / per))} 分钟` : ''}（闲钱 = 留好账款后的现金）`}${g.k === 'case' && G.state.shown.length < G.slots()
      ? ` · 展示柜还空着 ${G.slots() - G.state.shown.length} 格${G.caseMoves() ? '，先在展示柜页「补满柜位」，不花钱' : '，摆满了再扩也不迟'}` : ''}</small></p>`;
}
export function renderEarnings() {
  const active = G.idling(), extra = G.state.extra, offline = G.skill('watch') * G.OFFLINE_BONUS;
  render(html`<h2>${G.paused() ? '剧情中 · 经营暂停' : active ? `挂机中 · 销售奖励 +${G.IDLE_BONUS * 100}%` : '挂机已暂停 · 切到货柜页开始挂机'}</h2>
    ${goal()}
    <p>${active ? '正停在货柜页，' : '停在货柜页（货架或展示柜）且页面可见时，'}顾客成交和店员卖散卡可多得 ${G.IDLE_BONUS * 100}% 奖励。切到其他页或转到后台立即停止；没有销售就没有奖励。</p>
    <p>本店挂机奖励 <b class="gain">${money(extra.idle)}</b></p>
    <details><summary>离线经营 · 奖励 +${Math.round(offline * 100)}%</summary>
      <p>离开后最多经营 ${G.offlineCap() / 3600} 小时，仍需库存。「看店」每级增加 ${G.OFFLINE_BONUS * 100}% 离线销售奖励，最多 ${Math.round(G.SKILLS.watch.max * G.OFFLINE_BONUS * 100)}%。与挂机不叠加，门票不加成。</p>
      <p>本店离线奖励 <b class="gain">${money(extra.offline)}</b> · <a href="#grow">去成长升级看店</a></p>
    </details>`, $('playmode'));
}
