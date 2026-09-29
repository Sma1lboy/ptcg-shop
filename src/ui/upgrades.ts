// 成长 page, part 1: the incremental loop at a glance — shop level, the next thing cash can buy, what growth has bought so far,
// and the next set that lifetime revenue unlocks — then the 成长树: every upgrade and skill as a node on one of four lines.
// A node shows its badge ringed with its levels, current → next effect, and until it is affordable a bar filling toward the price.
import { html, render } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, pips, logoUrl } from './common.ts';
import { odds } from './skills.ts';

const moneyOf = money;

// What each upgrade level does, in the same words as the skills' fx (display only; the numbers are game.ts's).
const UFX: Record<string, (lv: number) => string> = {
  signage: lv => `肯多付 +${Math.round(G.SIGN_STEP * 100 * lv)}%`,
  racks: lv => `${G.RACK_BASE + lv} 个货架`,
  depth: lv => `每架 ${G.DEPTH_BASE + G.DEPTH_STEP * lv} 包`,
  case: lv => `${G.CASE_BASE + G.CASE_STEP * lv} 个柜位`,
  supplier: lv => `进货打 ${+((G.WHOLESALE - G.WHOLESALE_STEP * lv) * 10).toFixed(1)} 折`,
  expand: lv => `口碑上限 ×${+(G.CROWD_KNEE + G.CROWD_ROOM + G.ROOM_STEP * lv).toFixed(2)}`, // the tile shows walk-ins instead (fxOf); this is the 目标 line's words when blocked
  clerk: lv => ['没有店员', '巡货架，补到半满', '补满，卖散卡'][lv],
};

// 人气 and 扩建 both move walk-ins (人气 outside the 客流上限, 扩建 by lifting it): their pockets show the walk-ins a level really
// gives (G.peek), the others their own words, which are exact.
const perMin = (r: number) => `进店 ${(r * 60).toFixed(1)} 人/分`;
export function fxOf(k: string, lv: number, words: (lv: number) => string): [string, string] {
  return k === 'crowd' || k === 'expand' ? [perMin(G.rate()), perMin(G.peek(k, G.rate))] : [words(lv), words(lv + 1)];
}

// When a cash buy would leave less than the bill 九姐 collects next (paid from the till), or less than the clerk needs for a round
// (he buys with what is in the till: a buy just before his round leaves the shelves bare until the next one), say it before the click.
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function billNote(cost: number) {
  const b = G.nextBill(), cash = G.state.cash, left = cash - cost, clerk = G.clerkBudget();
  const bill = b && left < b.amount, stock = left < clerk;
  if (cash < cost || (!bill && !stock)) return '';
  return html`<p class="gt-bill">买完剩 ${moneyOf(left)}${bill ? html`，${G.state.overdue ? '逾期的账' : `${clock(Math.max(0, G.dueIn()))} 后九姐来收`} ${moneyOf(b!.amount)}` : ''}${stock
    ? html`${bill ? '；' : '，'}店员一轮补满货架要约 ${moneyOf(clerk)}，钱不够的货架空着等下一轮` : ''}</p>`;
}

// 退回: this week's buy of k at G.REFUND of its price, while the till can't cover the bill (G.refundable). The ledger lists the same buttons.
export const refundBtn = (k: string, name: string, lv: number, cost: number, note = true) =>
  html`<p class="gt-back"><button type="button" data-act="refund" data-k="${k}">退回 ${name} Lv ${lv} · 拿回 ${moneyOf(cost * G.REFUND)}</button>${note ? html`<small>这周买的，账不够付时可以退，扣一成</small>` : ''}</p>`;

