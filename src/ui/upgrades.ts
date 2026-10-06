// 成长 page, part 1: the incremental loop at a glance — shop level, the next thing cash can buy, what growth has bought so far,
// and the next set that lifetime revenue unlocks — then the 成长树: every upgrade and skill as a node in one of four categories.
// A node shows its badge ringed with its levels, current → next effect, and until it is affordable a bar filling toward the price.
import { html, render, type TemplateResult } from 'lit-html';
import { SETS } from '../sets.ts';
import { G, $, money, logoUrl, bar } from './common.ts';
import { odds, luckUp, luckUpText } from './skills.ts';
import { GROWTH_TREES, GROWTH_KEYS, type GrowthKey, type GrowthNode, type GrowthTree } from '../growth.ts';

const moneyOf = money;

// What each upgrade level does, in the same words as the skills' fx (display only; the numbers are game.ts's).
const UFX: Record<string, (lv: number) => string> = {
  signage: lv => `肯多付 +${Math.round(G.SIGN_STEP * 100 * lv)} 个百分点`,
  racks: lv => `${G.RACK_BASE + lv} 个货架`,
  depth: lv => `每架 ${G.DEPTH_BASE + G.DEPTH_STEP * lv} 包`,
  case: lv => `${G.CASE_BASE + G.CASE_GAINS.slice(0, lv).reduce((a, b) => a + b, 0)} 个柜位`,
  supplier: lv => `进货打 ${+((G.WHOLESALE - G.WHOLESALE_STEP * lv) * 10).toFixed(1)} 折`,
  expand: lv => `图鉴和系列带来的客流上限 ×${+(G.CROWD_KNEE + G.CROWD_ROOM + G.ROOM_STEP * lv).toFixed(2)}`,
  clerk: lv => ['没有店员', `帮工：${G.CLERK_ROUND_1 / 60} 分钟一轮，补到半满`, `${G.CLERK_ROUND / 60} 分钟一轮，热销的补满`, '全部补满，卖散卡'][lv],
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
export function billNote(cost: number, k: string) {
  const b = G.nextBill(), cash = G.state.cash, left = cash - cost, clerk = G.clerkBudget(), hire = k === 'clerk' && G.lvl('clerk') === 0;
  const bill = b && left < b.amount, stock = left < clerk;
  if (cash < cost || (!bill && !stock && !hire)) return '';
  return html`<p class="gt-bill">仅扣本次费用后剩 ${moneyOf(left)}${bill ? html`，${G.state.overdue ? '逾期的账' : `${clock(Math.max(0, G.dueIn()))} 后九姐来收`} ${moneyOf(b!.amount)}` : ''}${stock
    ? html`${bill ? '；' : '，'}店员一轮进货要约 ${moneyOf(clerk)}，钱不够的货架空着等下一轮` : ''}${hire ? html`。雇用后马上巡一轮货架，另用现金补到半满；只在账单前 ${G.BILL_KEEP / 60} 分钟留下账款，更早雇用时这一轮可能把账款也花掉。` : ''}</p>`;
}

// 退回: this week's buy of k at G.REFUND of its price, while the till can't cover the bill (G.refundable). The ledger lists the same buttons.
export const refundBtn = (k: string, name: string, lv: number, cost: number, note = true) =>
  html`<p class="gt-back"><button type="button" data-act="refund" data-k="${k}">${G.refundTo(k) === lv ? `退回 ${name} 的付款，保留等级` : `退回 ${name} Lv ${lv}`} · 拿回 ${moneyOf(cost * G.REFUND)}</button>${note ? html`<small>这周买的最高一级，账不够付时可以退，退回九成</small>` : ''}</p>`;

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
export function nextStep() { // 成长's 下一步 — also the 「下一个目标」 line on 货柜
  const all = buyables().sort((a, b) => a.cost - b.cost);
  if (SETS.filter(s => G.unlocked(s.id)).length > G.racks()) { const r = all.find(b => b.k === 'racks'); if (r) return { ...r, why: '解锁的系列比货架多，先加一个货架' }; }
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
    <button type="button" class="gg-what" @click=${() => seek('branch')}><b>开第 ${G.state.branch.n + 2} 家店 · ${st.name}</b><span>带走 <b>${take} 名气</b></span><i aria-hidden="true">↓</i></button>
    <button type="button" class="primary" data-act="branch">${armedNow() ? '再点一次：关店并开分店' : `开分店 · 带走 ${take} 名气`}</button>
    <small>留在本店：再做 ${money(more)} 营业额，开分店时多得 1 名气${hours != null ? `，按最好一周的生意约 ${hrs(hours)}` : ''}。</small>
    ${fameLine()}
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
    <p class="mile-next">${next ? html`下一个：<b>${next.name}</b>，还差 ${money(G.unlockAt(next.id) - rev)} 营业额（卖出的整包和单卡都算）` : `${SETS.length} 个系列都解锁了。`}</p>
  </section>`;
}

// 名气 on hand that buys a perk right now: a line under 下一步 that takes you to them (perks apply at once, and to every later shop).
function fameLine() {
  const f = G.state.branch.fame, n = Object.keys(G.PERKS).filter(k => (G.perkCost(k) ?? Infinity) <= f).length;
  return n ? html`<button type="button" class="gg-fame" @click=${() => seek('perks')}>名气 <b>${f}</b> 没花，能买 ${n} 项永久加成<i aria-hidden="true">↓</i></button>` : '';
}

// 闲钱 under 下一步: what is free to spend once the next bill is set aside — the number the 成长 badge counts with.
function spareLine() {
  const b = G.state.overdue ?? G.nextBill(); if (!b) return '';
  const lp = G.state.overdue ? 0 : G.nextBill()?.loanPay || 0; // 顺手还 is set aside too (G.spare)
  return html`<p class="gg-spare">留好账款后可花 <b>${money(G.spare())}</b><span>现金 ${money(G.state.cash)} − ${G.state.overdue ? '逾期账款' : `第 ${b.week} 周账款`} ${money(b.amount)}${lp ? ` − 本次自动还款 ${money(lp)}` : ''}。升级建议只花这部分钱。</span></p>`;
}

export function renderUpgrades() {
  const ups = Object.entries(G.UPGRADES), sks = Object.entries(G.SKILLS), cash = G.state.cash;
  const lv = ups.reduce((a, [k]) => a + G.lvl(k), 0) + sks.reduce((a, [k]) => a + G.skill(k), 0);
  const max = ups.reduce((a, [, u]) => a + u.costs.length, 0) + sks.reduce((a, [k]) => a + G.skillMax(k), 0);
  const goal = nextStep(), luckNote = luckUp();
  render(html`<header class="grow-head">
      <div class="gh-lv"><p class="gh-shop">第 ${G.state.branch.n + 1} 家店${G.state.branch.got ? html` · 名气 <b>${G.state.branch.fame}</b>` : ''}</p><p><span>店铺等级</span><b>Lv ${lv}</b><small>/ ${max}</small></p>
        ${bar(lv / max, `${lv}/${max}`, { k: 'EXP' })}</div>
      ${G.canBranch() ? branchGoal() : goal ? html`<div class="gh-goal">
        <p class="gg-k">${cash >= goal.cost ? (goal.cost <= G.spare() ? '下一步，现在就能升' : '下一步，钱够但要动账单的钱') : '下一步'}${goal.why ? `：${goal.why}` : ''}</p>
        <button type="button" class="gg-what" @click=${() => revealTarget(goal.k)}><b>${goal.name} Lv ${goal.lv + 1}</b><span>${goal.fx[0]} → <b>${goal.fx[1]}</b></span><i aria-hidden="true">↓</i></button>
        ${cash >= goal.cost ? html`<button type="button" class="${goal.cost <= G.spare() ? 'primary' : ''}" data-act="${goal.act}" data-k="${goal.k}">升级 · ${money(goal.cost)}</button>${billNote(goal.cost, goal.k)}`
          : html`${bar(cash / goal.cost, `攒了 ${Math.round(cash / goal.cost * 100)}%`)}
            <small>${money(cash)} / ${money(goal.cost)}，还差 ${money(goal.cost - cash)}</small>`}
        ${spareLine()}
        ${fameLine()}
      </div>` : html`<div class="gh-goal"><p class="gg-k">都升满了。</p>${fameLine()}</div>`}
      <dl class="gh-now">
        <div><dt>进店</dt><dd>${(G.rate() * 60).toFixed(1)} 人/分</dd></div>
        <div><dt>图鉴和新系列</dt><dd title="收录图鉴、解锁系列带来的顾客增幅；不含技能人气和名气加成">顾客 +${Math.round((G.crowdMult() - 1) * 100)}%${G.crowdRaw() > G.CROWD_KNEE ? html`<small>受店面大小限制</small>` : ''}</dd></div>
        <div><dt>进货价</dt><dd>市价打 ${+(G.wholesaleRate() * 10).toFixed(1)} 折</dd></div>
        <div><dt>货架</dt><dd>${G.racks()} × ${G.depth()} 包</dd></div>
        <div><dt>展示柜</dt><dd>${G.slots()} 格</dd></div>
        <div><dt>手气（游戏加成）</dt><dd>${luckNote ? `×${luckNote.m0.toFixed(2)} → ` : ''}×${G.luckMult().toFixed(2)} · Lv ${G.skill('luck')}/${G.skillMax('luck')}</dd></div>
        ${G.perk('regulars') ? html`<div><dt>老主顾</dt><dd>基础客流 +${Math.round(G.REG_STEP * 100 * G.perk('regulars'))}%</dd></div>` : ''}
        <div><dt>打烊结算</dt><dd>${G.offlineCap() / 3600} 小时</dd></div>
      </dl>
    </header>
    ${milestones()}`, $('grow-top'));
  renderBranch();
  render(tree(G.canBranch() ? undefined : goal?.k), $('upgrades'));
}
document.addEventListener('ptcg:luck', renderUpgrades); // the 手气 level-up line times out (skills.ts luckUp)

// ---------- 成长树 ----------
// id: the stamp key and the node's element id (tn-<id>); a 名气 perk's is perk-<k>, since perk 手气底子 and skill 手气 are both `luck`.
// have / price: what pays for it (名气 for perks: no bill, no 闲钱, no 退回) — cash when absent.
interface Node { k: string; id: string; icon: string; act: string; name: string; desc: string; lv: number; max: number; cost: number | undefined; fx: [string, string]; end: string; blocked: string; gate?: [number, number]; have?: number; price?: (v: number) => string }
function nodeOf(k: string): Node {
  const lock = G.growthLock(k);
  if (k in G.UPGRADES) {
    const u = G.UPGRADES[k], lv = G.lvl(k), ok = !lock;
    // the 扩建 gate bar is only the real gate while its parent is out of the way: before that the lock names the parent
    const crowd = k === 'expand' && !ok && (lv > 0 || G.lvl('crowd') > 0) && G.crowdRaw() <= G.CROWD_KNEE;
    return { k, id: k, icon: `u-${k}`, act: 'up', name: u.name, desc: u.desc, lv, max: u.costs.length, cost: G.upgradeCost(k), fx: ok ? fxOf(k, lv, UFX[k]) : [UFX[k](lv), UFX[k](lv + 1)], end: UFX[k](u.costs.length),
      blocked: lock, gate: crowd ? [G.crowdRaw(), G.CROWD_KNEE] : undefined };
  }
  const sk = G.SKILLS[k], lv = G.skill(k), max = G.skillMax(k);
  return { k, id: k, icon: `u-${k}`, act: 'learn', name: sk.name, desc: sk.desc, lv, max, cost: G.skillCost(k), fx: fxOf(k, lv, sk.fx), end: sk.fx(max), blocked: lock };
}

// The moment a level lands: its node stamps (badge pops, the new ring segment lights) for UP_MS, and sound.ts plays the stamp.
// Tracked here by level rather than by click, so the ledger's buttons and 下一步 in the header stamp the node too.
const UP_MS = 1200, seen = new Map<string, number>(), upAt = new Map<string, number>();
function popped(k: string, lv: number) {
  const was = seen.get(k), now = performance.now(); seen.set(k, lv);
  if (was != null && lv > was) { upAt.set(k, now); document.dispatchEvent(new CustomEvent('ptcg:bought', { detail: k })); }
  return now - (upAt.get(k) ?? -1e9) < UP_MS;
}

const fameStr = (v: number) => `${v} 名气`;
function perkNode(k: string): Node {
  const p = G.PERKS[k], lv = G.perk(k);
  return { k, id: `perk-${k}`, icon: `p-${k}`, act: 'perk', name: p.name, desc: p.desc, lv, max: p.max, cost: G.perkCost(k), fx: [p.fx(lv), p.fx(lv + 1)], end: p.fx(p.max),
    blocked: G.state.branch.got ? '' : `开了分店拿到名气才能买 · 首级 ${fameStr(G.perkCost(k)!)}`, have: G.state.branch.fame, price: fameStr };
}

// Everything the 成长 page paints yellow right now: tree levels 闲钱 covers, perks the 名气 on hand covers, and 开分店 once the debt
// is paid. The nav badge (layout.ts) is this count, so the number and the yellow rings never disagree.
export function growCount() {
  return GROWTH_KEYS.map(nodeOf).filter(yellow).length + Object.keys(G.PERKS).map(perkNode).filter(yellow).length + (G.canBranch() ? 1 : 0);
}
function yellow(n: Node) { const pay = n.have ?? G.state.cash; return n.cost != null && !n.blocked && pay >= n.cost && (n.have != null || n.cost <= G.spare()); }

// 下一步 points somewhere on this page: scroll it to the middle of the screen and light it for a moment (a class, not a hash: layout.ts
// routes every hash to a page).
function seek(id: string) {
  const el = document.getElementById(id); if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.remove('seek'); void el.offsetWidth; el.classList.add('seek');
}

function node(n: Node, next: string | undefined) {
  const perk = n.have != null, cash = n.have ?? G.state.cash, money = n.price ?? moneyOf, done = n.cost == null, can = !done && !n.blocked && cash >= n.cost!, free = can && yellow(n);
  const back = !perk && G.refundable().find(x => x.k === n.k), held = !perk && !back && n.lv > 0 ? G.refundBlock(n.k) : '', up = popped(n.id, n.lv), got = n.id === 'luck' ? luckUp() : undefined;
  const st = done ? 'max' : n.blocked ? 'lock' : n.lv ? 'own' : 'new';
  return html`<div class="tn ${st}${free ? ' can' : ''}${n.k === next ? ' next' : ''}${up ? ' up' : ''}" id="tn-${n.id}" style="--lv:${n.lv};--max:${n.max}">
    <span class="tn-badge" style="--i:url(gen/${n.icon}.webp)" role="img" aria-label="${n.name} Lv ${n.lv}/${n.max}${done ? '，满级' : n.blocked ? '，锁着' : ''}"></span>
    <p class="tn-top"><b>${n.name}</b><span class="gt-lv">Lv ${n.lv}<small>/${n.max}</small></span>${n.k === next ? html`<small class="tn-next">下一步</small>` : ''}</p>
    <p class="gt-fx">${done ? n.fx[0] : html`${n.fx[0]} <span aria-hidden="true">→</span> <b>${n.fx[1]}</b>`}</p>
    ${got ? html`<p class="gt-fx luck-got" role="status">${luckUpText(got)}</p>` : ''}
    <p class="gt-desc">${n.desc}</p>
    ${done ? html`<p class="gt-done">满级</p>` : n.blocked ? html`<div class="gt-buy gt-lock"><small>${n.blocked}</small>${n.gate ? html`${bar(n.gate[0] / n.gate[1], `口碑 ×${n.gate[0].toFixed(2)} / ×${n.gate[1]}`)}<small>现在 ×${n.gate[0].toFixed(2)} · 首级 ${money(n.cost!)}</small>` : ''}</div>`
      : html`<div class="gt-buy"><button type="button" data-act="${n.act}" data-k="${n.k}" ?disabled=${!can} aria-label="${n.name} 升到 Lv ${n.lv + 1}，${money(n.cost!)}"><span class="gb-lv">升到 Lv ${n.lv + 1} · </span>${money(n.cost!)}</button>
        ${can ? (perk ? '' : billNote(n.cost!, n.k)) : html`${bar(cash / n.cost!, `攒了 ${Math.round(cash / n.cost! * 100)}%`)}<small>还差 ${money(n.cost! - cash)}</small>`}</div>`}
    ${back ? refundBtn(back.k, n.name, n.lv, back.cost) : ''}
    ${held ? html`<p class="gt-held"><small>${held}</small></p>` : ''}
  </div>`;
}

// The counter's free root: not an upgrade and not for sale — it opens when the player has opened a pack or taken in a card
// (G.cardBranchReady), and 展示柜 and 手气 hang off it.
function milestone() {
  const ok = G.cardBranchReady();
  return html`<div class="tn ms ${ok ? 'own' : 'new'}" id="tn-ms-cards" style="--lv:${ok ? 1 : 0};--max:1">
    <span class="tn-badge" role="img" aria-label="开始收卡：${ok ? '已达成' : '还没达成'}"></span>
    <p class="tn-top"><b>开始收卡</b><span class="gt-lv">${ok ? '已达成' : '未达成'}</span></p>
    <p class="gt-fx">${ok ? '展示柜和手气都可以升了' : '开过一包，或收进一张卡，下面两项才能升'}</p>
    <p class="gt-desc">这一步不用花钱，做到就算。</p>
  </div>`;
}

// 成长树: one category open at a time, the others are a row of toggle buttons above it. A category is a real prerequisite
// hierarchy (growth.ts, the one graph game.ts enforces too): a node hangs off the node that must be bought first, and the lines
// between them are inked where the child has levels. A level bought before its parent was required stays owned and upgradable.
let picked = '';
const keysOf = (ns: readonly GrowthNode[]): GrowthKey[] => ns.flatMap(x => [x.k, ...keysOf(x.children ?? [])]);
const treeOfKey = (k?: string) => GROWTH_TREES.find(t => k && keysOf(t.roots).includes(k as GrowthKey));

// A node opens its category first, so 下一步 can scroll to a node that is not on screen; the panel is drawn at once for the scroll.
export function revealTarget(k: string) {
  const t = treeOfKey(k); if (t && t.id !== picked) { picked = t.id; renderUpgrades(); }
  seek(`tn-${k}`);
}

function branch(g: GrowthNode, next: string | undefined): TemplateResult {
  const n = nodeOf(g.k);
  return html`<li class="tb${n.lv ? ' own' : ''}">${node(n, next)}${g.children?.length ? html`<ul class="tb-kids">${g.children.map(c => branch(c, next))}</ul>` : ''}</li>`;
}

function tree(next?: string) {
  const open = GROWTH_TREES.find(t => t.id === picked) ?? treeOfKey(next) ?? GROWTH_TREES[0];
  picked = open.id;
  const stat = (t: GrowthTree) => { const ns = keysOf(t.roots).map(nodeOf); return { t, ns, lv: ns.reduce((a, n) => a + n.lv, 0), max: ns.reduce((a, n) => a + n.max, 0), buy: ns.filter(yellow).length, next: ns.some(n => n.k === next) }; };
  const tabs = GROWTH_TREES.map(stat), cur = tabs.find(s => s.t === open)!;
  const roots = open.roots.map(g => branch(g, next));
  return html`<h2>成长树 <small>分四类，一次展开一类；每一项挂在要先买的那项下面</small></h2>
    <div class="tree">
      <div class="tree-tabs" role="group" aria-label="成长分类">${tabs.map(s => html`<button type="button" class="tt" aria-pressed="${s.t === open ? 'true' : 'false'}" aria-controls="tree-panel" @click=${() => { picked = s.t.id; renderUpgrades(); }}>
        <b>${s.t.name}</b><small>${s.lv}/${s.max} 级</small>${s.buy ? html`<small class="tt-n">${s.buy} 项买得起</small>` : s.next ? html`<small class="tt-n">下一步在这</small>` : ''}</button>`)}</div>
      <section class="tree-panel" id="tree-panel" aria-label="${open.name}">
        <p class="tl-say">${open.say}</p>
        <ul class="tr">${open.milestone === 'cards' ? html`<li class="tb own">${milestone()}<ul class="tb-kids">${roots}</ul></li>` : roots}</ul>
        <p class="tl-end"><b>${cur.lv === cur.max ? '已全部升满' : '满级效果'}</b>${cur.ns.map(n => n.end).join(' · ')}</p>
        ${open.milestone === 'cards' ? odds() : ''}
      </section>
    </div>`;
}

// 开分店 restarts the shop, so it takes two clicks within 3 s, like 清空存档. The one 开分店 button is the header's (branchGoal), shown once the debt is paid.
let armed = 0;
const armedNow = () => Date.now() - armed < 3000;
export function branchClick() {
  if (armedNow()) { armed = 0; G.branch(); return; }
  armed = Date.now(); renderUpgrades(); setTimeout(renderUpgrades, 3100); // the header's 开分店 says 再点一次
}

// A street's per-set tilt in words: which sets draw more (or fewer) pack buyers there than on 老街.
function streetSets(st: ReturnType<typeof G.street>) {
  const by = (up: boolean) => Object.entries(st.sets!).filter(([, x]) => x.w != null && (x.w > 1) === up).map(([id]) => G.setById(id).name).join('、');
  const up = by(true), down = by(false);
  return [up && `${up} 来的人多`, down && `${down} 来的人少`].filter(Boolean).join('；');
}

// 开分店 (prestige): while the debt stands it is one line (what is still owed, the 名气 in hand) and, once 名气 has ever been earned, the
// perks to spend it on. Debt paid: how far this shop is from the next 名气, what branching now would pay, what carries over, and the perks.
// The button itself is the header's (branchGoal): one 开分店 key on the page.
function renderBranch() {
  const b = G.state.branch, rev = G.revenue(), d0 = G.debt0(), paid = Math.max(0, Math.min(1, 1 - G.state.debt / d0)), can = G.canBranch(), fame = G.fameFor(), hand = G.handFame();
  const nextAt = (fame + 1) ** 2 * G.FAME_UNIT, pts = fameStr;
  const here = G.street(), there = nextStreet();
  const perks = html`<section class="perks" id="perks" aria-labelledby="perks-h">
      <h3 class="br-h" id="perks-h">名气加成 <small>${b.got ? `永久，这家店和以后每家新店都有 · 手上 ${pts(b.fame)}` : '开分店带走的名气在这里花，每家新店都有'}</small></h3>
      <ol>${Object.keys(G.PERKS).map(k => html`<li>${node(perkNode(k), undefined)}</li>`)}</ol>
    </section>`;
  if (!can) { render(html`<h2>开分店：还欠 ${money(G.state.debt)} · 名气 ${b.fame}</h2>${b.got ? perks : ''}`, $('branch')); return; }
  render(html`<h2>开分店 <small>${b.n ? `第 ${b.n + 1} 家店在${here.name} · 前 ${b.n} 家店营业额 ${money(b.life)} · 共得名气 ${b.got}` : '这家店还清了，是你的了；九姐出本钱让你去别的街口再开一家'}</small></h2>
    <div class="br-now">
      <div class="br-prog">
        <p><span>这家店的债</span> <b>还清了</b> <small>/ ${money(d0)}</small></p>
        ${bar(paid, `已还 ${Math.round(paid * 100)}%`, { k: 'EXP' })}
        <p class="br-say">现在开分店能带走 <b>${pts(fame + hand)}</b>（本店营业额 ${money(rev)}${hand ? `，加亲手开齐的 ${hand}` : ''}）；多做 ${money(nextAt - rev)} 营业额，开分店就能带走 ${pts(fame + hand + 1)}（营业额名气 = √(营业额 ÷ ${G.FAME_UNIT.toLocaleString('en-US')}) 向下取整，越往后越慢）。下一家店欠 ${money(Math.round(G.DEBT0 * (1 + G.DEBT_STEP * (b.n + 1))))}。</p>
      </div>
      <div class="br-go">
        <p class="br-street"><b>下一家在${there.name}</b>${there.say}${there.sets ? html`<small>${streetSets(there)}</small>` : ''}</p>
        <p class="br-keep"><b>带走</b>卡册和展示柜里的卡、图鉴、成就、欧气检测的全部记录、名气</p>
        <p class="br-keep"><b>留下</b>现金、仓库和货架上的包、店铺升级、技能、营业额（后面的系列要重新解锁）</p>
      </div>
    </div>
    ${perks}`, $('branch'));
}
