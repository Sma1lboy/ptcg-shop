// 顾客 (#customers) and 店员 (#clerk) on the 货柜 page, 图鉴 (#dex) on the 欧气 page. Frozen while a pack is being revealed (dex progress would spoil the pull).
// 顾客 reads the last MISS_WINDOW of walk-ins (G.state.recent; 没买到 is G.missed, the shelf wall's count) by what they came for: pack buyers per set, each set with a price rail (every
// customer's ceiling against your tag), then the case browsers by the rarity they asked for. Each group says what to change.
import { html, render } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { SETS } from '../sets.ts';
import * as S from '../sim.ts';
import type { Visit } from '../game.ts';
import { G, $, money } from './common.ts';
import { hold } from './mat.ts';

const pc = (x: number) => `${Math.round(x * 100)}%`, MIN = G.MISS_WINDOW / 60;
const count = (vs: Visit[], r: string, why?: string) => vs.filter(v => v.r === r && (why === undefined || (v.why || '') === why)).length;
// "$9.80、$10.20" for a few, "$9.80–$11.40" for many
const spread = (xs: number[]) => { xs = [...xs].sort((a, b) => a - b); return xs.length > 3 ? `${money(xs[0])}–${money(xs.at(-1)!)}` : xs.map(money).join('、'); };
const tally = (parts: [string, number][]) => parts.filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ');

// The shelf-edge price rail, MIN_PCT…MAX_PCT of market in the shelf's PCT_STEP steps: one dot per customer, stacked on the step
// of the most they would pay (ink = buys at the tag as it is now), the flippers' zone along the low end, your yellow tag clipped on.
// The rail is also the price control: a see-through range input over it (whole percents, so steps match the shelf's clampPct),
// click a step or drag the tag and the shelf price moves there; arrow keys step by 5%.
const DOT = 7; // px per stacked dot
function priceRail(id: string, vs: Visit[], flip: number) {
  const steps = Math.round((G.MAX_PCT - G.MIN_PCT) / G.PCT_STEP), step = (p: number) => Math.min(steps, Math.max(0, Math.round((p - G.MIN_PCT) / G.PCT_STEP)));
  const at = (p: number) => `${step(p) / steps * 100}%`, pct = G.pctOf(id), mkt = G.sealedPrice(id), near = (p: number) => Math.abs(p - pct) < 0.13;
  const stack: number[] = [], dots = [...vs].sort((a, b) => a.max! - b.max!).map(v => ({ v, k: stack[step(v.max!)] = (stack[step(v.max!)] ?? -1) + 1 }));
  const buy = vs.filter(v => v.max! >= pct - 1e-9).length, h = Math.min(8, Math.max(2, ...Object.values(stack)) + 1) * DOT; // stack is sparse: Object.values skips the empty steps
  const lo = Math.round(G.MIN_PCT * 100), hi = Math.round(G.MAX_PCT * 100), at100 = Math.round(pct * 100);
  return html`<div class="c-rule" style="--h:${h}px" role="group" aria-label="${vs.length} 位顾客最多肯出 ${spread(vs.map(v => v.max! * mkt))}，你标 ${money(G.ask(id))}，其中 ${buy} 位会买">
      <input class="c-set" type="range" min="${lo}" max="${hi}" step="${Math.round(G.PCT_STEP * 100)}" .value=${live(String(at100))} data-id="${id}"
        aria-label="${G.setById(id).name}标价" aria-valuetext="${money(G.ask(id))}，市价的 ${at100}%，${buy} 位会买">
      ${flip ? html`<span class="c-flip" style="width:${at(flip)}"></span>` : ''}<span class="c-mkt" style="left:${at(1)}"></span>
      ${dots.map(({ v, k }) => html`<i class=${v.max! >= pct - 1e-9 ? 'buy' : ''} style="left:${at(v.max!)};bottom:calc(100% - var(--h) + ${Math.min(k, 7) * DOT}px)" title="最多肯出 ${money(v.max! * mkt)}（市价的 ${pc(v.max!)}）"></i>`)}
      <span class="sticker" style="left:clamp(26px, ${(pct - G.MIN_PCT) / (G.MAX_PCT - G.MIN_PCT) * 100}%, calc(100% - 26px))">${money(G.ask(id))}</span>
      ${flip && !near(G.MIN_PCT + 0.08) ? html`<small class="c-lo">倒爷 ≤${pc(flip)}</small>` : ''}${near(1) ? '' : html`<small class="c-m" style="left:${at(1)}">市价</small>`}
    </div>`;
}

