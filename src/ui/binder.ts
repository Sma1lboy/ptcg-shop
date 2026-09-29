// 卡册 (#dex on the 欧气 page): the shop's collection binder, one index tab per set (and 战利品, the priciest hits ever pulled, in
// front). Each set is its card list in number order, nine pockets a page, two pages open on a wide screen and one on a phone:
// a card pulled from a pack sits in its pocket, a card bought from a peer (补卡) sits there with an ink 「补」 tag, a card you don't
// have is the empty pocket with its number, rarity mark and name printed. Under the tabs, the set's page map (one 3×3 per page)
// jumps to a page. Tap a pocket for the card up close. 补卡 and 连开到出新卡 (moved here from goals.ts, unchanged) sit with the set.
// Frozen while a pack is being revealed (a pocket filling would spoil the pull): main.ts renderAll skips it during hold.
// 新: a pocket filled since the player last had the binder open wears 新, its tab and page map say so, and the 欧气 tab carries a
// dot with the count; the pack summary on the mat names them and opens the binder on their page (see 「新」 below).
// 收齐: a set at 100% has its binder closed and its cover hot-stamped with the set's logo (silver 大师套, gold 亲手开齐); its tab opens
// on that cover, a tap opens the book. The same cover() is what closes in the 收齐 scene (ui/story.ts).
import { html, render, nothing } from 'lit-html';
import { SETS, DATA } from '../sets.ts';
import * as S from '../sim.ts';
import { logo } from '../assets.ts';
import { G, $, money, rarLabel } from './common.ts';
import { face, cap, mark } from './card.ts';
import { hold, huntable } from './mat.ts';

const PER = 9, HITS = 'hits';
type Pocket = { set: string; n: string; name: string; r: string; kind: string; price: number };
let at = { tab: '', page: 0, shut: false }, zoom: Pocket | null = null;
const wide = matchMedia('(min-width: 780px)'); // two pages open side by side
const span = () => (wide.matches ? 2 : 1);

// the card numbers of each set pulled by hand (state.dex keys are set|n|kind; energy is not a card of the set), with copies
let handOf: Record<string, Map<string, number>> = {}, handKeys = -1;
function hand(id: string) {
  const d = G.state.dex, keys = Object.keys(d);
  if (keys.length !== handKeys) {
    handOf = {}; handKeys = keys.length;
    for (const k of keys) { const [s, n] = k.split('|'); if (n === 'E') continue; const m = (handOf[s] ||= new Map()); m.set(n, (m.get(n) || 0) + d[k].c); }
  }
  return handOf[id] || new Map<string, number>();
}
const sets = () => SETS.filter(s => G.unlocked(s.id) || G.handCount(s.id) || G.dexCount(s.id));
const pocketsOf = (tab: string): Pocket[] => tab === HITS ? G.state.hits
  : DATA[tab].cards.map(c => ({ set: tab, n: c.n, name: c.name, r: c.r, kind: c.r, price: S.cardPrice(tab, c.n, c.r) ?? 0 }));
const has = (c: Pocket, h: Map<string, number>) => G.state.dexSeen[`${c.set}|${c.n}`] ? (h.has(c.n) ? 'got' : 'bought') : 'none';

// where a tab opens: its first new pocket, else the first page with a gap (a set's gaps cluster at the end, in the secret rares)
function open(tab: string) {
  const h = hand(tab), all = pocketsOf(tab), nu = fresh();
  let i = tab === HITS ? -1 : all.findIndex(c => nu.has(`${c.set}|${c.n}`));
  if (i < 0) i = tab === HITS ? 0 : all.findIndex(c => has(c, h) === 'none');
  at = { tab, page: Math.max(0, Math.floor(i / PER)), shut: tab !== HITS && !!sealOf(tab) && !freshOf(tab).length };
}

