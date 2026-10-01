// 展示柜 · 镇店之宝: the case as furniture, the second wall of the shop next to the shelf wall (shelf.ts), read as a BW PC box: one
// cell per slot (frame rim, card-back navy under the faint diagonal stripe), the card standing on an acrylic stand, and the
// player's yellow ask clipped to the cell's lip between its − / ＋. An empty slot is the empty stand; the next 展示柜 upgrade is a
// dashed cell at the end, like the wall's unbuilt bay. The trophy has its own cell on a riser, the lighter navy. Above: the two
// single-card prices (单卡标价 for the case and the binder, 收卡价 for counter sellers,
// GAMEPLAY §14) and 补满柜位.
import { html, render, nothing } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import type { Shown } from '../game.ts';
import { G, $, money, rarLabel, lately } from './common.ts';
import { face, mark } from './card.ts';
import { renderSingles } from './singles.ts';
import { hold } from './mat.ts';
import { inspectCard } from './inspect.ts';

// A 缺货表 cell pointed at (goals.ts gaps): 'set:tier' ('' for any set). The case cubes and binder pockets holding a card that
// seeker would take are lit, so 「现在 3 张」 points at the three cards. Not mid-reveal: the binder then holds unflipped cards.
let spotK: string | null = null;
export const spotted = (c: { set: string; kind: string }) => { if (!spotK) return false; const [id, t] = spotK.split(':'); return G.SEEK[+t].includes(c.kind) && (!id || c.set === id); };
export function spot(k: string | null) { if (spotK === k) return; spotK = k; if (!hold) { renderCase(); renderSingles(); } }

const stand = html`<i class="v-stand" aria-hidden="true"></i>`;

// 卖出落在柜里: each card keeps its cube. state.shown closes up when a card leaves, and 带徒弟 refills the gap in the same tick,
// so the cubes are placed here by the card objects themselves (they live on in memory; after a reload the first render is the
// baseline): a card that leaves frees its cube, a new card takes the first free cube. A card that left while a customer bought
// that card (state.recent since the last render) was sold: for LIVE its picture lifts out of the cell under a flash and a
// till chip says 「售出 +$1,503」, over whatever stands there now (empty, or the next card already). Unlisting (撤下, 换上大卡) is
// silent. renderAll skips the case during a reveal, so only sales from the last LIVE get the stamp, not three minutes of 连开.
const LIVE = 2400;
let pos: (Shown | null)[] | null = null, lastAt = 0, soldN = 0;
const stamps: ({ k: number; at: number; c: Shown; gain: number } | undefined)[] = [];
function place(slots: number) {
  const s = G.state, now = Date.now(), cur = new Set(s.shown);
  const fresh = s.recent.filter(v => v.at > lastAt && v.r === 'sold' && v.card && v.t !== 'opener');
  lastAt = s.recent[0]?.at ?? lastAt;
  if (pos) pos.forEach((c, k) => {
    if (!c || cur.has(c)) return;
    pos![k] = null;
    const v = fresh.find(v => v.card === c.name || (v.t === 'seeker' && v.n! > 1));
    if (v && now - v.at < LIVE) stamps[k] = { k: ++soldN, at: now, c, gain: G.cardAsk(c) };
  });
  pos ||= [];
  const placed = new Set(pos);
  for (const c of s.shown) if (!placed.has(c)) { const k = pos.indexOf(null); if (k >= 0) pos[k] = c; else pos.push(c); }
  while (pos.length > Math.max(slots, s.shown.length) && pos.at(-1) === null) pos.pop();
  while (pos.length < slots) pos.push(null);
  return pos;
}
const stamp = (k: number) => { const t = stamps[k]; return t && Date.now() - t.at < LIVE ? keyed(t.k, html`<span class="v-gone" aria-hidden="true">${face(t.c, 'show')}</span>
    <span class="r-beat v-beat">售出 <em>+${money(t.gain)}</em></span>`) : nothing; };

// who looked at a card in the case and left it (balk records the card: a seeker's cheapest fit, a collector's priciest big card),
// said under the first cube holding that card: the miss is pinned to the cube, and the rail above says what price would fix it
function balked() {
  const since = Date.now() - G.MISS_WINDOW * 1000, m = new Map<string, { dear: number; broke: number; max: number }>();
  for (const v of G.state.recent) {
    if (v.at <= since) break;
    if (v.r !== 'pricey' || !v.card || v.t === 'flipper') continue;
    const e = m.get(v.card) || { dear: 0, broke: 0, max: 0 }; if (v.why === 'budget') e.broke++; else { e.dear++; e.max = Math.max(e.max, v.max!); }
    m.set(v.card, e);
  }
  return m;
}