// One upgrade, skill or 名气 perk pocket. fx = what the current / next level does. have / price = what pays for it (cash by default).
export function tile(o: { name: string; tag?: string; desc: string; lv: number; max: number; cost: number | null | undefined; fx?: [string, string]; act: string; k: string; blocked?: string; have?: number; price?: (v: number) => string }) {
  const cash = o.have ?? G.state.cash, money = o.price ?? moneyOf, done = o.cost == null, can = !done && !o.blocked && cash >= o.cost!;
  const free = o.have != null || o.cost! <= G.spare(), back = o.have == null && G.refundable().find(x => x.k === o.k); // 名气 perks: no bill, no 退回
  return html`<li class="gtile ${done ? 'max' : can && free ? 'can' : ''}">
      <p class="gt-top"><b>${o.name}</b>${o.tag ? html`<small>${o.tag}</small>` : ''}<span class="gt-lv">Lv ${o.lv}<small>/${o.max}</small></span></p>
      ${pips(o.lv, o.max)}
      ${o.fx ? html`<p class="gt-fx">${done ? o.fx[0] : html`${o.fx[0]} <span aria-hidden="true">→</span> <b>${o.fx[1]}</b>`}</p>` : ''}
      <p class="gt-desc">${o.desc}</p>
      ${done ? html`<p class="gt-done">满级</p>` : o.blocked ? html`<p class="gt-done">${o.blocked}</p>`
        : html`<div class="gt-buy"><button type="button" data-act="${o.act}" data-k="${o.k}" ?disabled=${!can}><span class="gb-lv">升到 Lv ${o.lv + 1} · </span>${money(o.cost!)}</button>
          ${can ? (o.have == null ? billNote(o.cost!) : '') : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / o.cost! * 100)}%"><i style="width:${Math.min(100, cash / o.cost! * 100)}%"></i></span><small>还差 ${money(o.cost! - cash)}</small>`}</div>`}
      ${back ? refundBtn(back.k, o.name, o.lv, back.cost) : ''}
    </li>`;
}

// An empty pocket to finish the last row of a two-column binder page (hidden when pockets are rows, on phones).
export const pad = (n: number) => n % 2 ? html`<li class="gtile empty" aria-hidden="true"></li>` : '';

// Everything cash can level, as one list: the goal the header points at is the cheapest of these.
function buyables() {
  return [
    ...Object.entries(G.UPGRADES).filter(([k]) => G.canUpgrade(k)).map(([k, u]) => ({ k, act: 'up', name: u.name, lv: G.lvl(k), cost: G.upgradeCost(k), fx: fxOf(k, G.lvl(k), UFX[k]) })),
    ...Object.entries(G.SKILLS).filter(([k]) => G.canLearn(k)).map(([k, s]) => ({ k, act: 'learn', name: s.name, lv: G.skill(k), cost: G.skillCost(k), fx: fxOf(k, G.skill(k), s.fx) })),
  ].filter(b => b.cost != null) as { k: string; act: string; name: string; lv: number; cost: number; fx: [string, string] }[];
}

// The header's 下一步, by rule rather than just the cheapest: a shelf while an unlocked set has none to go on; otherwise the
// cheapest level that changes the running shop. 看店 only pays someone who closes the page and 手气 only someone who opens packs,
// and 人气 / 扩建 under 2% more walk-ins are left out; those come back only when nothing else is left.
const MIN_TRAFFIC = 0.02;
function nextStep() {
  const all = buyables().sort((a, b) => a.cost - b.cost);
  if (SETS.filter(s => G.unlocked(s.id)).length > G.racks()) { const r = all.find(b => b.k === 'racks'); if (r) return { ...r, why: '有解锁的系列还没有货架摆' }; }
  const gain = (k: string) => G.peek(k, G.rate) / G.rate() - 1;
  const live = all.filter(b => b.k !== 'watch' && b.k !== 'luck' && !((b.k === 'crowd' || b.k === 'expand') && gain(b.k) < MIN_TRAFFIC));
  return { ...(live[0] || all[0]), why: '' };
}

// 名气 one more takes, and roughly how long this shop needs for it at its best week's pace (a week is G.WEEK seconds).
function fameAhead() {
  const fame = G.fameFor(), rev = G.revenue(), more = (fame + 1) ** 2 * G.FAME_UNIT - rev, perH = G.state.best * 3600 / G.WEEK;
  return { fame, more, hours: perH > 0 ? more / perH : null };
}
const hrs = (h: number) => h < 1 ? `${Math.max(1, Math.round(h * 60))} 分钟` : `${+h.toFixed(h < 10 ? 1 : 0)} 小时`;
export const nextStreet = () => G.street(G.state.branch.n + 1);

// The header's 下一步 once the debt is paid: 开分店 is the move (a new shop takes about as long as one more 名气 here, and pays several).
function branchGoal() {
  const { fame, more, hours } = fameAhead(), take = fame + G.handFame(), st = nextStreet();
  return html`<div class="gh-goal">
    <p class="gg-k">下一步：这家店还清了</p>
    <p class="gg-what"><b>开第 ${G.state.branch.n + 2} 家店 · ${st.name}</b><span>带走 <b>${take} 名气</b></span></p>
    <button type="button" class="primary" data-act="branch">${armedNow() ? '再点一次：关掉这家店，去开分店' : `开分店 · 带走 ${take} 名气`}</button>
    <small>留在这里：再做 ${money(more)} 营业额才多 1 名气${hours != null ? `，按最好一周的生意约 ${hrs(hours)}` : ''}。</small>
  </div>`;
}

// Short money for the milestone track on phones, where seven thresholds share the width.
const kMoney = (v: number) => v >= 1000 ? `$${v / 1000}k` : `$${v}`;

// 营业额 milestones: each later set unlocks at a lifetime revenue. The track fills segment by segment between thresholds.
function milestones() {
  const rev = G.revenue(), at = SETS.map(s => G.unlockAt(s.id)), next = SETS.find(s => !G.unlocked(s.id));
  return html`<section class="mile" aria-labelledby="mile-h">
    <h2 id="mile-h">营业额解锁新系列 <small>累计营业额 ${money(rev)}</small></h2>
    <ol class="mile-track" style="--n:${SETS.length}">${SETS.map((s, i) => {
      const got = rev >= at[i], fill = i === 0 ? 1 : Math.max(0, Math.min(1, (rev - at[i - 1]) / (at[i] - at[i - 1] || 1)));
      return html`<li class="${got ? 'got' : s === next ? 'next' : ''}" style="--f:${fill}">
        <img src="${logoUrl(s.id)}" alt="" loading="lazy"><b>${s.name}</b><small>${at[i] ? html`<span class="m-full">$${at[i].toLocaleString('en-US')}</span><span class="m-short">${kMoney(at[i])}</span>` : '开店就有'}</small></li>`;
    })}</ol>
    <p class="mile-next">${next ? html`下一个：<b>${next.name}</b>，还差 ${money(G.unlockAt(next.id) - rev)} 营业额（卖出的整包和单卡都算）` : '七个系列都解锁了。'}</p>
  </section>`;
}

// 闲钱 under 下一步: what is free to spend once the next bill is set aside — the number the 成长 badge counts with.
function spareLine() {
  const b = G.state.overdue ?? G.nextBill(); if (!b) return '';
  return html`<p class="gg-spare">闲钱 <b>${money(G.spare())}</b><span>现金 ${money(G.state.cash)} − ${G.state.overdue ? '逾期的账' : `第 ${b.week} 周的账`} ${money(b.amount)}。升级先用闲钱，账单的钱留着</span></p>`;
}

export function renderUpgrades() {
  const ups = Object.entries(G.UPGRADES), sks = Object.entries(G.SKILLS), cash = G.state.cash;
  const lv = ups.reduce((a, [k]) => a + G.lvl(k), 0) + sks.reduce((a, [k]) => a + G.skill(k), 0);
  const max = ups.reduce((a, [, u]) => a + u.costs.length, 0) + sks.reduce((a, [k]) => a + G.skillMax(k), 0);
  const goal = nextStep();
  render(html`<header class="grow-head">
      <div class="gh-lv"><p class="gh-shop">第 ${G.state.branch.n + 1} 家店${G.state.branch.got ? html` · 名气 <b>${G.state.branch.fame}</b> 没花` : ''}</p><p><span>店铺等级</span><b>Lv ${lv}</b><small>/ ${max}</small></p>
        <span class="gh-bar" role="img" aria-label="${lv}/${max}"><i style="--p:${lv / max}"></i></span></div>
      ${G.canBranch() ? branchGoal() : goal ? html`<div class="gh-goal">
        <p class="gg-k">${cash >= goal.cost ? (goal.cost <= G.spare() ? '下一步，现在就能升' : '下一步，钱够但要动账单的钱') : '下一步'}${goal.why ? `：${goal.why}` : ''}</p>
        <p class="gg-what"><b>${goal.name} Lv ${goal.lv + 1}</b><span>${goal.fx[0]} → <b>${goal.fx[1]}</b></span></p>
        ${cash >= goal.cost ? html`<button type="button" data-act="${goal.act}" data-k="${goal.k}">升级 · ${money(goal.cost)}</button>${billNote(goal.cost)}`
          : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / goal.cost * 100)}%"><i style="width:${cash / goal.cost * 100}%"></i></span>
            <small>${money(cash)} / ${money(goal.cost)}，还差 ${money(goal.cost - cash)}</small>`}
        ${spareLine()}
      </div>` : html`<p class="gh-goal gg-k">都升满了。</p>`}
      <dl class="gh-now">
        <div><dt>进店</dt><dd>${(G.rate() * 60).toFixed(1)} 人/分</dd></div>
        <div><dt>口碑客流</dt><dd>×${G.crowdMult().toFixed(2)}${G.crowdRaw() > G.CROWD_KNEE ? `（叠加 ×${G.crowdRaw().toFixed(2)}，上限 ×${+G.crowdCap().toFixed(2)}）` : ''}</dd></div>
        <div><dt>进货价</dt><dd>市价打 ${+(G.wholesaleRate() * 10).toFixed(1)} 折</dd></div>
        <div><dt>货架</dt><dd>${G.racks()} × ${G.depth()} 包</dd></div>
        <div><dt>展示柜</dt><dd>${G.slots()} 格</dd></div>
        <div><dt>手气</dt><dd>×${G.luckMult().toFixed(2)}</dd></div>
        ${G.perk('regulars') ? html`<div><dt>老主顾</dt><dd>基础客流 +${Math.round(G.REG_STEP * 100 * G.perk('regulars'))}%</dd></div>` : ''}
        <div><dt>打烊结算</dt><dd>${G.offlineCap() / 3600} 小时</dd></div>
      </dl>
    </header>
    ${milestones()}`, $('grow-top'));
  renderBranch();
  render(tree(G.canBranch() ? undefined : goal?.k), $('upgrades'));
}