function packs(rec: Visit[]) {
  const openers = rec.filter(v => v.t === 'opener'), flippers = rec.filter(v => v.t === 'flipper'), s = G.state;
  const flip = Math.max(0, ...flippers.map(v => v.max!)), racks = G.shelves(), free = racks.some(r => !r.id);
  const ids = SETS.map(x => x.id).filter(id => G.unlocked(id) && (racks.some(r => r.id === id) || G.missed(id) || openers.some(v => v.set === id)));
  if (!ids.length) return '';
  return html`<h3 class="c-h">来买整包的 <small>一个点是一位顾客最多肯出的价：实的按现在的标价会买，淡的不会。点轨上哪一档，标价就改到哪一档</small></h3>
    <ul class="c-sets">${ids.map(id => {
      const mine = openers.filter(v => v.set === id), missed = G.missed(id), sold = count(mine, 'sold');
      const dear = mine.filter(v => v.r === 'pricey' && !v.why), broke = count(mine, 'pricey', 'budget');
      const swept = flippers.filter(v => v.set === id && v.r === 'sold' && v.n), sweptN = swept.reduce((a, v) => a + v.n!, 0);
      const racked = racks.some(r => r.id === id), shelf = G.shelfQty(id), stock = s.stock[id] || 0, mkt = G.sealedPrice(id), name = G.setById(id).name;
      // the notes read the rail: who would balk at the tag as it is now (it may have moved since they came), and who would still buy
      const pct = G.pctOf(id), faint = mine.filter(v => v.max! < pct - 1e-9).map(v => v.max! * mkt), low = Math.min(...mine.map(v => v.max!));
      // what would put the set back on sale: the same moves the shelf above offers
      const refill = stock ? html`<button type="button" data-act="shelve" data-id="${id}" data-n="999">${racked ? '补满' : '摆上空货架'}</button>`
        : html`<button type="button" data-act="buy" data-id="${id}" data-n="10" ?disabled=${s.cash < G.wholesale(id) * 10}>进 10 包</button>`;
      const clerk = racked && !stock && G.lvl('clerk') && s.auto[id], act = missed && !shelf && (racked || free) && !clerk ? refill : '';
      const fix = !missed || shelf ? '' : clerk ? '，店员下一轮进货' : racked || free ? `，仓库${stock ? `还有 ${stock} 包` : '也没有'}` : '，货架都摆着别的系列：在上面换一个，或者加一个货架';
      const notes = [
        missed ? html`<b>${MIN} 分钟里 ${missed} 位没买到</b>${shelf ? '（货架空着的时候）' : racked ? '：货架卖空了' : '：没摆上货架'}${fix}` : '',
        faint.length ? html`按现在的标价 ${money(G.ask(id))}，<b>${faint.length} 位会嫌贵</b>（他们最多肯出 ${spread(faint)}）` : '',
        broke ? `${broke} 位身上的钱不够一包` : '',
        sweptN || pct <= flip ? `${sweptN ? `倒爷扫走 ${sweptN} 包` : '倒爷会来扫货'}：标价在市价的 ${pc(flip)} 以下，他们整架地收` : '',
        !mine.length && !missed && shelf ? `${MIN} 分钟里没有人专门来买${name}${(s.heat[id] || 1) < 1 ? '（滞销）' : ''}` : '',
        mine.length >= 3 && !faint.length && low > pct + 0.05 ? `按现在的标价都会买，最低的一位也肯出 ${money(low * mkt)}` : '',
      ].filter(Boolean);
      return html`<li>
          <div class="c-row"><b>${name}</b><span class="muted">${racked ? `货架 ${shelf} 包` : '没上架'}</span>
            <span class="c-n">${tally([['来买', mine.length + openers.filter(v => v.miss === id).length], ['买走', sold], ['嫌贵', dear.length + broke], ['没买到', missed], ['倒爷', swept.length]]) || '没人来'}</span></div>
          ${mine.length ? priceRail(id, mine, flip) : ''}
          ${notes.length ? html`<p class="c-note">${notes.map((n, i) => html`${i ? '；' : ''}${n}`)}。${act}</p>` : ''}
        </li>`;
    })}</ul>`;
}

// What seekers of each rarity tier and collectors asked the case for, and the hit on hand that would answer them.
function showcase(rec: Visit[]) {
  const s = G.state, full = s.shown.length >= G.slots(), mine = Object.entries(s.singles).filter(([, c]) => S.HITS.includes(c.kind));
  const rows = [...G.SEEK.map((kinds, tier) => ({ label: `找 ${kinds.join('/')}`, vs: rec.filter(v => v.t === 'seeker' && v.tier === tier), fit: (c: { kind: string; price: number }) => kinds.includes(c.kind) })),
    { label: `收藏党（$${G.BIG_CARD} 以上）`, vs: rec.filter(v => v.t === 'collector'), fit: (c: { kind: string; price: number }) => c.price >= G.BIG_CARD }].filter(r => r.vs.length);
  if (!rows.length) return '';
  if (!s.shown.length && !rows.some(r => mine.some(([, c]) => r.fit(c))))
    return html`<h3 class="c-h">来翻展示柜的</h3><p class="c-note c-empty"><b>柜里空着</b>：${rows.map(r => `${r.label} ${r.vs.length} 人`).join('、')}，都空手走了。开包开出闪卡，在单卡库存里点「上柜」。</p>`;
  return html`<h3 class="c-h">来翻展示柜的</h3>
    <ul class="c-case">${rows.map(({ label, vs, fit }) => {
      const none = count(vs, 'none'), dear = vs.filter(v => v.r === 'pricey' && v.why !== 'budget'), broke = count(vs, 'pricey', 'budget');
      const have = none ? mine.filter(([, c]) => fit(c)).sort((a, b) => b[1].price - a[1].price)[0] : undefined;
      const byCard = [...new Set(dear.map(v => v.card!))].map(card => { const d = dear.filter(v => v.card === card); return html`<b>${card}</b> 标 ${money(d[0].pct! * d[0].price!)}，${d.length} 人嫌贵，最多肯出 ${spread(d.map(v => v.max! * v.price!))}`; });
      const notes = [
        none ? (have ? `柜里没有，单卡库存里有 ${have[1].name}` : s.shown.length ? '柜里没有，开包出了再上柜' : '柜里空着，开包出了闪卡再上柜') : '',
        ...byCard, broke ? `${broke} 人看中了但钱不够` : '',
      ].filter(Boolean);
      return html`<li><div class="c-row"><b>${label}</b><span class="c-n">${tally([['来了', vs.length], ['买走', count(vs, 'sold')], ['嫌贵', dear.length + broke], ['没找到', none]])}</span></div>
          ${notes.length ? html`<p class="c-note">${notes.map((n, i) => html`${i ? '；' : ''}${n}`)}。${have && !full ? html`<button type="button" data-act="list" data-key="${have[0]}">上柜</button>` : have ? html`<span class="muted">展示柜满了</span>` : ''}</p>` : ''}</li>`;
    })}</ul>`;
}