// ---------- 收齐: the cover ----------
export const sealOf = (id: string): '' | 'silver' | 'gold' => (G.handDone(id) ? 'gold' : G.master(id) ? 'silver' : '');
// The binder's front cover, stamped (kind) or blank. The logo is pressed as foil: the logo image is the mask of a foil gradient, so
// it takes the stamp's colour, not its print. A CDN logo (pen, file://) may not be readable as a mask: the name alone is stamped.
export function cover(id: string, kind: '' | 'silver' | 'gold') {
  const s = G.setById(id), tot = G.dexTotal(id), src = logo(id);
  return html`<span class="bk-cover ${kind}">
      <span class="bk-seal" aria-label="${s.name}${kind ? `，${kind === 'gold' ? '亲手开齐' : '大师套'} ${tot}/${tot}` : ''}">
        ${kind && !/^https?:/.test(src) ? html`<i class="bk-seal-logo" style="--logo:url(${src})"></i>` : nothing}
        <b>${s.name}</b>
        ${kind ? html`<small>${kind === 'gold' ? '亲手开齐' : '大师套'} · ${tot}/${tot}</small>` : nothing}
      </span>
    </span>`;
}

// ---------- 新: feat.dexSeenN / feat.dexHandN are how many keys state.dexSeen / state.dex had when the player last had the binder
// open. Both objects only ever gain keys, and string keys keep insertion order (through the JSON save too), so the keys past those
// counts are what went into the book since: a new card number (pulled or 补), or a number pulled by hand for the first time.
// base is this visit's snapshot, so 新 stays on for the whole visit, like the 成就 page's. ----------
let base: { s: number; d: number } | null = null, memo = { k: '', v: new Set<string>() };
const onPage = () => location.hash === '#luck';
function fresh() {
  const st = G.state, f = st.feat, b = base ?? { s: f.dexSeenN ?? Infinity, d: f.dexHandN ?? Infinity };
  const s = Object.keys(st.dexSeen), d = Object.keys(st.dex), k = `${s.length},${d.length},${b.s},${b.d}`;
  if (memo.k === k) return memo.v;
  const card = (key: string) => key.slice(0, key.lastIndexOf('|')), had = new Set(d.slice(0, b.d).map(card)), v = new Set(s.slice(b.s));
  for (const key of d.slice(b.d)) { const c = card(key); if (!c.endsWith('|E') && !had.has(c)) v.add(c); }
  return (memo = { k, v }).v;
}
// the new pockets of one set, in the order they went in
const freshOf = (id: string) => [...fresh()].filter(k => k.startsWith(`${id}|`));
function looked() {
  if (hold) return; // mid-reveal the book is frozen: looking now must not use up the 新 of cards not yet flipped
  const st = G.state, f = st.feat, s = Object.keys(st.dexSeen).length, d = Object.keys(st.dex).length;
  f.dexSeenN ??= s; f.dexHandN ??= d;             // a save from before this: what it already has counts as seen
  if (onPage()) {
    if (!base) { base = { s: f.dexSeenN, d: f.dexHandN }; const nu = [...fresh()]; if (nu.length) open(nu[nu.length - 1].split('|')[0]); }
    f.dexSeenN = s; f.dexHandN = d;
  } else base = null;
  const n = onPage() ? 0 : fresh().size, el = $('luck-n');
  el.hidden = !n; render(html`${n}<span class="visually-hidden"> 张新卡进了卡册</span>`, el);
}

// For the pack summary on the mat (plain strings, it's innerHTML there): the set's cards new to the book, and how far the set is.
export function toBook(id: string) {
  const cs = freshOf(id).map(k => DATA[id].cards.find(c => c.n === k.split('|')[1])!).filter(Boolean);
  const names = cs.sort((a, b) => (S.cardPrice(id, b.n, b.r) ?? 0) - (S.cardPrice(id, a.n, a.r) ?? 0)).map(c => c.name); // dearest first
  const { need, next } = tierOf(id);
  return { names, count: G.dexCount(id), total: G.dexTotal(id), next: next ? `再 ${need} 张到 ${next[0] * 100}%` : '' };
}
function tierOf(id: string) {
  const c = G.dexCount(id), tot = G.dexTotal(id), next = G.DEX_TIERS.find(([at]) => c / tot < at - 1e-9);
  return { next, need: next ? Math.ceil(next[0] * tot - 1e-9) - c : 0 };
}