// ---------- 成长树 ----------
// Four lines by what they change in the shop. A line's rail is the 营业额 track's ink rail: it fills up to the last node with a
// level, so it reads how far down that line you are — not an order to buy in. The only real prerequisites (带徒弟 needs 店员,
// 扩建 needs 口碑客流 at G.CROWD_KNEE) are locked nodes that say what opens them.
const LINES = [
  { name: '货架', say: '摆几个系列、每架多少包、进货多便宜', ks: ['racks', 'depth', 'supplier'] },
  { name: '客人', say: '进来多少人、肯付多少', ks: ['signage', 'talk', 'crowd', 'expand'] },
  { name: '店员', say: '你不在柜台时谁看店', ks: ['clerk', 'apprentice', 'watch'] },
  { name: '柜台', say: '单卡的柜位，和你自己开包的手气', ks: ['case', 'luck'] },
];

interface Node { k: string; act: string; name: string; desc: string; lv: number; max: number; cost: number | undefined; fx: [string, string]; end: string; blocked: string; gate?: [number, number] }
function nodeOf(k: string): Node {
  if (k in G.UPGRADES) {
    const u = G.UPGRADES[k], lv = G.lvl(k), ok = G.canUpgrade(k);
    return { k, act: 'up', name: u.name, desc: u.desc, lv, max: u.costs.length, cost: G.upgradeCost(k), fx: ok ? fxOf(k, lv, UFX[k]) : [UFX[k](lv), UFX[k](lv + 1)], end: UFX[k](u.costs.length),
      blocked: ok ? '' : `口碑客流（图鉴 × 新系列）到 ×${G.CROWD_KNEE} 才能扩建`, gate: ok ? undefined : [G.crowdRaw(), G.CROWD_KNEE] };
  }
  const sk = G.SKILLS[k], lv = G.skill(k), max = G.skillMax(k);
  return { k, act: 'learn', name: sk.name, desc: sk.desc, lv, max, cost: G.skillCost(k), fx: fxOf(k, lv, sk.fx), end: sk.fx(max), blocked: G.canLearn(k) ? '' : '先雇店员（店员 Lv 1）才能学' };
}