function slot(c: Shown, i: number, k: number, miss?: { dear: number; broke: number; max: number }) {
  const pct = G.cardPct(c), off = Math.abs(pct - G.casePct()) > 1e-9;
  return html`<li class="v-slot ${spotted(c) ? 'spot' : ''}" data-spot="card:${c.name}">
      <button type="button" class="v-cube inspect-trigger" aria-label="欣赏${c.name}" @click=${() => inspectCard(c)}>${face(c, 'show', true)}${stand}${stamp(k)}</button>
      <p class="v-lip"><button type="button" data-act="cprice" data-i="${i}" data-d="-1" aria-label="${c.name} 降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button>
        <span class="sticker" title="柜台标价：市价的 ${Math.round(pct * 100)}%">${money(G.cardAsk(c))}</span>
        <button type="button" data-act="cprice" data-i="${i}" data-d="1" aria-label="${c.name} 涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></p>
      <div class="v-ctl v-info"><span class="v-name">${c.name}</span>
          <small title="${rarLabel(c.kind)}">${mark(c)}市价 <b>${money(c.price)}</b>${off ? html` · 标 <b>${Math.round(pct * 100)}%</b>` : nothing}</small>
        <button type="button" data-act="unlist" data-i="${i}" title="放回卡本">撤下</button>
          ${miss ? html`<small class="v-miss" title="${lately()}来看这张、没买的顾客${miss.dear ? `；嫌贵的最多肯出市价的 ${Math.round(miss.max * 100)}%` : ''}"><b>${miss.dear + miss.broke} 位</b>看了没买${miss.dear && miss.broke ? `（${miss.broke} 位钱不够）` : miss.broke ? '：钱不够' : `：最多肯出 ${Math.round(miss.max * 100)}%`}</small>` : nothing}</div>
    </li>`;
}

export function renderCase() {
  const s = G.state, t = s.trophy, pct = G.casePct(), buy = G.buyPct(), slots = G.slots(), free = slots - s.shown.length;
  const cubes = place(slots), miss = balked(), named = new Set<string>();
  const n = G.caseMoves(), fillText = free > 0 ? `补满柜位（${n} 张）` : `换上大卡（${n} 张）`, up = G.upgradeCost('case');
  render(html`<h2>展示柜 ${s.shown.length}/${slots} · 镇店之宝</h2>
      <div class="case-bar"><span class="cb-k">单卡标价<span class="pricer"><button type="button" data-act="caseprice" data-d="-1" aria-label="单卡降价" ?disabled=${pct <= G.MIN_PCT + 1e-9}>−</button><b>${Math.round(pct * 100)}%</b>
          <button type="button" data-act="caseprice" data-d="1" aria-label="单卡涨价" ?disabled=${pct >= G.MAX_PCT - 1e-9}>＋</button></span></span>
        <span class="cb-k">收卡价<span class="pricer"><button type="button" data-act="buyprice" data-d="-1" aria-label="收卡价降一档" ?disabled=${buy <= G.BUY_MIN + 1e-9}>−</button><b>${Math.round(buy * 100)}%</b>
          <button type="button" data-act="buyprice" data-d="1" aria-label="收卡价提一档" ?disabled=${buy >= G.BUY_MAX - 1e-9}>＋</button></span></span>
        <a class="case-link" href="#collection">收藏室 ${G.state.gallery?.filter(Boolean).length ?? 0}/${G.GALLERY_SLOTS}<span class="visually-hidden">：只看不卖的五个展位</span></a>
        <button type="button" class="primary" data-act="fillcase" ?disabled=${!n} title="先补空柜位，再用卡本里更贵的闪卡换掉柜里最便宜的">${n ? fillText : free ? '卡本里没有闪卡' : '柜里已是最贵的'}</button></div>
      <p class="case-note" title="找卡的翻展示柜和卡本（一次最多带走 ${G.SEEK_N} 张）；拆包玩家当场拆出的闪卡按收卡价卖给你（他们心里平均要 ${Math.round(G.SELLER.tol * 100)}%，同行收 ${Math.round(G.BUYLIST * 100)}%）；卡本满 ${G.BINDER} 张、欠着九姐的账时不收；九姐来收账前 ${G.BILL_KEEP / 60} 分钟，收银机里先留够那张账">卡本里的闪卡按市价的 ${Math.round(pct * 100)}% 卖，上柜的卡按各自价签卖。收藏党只看柜里市价 $${G.BIG_CARD} 以上的卡，大卡上柜。拆包玩家当场拆出的闪卡，可能按市价的 ${Math.round(buy * 100)}% 卖给你。</p>
      <div class="vitrine">
        <div class="v-trophy ${t ? '' : 'none'}">
          <button type="button" class="v-cube inspect-trigger" aria-label=${t ? `欣赏${t.name}` : '镇店之宝空位'} ?disabled=${!t} @click=${() => { if (t) inspectCard(t); }}>${t ? face(t, 'show', true) : nothing}${stand}</button>
          <p class="v-plaque">镇店之宝</p>
          <div class="v-say">${t ? html`<span class="v-name">${t.name}</span>
              <small>${mark(t, false)}${rarLabel(t.kind)} · 市价 <b>${money(t.price)}</b></small>
              <small>不卖。收藏党更常来，肯多付 ${Math.round(G.trophyBonus() * 60)} 个百分点</small>
              <button type="button" data-act="untrophy">收回卡本</button>`
            : html`<small>空着。在卡本里给一张卡按「镇店」：卡越值钱，来的收藏党越多、也越肯多付；这张不卖。</small>`}</div>
        </div>
        <ol class="v-slots">${cubes.map((c, k) => { const m = c && !named.has(c.name) ? (named.add(c.name), miss.get(c.name)) : undefined;
            return c ? slot(c, s.shown.indexOf(c), k, m) : html`<li class="v-slot empty">
            <div class="v-cube">${stand}<span class="v-empty">空柜位</span>${stamp(k)}</div><p class="v-lip"></p></li>`; })}${up != null ? html`<li class="v-slot ghost">
            <div class="v-cube"><span class="v-empty">还能加 ${G.CASE_STEP} 格</span></div>
            <div class="v-ctl"><button type="button" data-act="up" data-k="case" ?disabled=${s.cash < up}>扩柜 ${money(up)}</button></div></li>` : nothing}</ol>
      </div>`, $('casepanel'));
}