function pocket(c: Pocket, st: string, i: number, nu: boolean) {
  const hits = at.tab === HITS;
  if (st === 'none') return html`<li class="pk none"><button type="button" class="pk-slot" data-bk-zoom=${i} aria-label="${c.n} 号 ${c.name}，还没有">
      <b>${c.n}</b>${mark({ kind: c.r, r: c.r }, false)}<small>${c.name}</small></button><span class="cf-cap"><b class="cf-price">${money(c.price)}</b></span></li>`;
  return html`<li class="pk ${st}"><button type="button" class="pk-card" data-bk-zoom=${i} aria-label="${hits ? '' : `${c.n} 号 `}${c.name}${st === 'bought' ? '，补的' : ''}">
      ${face(c, 'show')}${st === 'bought' ? html`<i class="pk-buy" aria-hidden="true">补</i>` : nothing}</button>${nu ? html`<i class="hand-new">新</i>` : nothing}${cap(c, 'show')}</li>`;
}

// The 收齐 scene's centrepiece (ui/story.ts): the set's last page — its nine dearest cards — with the cover swinging shut over it,
// then the stamp pressed on. The animation is all CSS (style.css「收齐」), so it plays once, when the scene mounts it.
export function closing(id: string, kind: 'silver' | 'gold') {
  const nine = DATA[id].cards.map(c => ({ set: id, n: c.n, name: c.name, r: c.r, kind: c.r, price: S.cardPrice(id, c.n, c.r) ?? 0 })).sort((a, b) => b.price - a.price).slice(0, PER);
  return html`<div class="bk-close ${kind}" aria-hidden="true"><ol class="bk-page">${nine.map(c => html`<li class="pk got">${face(c, 'show')}</li>`)}</ol>
      <span class="bk-hinge"><span class="bk-lid-in"></span>${cover(id, kind)}</span></div>`;
}

function spread(tab: string) {
  if (at.shut) return html`<div class="bk-book shut"><button type="button" class="bk-lid" data-bk-open aria-label="翻开${G.setById(tab).name}的卡册">${cover(tab, sealOf(tab))}</button>
      <p class="muted bk-lid-say">${sealOf(tab) === 'gold' ? `${G.dexTotal(tab)} 张全是开包开出来的，一张没买` : `${G.dexTotal(tab)} 张收齐，其中补的 ${G.dexTotal(tab) - G.handCount(tab)} 张`} · 点封面翻开</p></div>`;
  const all = pocketsOf(tab), h = tab === HITS ? new Map() : hand(tab), pages = Math.max(1, Math.ceil(all.length / PER)), w = span();
  const nu = fresh(), isNew = (c: Pocket) => tab !== HITS && nu.has(`${c.set}|${c.n}`);
  // a page with every pocket filled gets a 满页 stamp; it's pressed on (animated) when one of those went in on this visit
  const full = (p: number) => { const cs = all.slice(p * PER, p * PER + PER); return tab !== HITS && cs.every(c => has(c, h) !== 'none') ? (cs.some(isNew) ? 'full nu' : 'full') : ''; };
  at.page = Math.min(Math.floor(at.page / w) * w, Math.floor((pages - 1) / w) * w);
  const pg = (p: number) => html`<ol class="bk-page ${full(p)}" start=${p * PER + 1}>${Array.from({ length: PER }, (_, k) => {
    const i = p * PER + k, c = all[i];
    return c ? pocket(c, tab === HITS ? 'got' : has(c, h), i, isNew(c)) : html`<li class="pk blank" aria-hidden="true"></li>`;
  })}</ol>`;
  const shown = Array.from({ length: w }, (_, k) => at.page + k).filter(p => p < pages || p === at.page);
  const last = Math.min(at.page + w, pages);
  return [html`<div class="bk-book" role="tabpanel" aria-label="第 ${at.page + 1} 页"><div class="bk-open">
      <button type="button" class="bk-turn" data-bk-pg=${at.page - w} ?disabled=${at.page === 0} aria-label="上一页">‹</button>
      <div class="bk-spread" data-n=${w}>${shown.map(pg)}</div>
      <button type="button" class="bk-turn" data-bk-pg=${at.page + w} ?disabled=${at.page + w >= pages} aria-label="下一页">›</button>
    </div></div>`,
    pages > 1 ? html`<div class="bk-map" role="group" aria-label="翻到第几页">${Array.from({ length: pages }, (_, p) => {
      const cs = all.slice(p * PER, p * PER + PER), got = cs.filter(c => tab === HITS || has(c, h) !== 'none').length;
      return html`<button type="button" class="bk-mm ${p >= at.page && p < last ? 'on' : ''}" data-bk-pg=${p} aria-label="第 ${p + 1} 页，${got}/${cs.length}">
        ${cs.map(c => html`<i class="${tab === HITS ? 'got' : has(c, h)}${isNew(c) ? ' nu' : ''}"></i>`)}</button>`;
    })}<span class="bk-pn">第 ${at.page + 1}${last - at.page > 1 ? `–${last}` : ''} / ${pages} 页</span></div>` : nothing];
}