function customers() {
  const since = Date.now() - G.MISS_WINDOW * 1000, rec = G.state.recent.filter(v => v.at > since), n = rec.length; // the shelf wall's window
  if (!n) return html`<h2>顾客</h2><p class="muted">${G.state.cust.visits ? `${MIN} 分钟里还没有顾客进门。` : '还没有顾客来过。先把货上架。'}</p>`;
  const [sold, pricey, none] = ['sold', 'pricey', 'none'].map(r => count(rec, r));
  return html`<h2>顾客 <small class="c-meta">${MIN} 分钟里来了 ${n} 位 · 每分钟约 ${(G.rate() * 60).toFixed(1)} 位</small></h2>
      <div class="cust-bar" role="img" aria-label="${MIN} 分钟里 ${n} 位顾客：买走 ${sold}，嫌贵 ${pricey}，没找到 ${none}">
        <span class="c-sold" style="flex:${sold}"></span><span class="c-pricey" style="flex:${pricey}"></span><span class="c-none" style="flex:${none}"></span></div>
      <p class="cust-sum"><b>买走 ${sold}</b> · 嫌贵 ${pricey} · <span class="muted">没找到 ${none}</span></p>
      ${packs(rec)}${showcase(rec)}`;
}

function dex() {
  return SETS.filter(s => G.unlocked(s.id)).map(s => {
    const c = G.dexCount(s.id), tot = G.dexTotal(s.id), share = c / tot, next = G.DEX_TIERS.find(([at]) => share < at - 1e-9);
    const need = next ? Math.ceil(next[0] * tot - 1e-9) - c : 0;
    return html`<li><div class="dx-h"><span>${s.name}</span><b>${c}/${tot}</b></div>
        <div class="dx-bar" role="img" aria-label="${s.name} 图鉴 ${Math.round(share * 100)}%"><i style="width:${share * 100}%"></i>${G.DEX_TIERS.map(([at]) => html`<u style="left:${at * 100}%"></u>`)}</div>
        <small class="muted">${next ? `再收 ${need} 张到 ${next[0] * 100}%：回头客 +${next[1] * 100}%` : '已收齐'} · 现有加成 +${Math.round(G.dexBonusOf(s.id) * 100)}%</small>${collect(s.id)}</li>`;
  });
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

function clerk() {
  if (!G.lvl('clerk')) return html`<p class="muted">店员（店铺升级里）每 ${G.CLERK_ROUND / 60} 分钟巡一次货架，自动进货补上，你不在线也照样补。</p>`;
  return html`<ul class="auto">${SETS.filter(s => G.unlocked(s.id)).map(s =>
    html`<li><label><input type="checkbox" data-act="auto" data-id="${s.id}" .checked=${!!G.state.auto[s.id]}> ${s.name}</label></li>`)}</ul>
      <p class="muted">勾选的系列，店员给它的货架补货；钱不够就少买。</p>`;
}

function renderGoals() {
  if (hold) return;
  render(customers(), $('customers'));
  render(html`<h2>图鉴 · 口碑 <span class="dx-total">回头客 +${Math.round(G.dexBonus() * 100)}%</span></h2><ul class="dex">${dex()}</ul>`, $('dex'));
  render(html`<h2>店员 · 自动进货</h2>${clerk()}`, $('clerk'));
}

export function initGoals() {
  document.addEventListener('change', e => { const b = (e.target as Element).closest<HTMLInputElement>('[data-act="auto"]'); if (b) G.setAuto(b.dataset.id!, b.checked); });
  document.addEventListener('input', e => { const r = e.target as HTMLInputElement; if (r.matches?.('.c-set')) G.setPrice(r.dataset.id!, +r.value / 100); });
  document.addEventListener('ptcg:release', renderGoals);
  G.on(renderGoals); renderGoals();
}