// The moment a level lands: its node stamps (badge pops, the new ring segment lights) for UP_MS, and sound.ts plays the stamp.
// Tracked here by level rather than by click, so the ledger's buttons and 下一步 in the header stamp the node too.
const UP_MS = 1200, seen = new Map<string, number>(), upAt = new Map<string, number>();
function popped(k: string, lv: number) {
  const was = seen.get(k), now = performance.now(); seen.set(k, lv);
  if (was != null && lv > was) { upAt.set(k, now); document.dispatchEvent(new CustomEvent('ptcg:bought', { detail: k })); }
  return now - (upAt.get(k) ?? -1e9) < UP_MS;
}

function node(n: Node, next: string | undefined, lit: boolean) {
  const cash = G.state.cash, done = n.cost == null, can = !done && !n.blocked && cash >= n.cost!, free = can && n.cost! <= G.spare();
  const back = G.refundable().find(x => x.k === n.k), up = popped(n.k, n.lv);
  const st = done ? 'max' : n.blocked ? 'lock' : n.lv ? 'own' : 'new';
  return html`<li class="tn ${st}${free ? ' can' : ''}${n.k === next ? ' next' : ''}${up ? ' up' : ''}${lit ? ' lit' : ''}" style="--lv:${n.lv};--max:${n.max}">
    <span class="tn-badge" style="--i:url(gen/u-${n.k}.webp)" role="img" aria-label="${n.name} Lv ${n.lv}/${n.max}${done ? '，满级' : n.blocked ? '，锁着' : ''}"></span>
    <p class="tn-top"><b>${n.name}</b><span class="gt-lv">Lv ${n.lv}<small>/${n.max}</small></span>${n.k === next ? html`<small class="tn-next">下一步</small>` : ''}</p>
    <p class="gt-fx">${done ? n.fx[0] : html`${n.fx[0]} <span aria-hidden="true">→</span> <b>${n.fx[1]}</b>`}</p>
    <p class="gt-desc">${n.desc}</p>
    ${done ? html`<p class="gt-done">满级</p>` : n.blocked ? html`<div class="gt-buy gt-lock"><small>${n.blocked}</small>${n.gate ? html`<span class="gt-save" role="img" aria-label="口碑 ×${n.gate[0].toFixed(2)} / ×${n.gate[1]}"><i style="width:${Math.min(100, n.gate[0] / n.gate[1] * 100)}%"></i></span><small>现在 ×${n.gate[0].toFixed(2)} · 首级 ${money(n.cost!)}</small>` : ''}</div>`
      : html`<div class="gt-buy"><button type="button" data-act="${n.act}" data-k="${n.k}" ?disabled=${!can}><span class="gb-lv">升到 Lv ${n.lv + 1} · </span>${money(n.cost!)}</button>
        ${can ? billNote(n.cost!) : html`<span class="gt-save" role="img" aria-label="攒了 ${Math.round(cash / n.cost! * 100)}%"><i style="width:${Math.min(100, cash / n.cost! * 100)}%"></i></span><small>还差 ${money(n.cost! - cash)}</small>`}</div>`}
    ${back ? refundBtn(back.k, n.name, n.lv, back.cost) : ''}
  </li>`;
}