// the set's line above its pages: how full the 图鉴 is and what the next 回头客 tier needs, 亲手开出, then what to do about the gaps
function head(id: string) {
  const c = G.dexCount(id), tot = G.dexTotal(id), { next, need } = tierOf(id), h = G.handCount(id), stock = G.state.stock[id] || 0;
  return html`<div class="bk-head">
      <p class="bk-count"><span><b>${c}</b>/${tot}</span> 张入册 <span class="bk-hand">亲手开出 <b>${h}</b>/${tot}</span></p>
      <p class="muted">${next ? `再收 ${need} 张到 ${next[0] * 100}%：回头客 +${next[1] * 100}%` : '已收齐'} · 现有加成 +${Math.round(G.dexBonusOf(id) * 100)}%
        <span class="bk-key"><i class="got"></i>开包开出 <i class="bought"></i>补的 <i class="none"></i>还没有</span></p>
      ${stock || (sealOf(id) && !at.shut) ? html`<div class="btns">${stock ? html`<button type="button" class="primary" data-act="open1" data-id=${id}>开一包${G.setById(id).name}（仓库 ${stock}）</button>` : nothing}
        ${sealOf(id) && !at.shut ? html`<button type="button" data-bk-shut>合上看封面</button>` : nothing}</div>` : nothing}
      ${G.unlocked(id) ? collect(id) : nothing}${handLine(id)}
    </div>`;
}

// 图鉴补卡: buy the missing hits at market into the binder (never resellable); C/U/R only come from packs. 100% = 大师套.
function collect(id: string) {
  if (G.master(id)) return html`<small class="master">大师套：这个系列的拆包玩家肯多付 ${G.MASTER.tol * 100}%，专程来买的人 ×${G.MASTER.w}</small>`;
  const miss = G.missing(id), base = G.dexTotal(id) - G.dexCount(id) - miss.length, cash = G.state.cash, all = miss.reduce((a, c) => a + c.price, 0), top = miss.at(-1);
  const baseNote = base ? `普卡还缺 ${base} 张，只能开包收` : '';
  if (!top) return html`<small class="muted">闪卡齐了 · ${baseNote}</small>`;
  return html`<div class="btns"><button type="button" data-act="collect" data-id="${id}" ?disabled=${cash < miss[0].price} title="按市价从同行买，只收进图鉴册，不能再卖">补 ${miss[0].name} ${money(miss[0].price)}</button>
      ${miss.length > 1 ? html`<button type="button" data-act="collect" data-id="${id}" data-n="all" ?disabled=${cash < all}>闪卡全补 ${money(all)}</button>` : ''}</div>
    <small class="muted">闪卡还缺 ${miss.length} 张，最贵的是 ${top.name} ${money(top.price)}${baseNote ? ` · ${baseNote}` : ''}</small>`;
}