function tree(next?: string) {
  return html`<h2>成长树 <small>四条线，每一项是一个徽章，外圈一格一级</small></h2>
    <div class="tree">${LINES.map(l => {
      const ns = l.ks.map(nodeOf), lv = ns.reduce((a, n) => a + n.lv, 0), max = ns.reduce((a, n) => a + n.max, 0);
      const reach = ns.reduce((a, n, i) => n.lv ? i : a, -1); // the rail is inked from the first node down to the last one with a level
      return html`<section class="t-line" aria-label="${l.name}线">
        <h3>${l.name}线 <small>${lv}/${max} 级</small></h3>
        <p class="tl-say">${l.say}</p>
        <ol>${ns.map((n, i) => node(n, next, i < reach))}</ol>
        <p class="tl-end"><b>${lv === max ? '走到头了' : '走到头'}</b>${ns.map(n => n.end).join(' · ')}</p>
        ${l.ks.includes('luck') ? odds() : ''}
      </section>`;
    })}</div>`;
}

// 开分店 restarts the shop, so it takes two clicks within 3 s, like 清空存档.
let armed = 0;
const armedNow = () => Date.now() - armed < 3000;
export function branchClick() {
  if (armedNow()) { armed = 0; G.branch(); return; }
  armed = Date.now(); renderUpgrades(); setTimeout(renderUpgrades, 3100); // the header's 开分店 and the panel's both say 再点一次
}

// A street's per-set tilt in words: which sets draw more (or fewer) pack buyers there than on 老街.
function streetSets(st: ReturnType<typeof G.street>) {
  const by = (up: boolean) => Object.entries(st.sets!).filter(([, x]) => x.w != null && (x.w > 1) === up).map(([id]) => G.setById(id).name).join('、');
  const up = by(true), down = by(false);
  return [up && `${up} 来的人多`, down && `${down} 来的人少`].filter(Boolean).join('；');
}

// 开分店 (prestige): how far this shop is from the gate, what branching now would pay, what carries over, and the 名气 perks.
function renderBranch() {
  const b = G.state.branch, rev = G.revenue(), d0 = G.debt0(), paid = Math.max(0, Math.min(1, 1 - G.state.debt / d0)), can = G.canBranch(), fame = G.fameFor(), hand = G.handFame();
  const nextAt = (fame + 1) ** 2 * G.FAME_UNIT, perks = Object.entries(G.PERKS), pts = (v: number) => `${v} 名气`;
  const here = G.street(), there = nextStreet();
  render(html`<h2>开分店 <small>${b.n ? `第 ${b.n + 1} 家店在${here.name} · 前 ${b.n} 家店营业额 ${money(b.life)} · 共得名气 ${b.got}` : '把欠九姐的钱还清，这家店就是你的；她会出本钱让你去别的街口再开一家'}</small></h2>
    <div class="br-now">
      <div class="br-prog">
        <p><span>这家店的债</span> <b>${can ? '还清了' : `还欠 ${money(G.state.debt)}`}</b> <small>/ ${money(d0)}</small></p>
        <span class="gh-bar" role="img" aria-label="已还 ${Math.round(paid * 100)}%"><i style="--p:${paid}"></i></span>
        <p class="br-say">${can ? html`现在开分店能带走 <b>${pts(fame + hand)}</b>（本店营业额 ${money(rev)}${hand ? `，加亲手开齐的 ${hand}` : ''}）；多做 ${money(nextAt - rev)} 营业额就是 ${pts(fame + 1)}（名气 = √(营业额 ÷ ${G.FAME_UNIT.toLocaleString('en-US')})，越往后越慢）。下一家店欠 ${money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * (b.n + 1))))}。`
          : html`按现在的营业额（${money(rev)}），还清时能带走至少 ${pts(fame)}。破产的店一点名气都没有。`}${!can && hand ? ` 另有亲手开齐的 ${pts(hand)}等着：开分店时一起拿，破产也不丢。` : ''}</p>
      </div>
    <div class="br-go">
        <p class="br-street"><b>下一家在${there.name}</b>${there.say}${there.sets ? html`<small>${streetSets(there)}</small>` : ''}</p>
        <p class="br-keep"><b>带走</b>卡册和展示柜里的卡、图鉴、成就、欧气检测的全部记录、名气</p>
        <p class="br-keep"><b>留下</b>现金、仓库和货架上的包、店铺升级、技能、营业额（后面的系列要重新解锁）</p>
        <button type="button" data-act="branch" ?disabled=${!can}>${!can ? '开分店（先还清债）' : armedNow() ? '再点一次：关掉这家店，去开分店' : `开分店 · 带走 ${pts(fame + hand)}`}</button>
      </div>
    </div>
    ${b.got ? html`<h3 class="br-h">名气 <small>永久加成，每家新店都有 · 手上 ${pts(b.fame)}</small></h3>
    <ul class="grow-grid">${perks.map(([k, p]) => { const lv = G.perk(k); return tile({ name: p.name, tag: p.group, desc: p.desc, lv, max: p.max, cost: G.perkCost(k), fx: [p.fx(lv), p.fx(lv + 1)], act: 'perk', k, have: b.fame, price: pts }); })}${pad(perks.length)}</ul>`
    : html`<p class="br-first">开了第一家分店以后，名气能买这些永久加成：${perks.map(([, p], i) => html`${i ? '、' : ''}<b>${p.name}</b>（${p.fx(p.max)}）`)}。每项都有上限。</p>`}`, $('branch'));
}