// 亲手开出: the same set counted only from packs you opened (bought cards don't count). What is left, by rarity, and the one that
// takes longest, in packs at today's 手气: the honest length of the line, not a promise.
const packsFmt = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n)).toLocaleString('en-US');
function handLine(id: string) {
  const h = G.handCount(id);
  if (G.handDone(id)) return html`<small class="master">一张没买，全是自己开的 · 名气 +${G.HAND_FAME}（开分店时拿）</small>`;
  if (!h && !G.master(id)) return nothing;
  const miss = G.handMissing(id), by: Record<string, number> = {};
  for (const c of miss) by[c.r] = (by[c.r] || 0) + 1;
  const left = Object.entries(by).sort((a, b) => (S.RANK[b[0]] ?? 0) - (S.RANK[a[0]] ?? 0)), top = miss[0];
  return html`<div class="dx-hand"><small class="muted">${h ? html`亲手开出还差 ${left.map(([r, n]) => `${r} ${n}`).join(' · ')}；最难的 ${top.name}（${top.r}）平均 ${packsFmt(top.packs)} 包出一张` : '亲手开出：补的不算，只数开包开出来的'} · 开齐：下次开分店名气 +${G.HAND_FAME}</small>
      ${G.unlocked(id) && huntable(id) ? html`<div class="btns"><button type="button" data-act="autorun" data-id="${id}" title="十包一轮自动开，出一张没亲手开出过的卡就停；仓库不够按进货价补">连开到出新卡</button></div>` : nothing}</div>`;
}

// the whole book under the pages: how far every set is pulled by hand
function handSum() {
  const h = SETS.reduce((a, s) => a + G.handCount(s.id), 0), tot = SETS.reduce((a, s) => a + G.dexTotal(s.id), 0), done = SETS.filter(s => G.handDone(s.id)).length;
  if (!h) return nothing;
  return html`<p class="dx-sum muted">亲手开出 <b>${h.toLocaleString('en-US')}/${tot.toLocaleString('en-US')}</b> 张（只数开包开出来的，补的不算）· 亲手开齐 ${done}/${SETS.length} 个系列，每套下次开分店名气 +${G.HAND_FAME} · 开分店、破产都不清零</p>`;
}

// the card up close: a native popover (Esc / tapping outside closes it)
function zoomed() {
  const c = zoom; if (!c) return nothing;
  const hits = at.tab === HITS, st = hits ? 'got' : has(c, hand(c.set)), copies = hand(c.set).get(c.n) || 0, odds = G.cardOdds(c.set, c.n);
  const how = st === 'got' ? `亲手开出 ${copies} 张` : st === 'bought' ? '补的：从同行按市价买的，只收进卡册，不能再卖' : '还没有';
  return html`${st === 'none' ? html`<span class="cf cf-big pk-ghost"><b>${c.n}</b>${mark({ kind: c.r, r: c.r }, false)}</span>` : face(c, 'big')}
    <div class="bk-zoom-t"><p class="bk-zoom-n">${c.name}</p>${cap(c, 'big')}
      <p class="muted">${G.setById(c.set).name} · ${c.n} 号${hits ? '' : ` · ${how}`}</p>
      ${odds > 0 ? html`<p class="muted">平均 ${packsFmt(1 / odds)} 包出一张（${rarLabel(c.kind)}）</p>` : nothing}</div>`;
}

export function renderBinder() {
  if (hold) return;
  looked();
  const ss = sets(), hits = G.state.hits.length > 0;
  if (!at.tab || (at.tab !== HITS && !ss.some(s => s.id === at.tab)) || (at.tab === HITS && !hits)) {
    const first = ss.find(s => !G.master(s.id)) || ss[0]; if (first) open(first.id); else if (hits) open(HITS);
  }
  const capped = G.crowdRaw() > G.CROWD_KNEE, tab = at.tab;
  render(html`<h2>卡册 · 图鉴 <span class="dx-total">回头客 +${Math.round(G.dexBonus() * 100)}%${capped ? html`<small class="muted" title="口碑客流（图鉴 × 新系列）叠加 ×${G.crowdRaw().toFixed(2)}，过 ×${G.CROWD_KNEE} 以后递减，上限 ×${+G.crowdCap().toFixed(2)}；成长页的店面扩建能抬上限，人气另算">（口碑客流实际 ×${G.crowdMult().toFixed(2)}，过 ×${G.CROWD_KNEE} 递减）</small>` : ''}</span></h2>
    <div class="bk-tabs" role="tablist" aria-label="卡册的系列">
      ${hits ? html`<button type="button" role="tab" class="bk-tab" aria-selected=${tab === HITS} data-bk-tab=${HITS}><span>战利品</span><small>最贵的 ${G.state.hits.length} 张</small></button>` : nothing}
      ${ss.map(s => html`<button type="button" role="tab" class="bk-tab ${sealOf(s.id)}" aria-selected=${tab === s.id} data-bk-tab=${s.id}>
        <img src=${logo(s.id)} alt="" loading="lazy"><span>${s.name}</span><small>${G.dexCount(s.id)}/${G.dexTotal(s.id)}${sealOf(s.id) ? ` · ${sealOf(s.id) === 'gold' ? '亲手开齐' : '大师套'}` : ''}${newTag(s.id)}</small></button>`)}
    </div>
    ${tab ? html`${spread(tab)}
      ${tab === HITS ? html`<div class="bk-head"><p class="muted">开出过最贵的 ${G.state.hits.length} 张 RR 以上，按开出时的市价从高到低。</p></div>` : head(tab)}` : html`<p class="muted">还没开过包。开出的每一张都会插进这本卡册。</p>`}
    ${handSum()}
    <div class="bk-zoom" id="bk-zoom" popover>${zoomed()}</div>`, $('dex'));
}

const newTag = (id: string) => { const n = freshOf(id).length; return n ? html` <i class="hand-new" aria-label="${n} 张新卡">新 ${n}</i>` : nothing; };

function go(page: number) { at.page = Math.max(0, page); at.shut = false; renderBinder(); }
export function initBinder() {
  const root = $('dex');
  let swiped = false; // the click that ends a swipe doesn't open the pocket under it
  root.addEventListener('click', e => {
    if (swiped) { swiped = false; return; }
    const b = (e.target as Element).closest<HTMLElement>('[data-bk-tab], [data-bk-pg], [data-bk-zoom], [data-bk-open], [data-bk-shut]'); if (!b) return;
    if (b.matches('[data-bk-open], [data-bk-shut]')) { at.shut = b.matches('[data-bk-shut]'); renderBinder(); }
    else if (b.dataset.bkTab) { open(b.dataset.bkTab); renderBinder(); root.querySelector('.bk-tab[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    else if (b.dataset.bkPg) go(+b.dataset.bkPg);
    else { zoom = pocketsOf(at.tab)[+b.dataset.bkZoom!]; renderBinder(); $('bk-zoom').showPopover(); }
  });
  root.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target as Element).closest('.bk-tabs, input')) return;
    e.preventDefault(); // ←/→ in the open binder turn its pages, so the menu cursor (menu.ts) leaves them alone
    go(at.page + (e.key === 'ArrowLeft' ? -span() : span()));
  });
  // a swipe across the open pages turns them (phones)
  let x0: number | null = null;
  root.addEventListener('pointerdown', e => { x0 = (e.target as Element).closest('.bk-spread') && e.pointerType !== 'mouse' ? e.clientX : null; });
  root.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) { swiped = true; setTimeout(() => { swiped = false; }); go(at.page + (dx > 0 ? -span() : span())); } });
  wide.addEventListener('change', renderBinder);
  addEventListener('hashchange', renderBinder);
  // 看卡册 in the pack summary (mat.ts): open the book on that set's new cards; #dex sits under 欧气检测, so scroll down to it
  // once layout.ts has shown the page (its route scrolls to the top first: it listened earlier)
  document.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLElement>('[data-bk-set]'); if (!a) return;
    e.preventDefault();
    addEventListener('hashchange', () => $('dex').scrollIntoView({ block: 'start' }), { once: true });
    location.hash = 'luck'; renderBinder(); open(a.dataset.bkSet!); renderBinder(); // the first render takes this visit's snapshot
  });
}
