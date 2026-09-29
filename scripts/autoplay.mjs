// Balance harness: plays the real src/game.ts with a scripted player on a fake clock and prints the growth curve.
// Run: node scripts/autoplay.mjs [hours=3] [openShare=0.15] [pct=1] [masterShare=0] [racks] [depth] — pct = asking price as a share of market (a number,
// or per set { sv08: 0.95, … }); masterShare = share of revenue put into finishing 图鉴 master sets (open packs for C/U/R, buy the hits);
// racks / depth = the highest 货架 / 加层 level this player buys (to measure what those upgrades are worth).
// node scripts/autoplay.mjs survive [hours=10] [seeds=20]: the 债务 survival table of GAMEPLAY.md (six kinds of player; 12 h × 10 seeds ≈ 25 s).
// node scripts/autoplay.mjs pace [hours=16] [纯经营 普通 收图鉴]: the 成长节奏 table of GAMEPLAY.md §12.1 (longest wait between buys per 2 h).
// node scripts/autoplay.mjs bills: the bill schedule next to the pure manager's weekly profit (GAMEPLAY.md「账单曲线」).
import { createGame } from '../src/game.ts';
import * as S from '../src/sim.ts';
import { SETS } from '../src/sets.ts';

export function boot(seed = 1) {
  let T = 1_700_000_000_000, s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = createGame({ now: () => T, random: rnd, storage: null });
  return { G, S, SETS, rnd, advance: sec => { T += sec * 1000; }, now: () => T };
}

// What happened to the debt, for the survival table: bankruptcies (week reached, hours in), when the debt was cleared, loans.
function watchDebt(G, clock) {
  const d = { broke: [], cleared: null, loans: 0, forced: 0, borrowed: 0, missed: 0, paid: 0 };
  G.on(ev => {
    if (ev?.type === 'bankrupt') d.broke.push({ week: ev.week, h: +(clock() / 3600).toFixed(2) });
    if (ev?.type === 'story' && ev.id === 'debt_cleared' && !d.cleared) d.cleared = { week: G.state.week, h: +(clock() / 3600).toFixed(2), shopH: +(G.state.shopT / 3600).toFixed(2) };
    if (ev?.type === 'loan_taken') { d.loans++; d.borrowed += ev.amount; if (ev.forced) d.forced++; }
    if (ev?.type === 'bill_missed') d.missed++;
    if (ev?.type === 'bill_paid') d.paid++;
  });
  return d;
}

// One "visit" every `step` seconds: buy the cheapest upgrade (up to `cap` levels; 货架 first while an unlocked set has no shelf) or 技能 first (手气 only if this player opens packs; 看店 never, it never closes), then stock (kept back for opening or put on the shelf at `pct` of market),
// open `openShare` of the back-room stock, sell cheap singles to peers and put hits in the case at `cardPct`.
// branch = this shop's revenue at which the player 开分店 (prestige; false = never; 'paid' = as soon as the debt is cleared), then spends all 名气: 老主顾 (traffic) first, then the cheapest perk.
// reserve = in the last 5 minutes before a bill, keep this many times it in cash (0 = spend everything and let the bill fall on whatever is left);
// repay = pay loans back with what cash is above the reserve plus a float for stock (twice the next bill, at least $1,000), and buy no upgrade (but a shelf a set waits for) while a loan is out. clerkFirst = hire the clerk before any other upgrade. away = [minutes on, minutes off]: the player closes the page for the
// off minutes (one catch-up tick on return, credited up to the offline cap), then plays the on minutes, and so on.
// off = minutes of every hour the player leaves the page open without doing anything (the shop runs on its own; a clerk, if hired, restocks).
// binder = keep hits under $25 in the counter binder for seekers (GAMEPLAY §14) instead of selling them to peers at 70% every visit.
// heed = a player who reads the 店员没本钱 notes: buys no upgrade that leaves less than the clerk needs to fill the shelves (成长页
// says so under the button), and presses 现在补货 whenever the clerk's last round came up short (货柜 page) and there is cash above the bill reserve.
// Shelves: an empty shelf gets the unlocked set with the fewest shelves (pricier sets first), so every set is on sale before any doubles up.
export function play({ hours = 3, openShare = 0.15, step = 20, seed = 1, pct = 1.0, cardPct = 1.0, masterShare = 0, luck, cap = {}, off = 0, branch = false, reserve = 0, repay = false, away, clerkFirst = false, heed = false, binder = false, log = 600, hook } = {}) {
  const { G, SETS, advance } = boot(seed), rows = [], buys = []; let spent = 0, pot = 0, rev = 0, t = 0, nextRow = 0;
  const debt = watchDebt(G, () => t);
  const each = hook?.(G); // hook(G) may return a function called after every visit with the game time in seconds (test/: achievements)
  const pctOf = id => typeof pct === 'number' ? pct : pct[id] ?? 1;
  const baseLeft = id => G.dexTotal(id) - G.dexCount(id) - G.missing(id).length; // C/U/R still to pull
  const wants = k => k !== 'watch' && (k !== 'luck' || (luck ?? (openShare > 0 || masterShare > 0)));
  if (luck === 'max') G.state.skills.luck = G.SKILLS.luck.max; // a player who starts with 手气 maxed (balance check)
  for (; t <= hours * 3600; t += step) {
    if (away && t % ((away[0] + away[1]) * 60) >= away[0] * 60) { // closed: jump to the end of the off stretch, one catch-up tick
      const back = t - t % ((away[0] + away[1]) * 60) + (away[0] + away[1]) * 60; advance(back - t); t = back; G.tick();
    } else { advance(step); G.tick(); }
    const rowNow = () => { while (t >= nextRow) { rows.push(row(nextRow)); nextRow += log; } };
    if (t % 3600 >= (60 - off) * 60) { rowNow(); continue; }
    if (G.state.wreck) G.ackWreck();
    if (branch && G.canBranch() && (branch === 'paid' || G.revenue() >= branch)) { G.branch(); spent = 0; rev = 0; pot = 0; }
    for (let k; (k = Object.keys(G.PERKS).filter(k => G.perkCost(k) <= G.state.branch.fame).sort((a, b) => (b === 'regulars') - (a === 'regulars') || G.perkCost(a) - G.perkCost(b))[0]);) G.learnPerk(k); // 老主顾 first, then the cheapest
    G.sellBulk();
    if (!binder) for (const [k, c] of Object.entries(G.state.singles)) if (c.price < 25) G.sell(k);
    if (G.state.overdue) { for (const k of Object.keys(G.state.singles)) G.sell(k); G.payBill(); } // short on a bill: sell every card to peers first
    for (const [k] of Object.entries(G.state.singles)) if (G.list(k)) G.state.shown[G.state.shown.length - 1].pct = cardPct;
    const bill = G.nextBill(), keep = reserve && bill && G.dueIn() < 300 ? bill.amount * reserve : 0, free = () => Math.max(0, G.state.cash - keep); // the last 5 minutes before a bill: cash kept back for it
    const float = Math.max(1000, 2 * (bill?.amount || 0)); // working cash a repaying player keeps for stock
    if (repay && G.state.loan > 0 && free() > float) G.repay(free() - float);
    let best = null; for (const k of Object.keys(G.UPGRADES)) { const c = G.upgradeCost(k); if (c != null && G.canUpgrade(k) && G.lvl(k) < (cap[k] ?? Infinity) && (!best || c < best[1])) best = [k, c]; }
    for (const k of Object.keys(G.SKILLS)) { const c = G.skillCost(k); if (c != null && wants(k) && G.canLearn(k) && (!best || c < best[1])) best = ['skill:' + k, c]; }
    if (SETS.filter(x => G.unlocked(x.id)).length > G.racks() && G.upgradeCost('racks') != null && G.lvl('racks') < (cap.racks ?? Infinity)) best = ['racks', G.upgradeCost('racks')]; // a set is waiting for a shelf: that comes first
    if (clerkFirst && G.lvl('clerk') < 1) best = ['clerk', G.upgradeCost('clerk')]; // someone who leaves the page for hours hires a clerk before anything else
    if (repay && G.state.loan > 0 && best?.[0] !== 'racks') best = null; // a repaying player clears a 10%-a-week loan before buying growth (else upgrades cheaper than the float always come first and the loan compounds)
    if (heed && G.clerkShort() > 0 && !keep) G.clerkNow(); // not in the last 5 minutes before a bill
    if (heed && best && G.lvl('clerk') && free() - best[1] < G.clerkBudget()) best = null; // the 成长 page's note under the button
    if (best && free() >= best[1]) { spent += best[1]; buys.push({ min: +(t / 60).toFixed(1), k: best[0], lv: (best[0].startsWith('skill:') ? G.skill(best[0].slice(6)) : G.lvl(best[0])) + 1, cost: best[1], rate0: +(G.rate() * 60).toFixed(1) }); if (best[0].startsWith('skill:')) G.learn(best[0].slice(6)); else G.upgrade(best[0]); best = null; }
    const leaving = (off && (t + step) % 3600 >= (60 - off) * 60) || (away && (t + step) % ((away[0] + away[1]) * 60) >= away[0] * 60); // last visit before going away: fill the shelves, save later (unless a set is waiting for a shelf)
    const hold = best && (!leaving || best[0] === 'racks') && free() > best[1] * 0.4 ? best[1] : 0; // saving for the next upgrade: stop pouring cash into stock and packs
    pot += (G.revenue() - rev) * masterShare; rev = G.revenue(); // the master-set budget: a share of what came in since last visit
    const goal = masterShare && SETS.filter(x => G.unlocked(x.id) && !G.master(x.id)).sort((a, b) => a.packPrice * baseLeft(a.id) - b.packPrice * baseLeft(b.id))[0];
    if (goal) { // pull the C/U/R by opening packs, then buy the missing hits cheapest first
      if (baseLeft(goal.id)) { const n = Math.min(10, Math.floor(Math.min(pot, free()) / G.wholesale(goal.id))); if (n > 0 && G.buy(goal.id, n)) { pot -= G.wholesale(goal.id) * n; G.open(goal.id, n); } }
      for (let m = G.missing(goal.id)[0]; m && m.price <= Math.min(pot, free()) && G.collect(goal.id); m = G.missing(goal.id)[0]) pot -= m.price;
    }
    const ids = SETS.filter(x => G.unlocked(x.id)).map(x => x.id).reverse(), racksOf = id => G.shelves().filter(s => s.id === id).length;
    for (const id of ids) if (!racksOf(id)) { const i = G.shelves().findIndex(s => !s.id || racksOf(s.id) > 1); if (i >= 0) G.place(i, id); } // a newly unlocked set takes a doubled-up shelf
    G.shelves().forEach((s, i) => { if (!s.id && ids.length) G.place(i, ids.reduce((a, b) => (racksOf(b) < racksOf(a) ? b : a))); });
    for (const id of ids) G.setPrice(id, pctOf(id));
    for (const id of ids) if (G.state.stock[id] > 0) G.shelve(id, G.state.stock[id]); // leftovers in the back room go out first
    const byHand = ids.filter(id => !(G.lvl('clerk') > 1 && G.state.auto[id])); // the rest the clerk restocks (a level-1 clerk only fills to half, so keep topping up)
    for (let more = true; more;) { // fill the shelves 5 packs a set at a time, so a short budget is spread over every set
      more = false;
      for (const id of byHand) {
        const room = racksOf(id) * G.depth() - G.shelfQty(id), n = Math.min(5, room, Math.floor(Math.max(0, free() - (G.shelfQty(id) < 10 ? 0 : hold)) / G.wholesale(id)));
        if (n > 0 && G.buy(id, n)) { G.shelve(id, n); more = true; }
      }
    }
    if (!hold) for (const set of SETS) { const n = Math.floor(G.shelfQty(set.id) * openShare); if (n > 0) { G.unshelve(set.id, n); G.open(set.id, n); } }
    each?.(t);
    rowNow();
  }
  function row(t) {
    const st = G.state;
    return { min: t / 60, cash: Math.round(st.cash), net: Math.round(st.cash + spent + SETS.reduce((a, x) => a + (G.shelfQty(x.id) + (st.stock[x.id] || 0)) * G.wholesale(x.id), 0)), perMin: '', rev: Math.round(G.revenue()), revMin: '', up: Object.values(st.up).reduce((a, b) => a + b, 0) + Object.values(st.skills).reduce((a, b) => a + b, 0), packs: Object.values(st.opened).reduce((a, b) => a + b, 0), dex: SETS.map(x => G.master(x.id) ? '★' : Math.round(G.dexCount(x.id) / G.dexTotal(x.id) * 100)).join('/'), rate: +(G.rate() * 60).toFixed(1), sold: st.cust.sold, pricey: st.cust.pricey, none: st.cust.none, shop: st.branch.n + 1, fame: st.branch.got, week: st.week, debt: Math.round(st.debt), loan: Math.round(st.loan), broke: st.branch.broke || 0 };
  }
  for (let i = 1; i < rows.length; i++) { rows[i].perMin = Math.round((rows[i].net - rows[i - 1].net) / (log / 60)); rows[i].revMin = Math.round((rows[i].rev - rows[i - 1].rev) / (log / 60)); }
  rows.debt = debt; rows.G = G; rows.buys = buys;
  return rows;
}

// 新手乱点: a first-timer clicking around. Every 15–75 s: stocks a random unlocked set (5–30 packs, as long as cash lasts), shelves
// what is in the back room, sets a random price (85–115% of market: 嫌贵 lines in the log keep them from going higher), opens 1–3 packs a third of the time, sells the bulk now and then,
// buys a random affordable upgrade or skill a quarter of the time. Keeps no cash back for bills, never borrows or repays by choice
// (a short bill is borrowed when its grace runs out), and wanders off for 2–10 minutes one visit in ten.
export function noob({ hours = 5, seed = 1, log = 1800 } = {}) {
  const { G, SETS, advance, rnd } = boot(seed), rows = []; let t = 0;
  const debt = watchDebt(G, () => t), pick = a => a[Math.floor(rnd() * a.length)];
  while (t <= hours * 3600) {
    const wait = rnd() < 0.1 ? 120 + rnd() * 480 : 15 + rnd() * 60;
    for (let w = 0; w < wait; w += 20) { advance(Math.min(20, wait - w)); G.tick(); }
    t += wait;
    if (G.state.wreck) G.ackWreck();
    const ids = SETS.filter(x => G.unlocked(x.id)).map(x => x.id), id = pick(ids);
    G.buy(id, Math.min(5 + Math.floor(rnd() * 26), Math.floor(G.state.cash / G.wholesale(id))));
    for (const x of ids) if (G.state.stock[x] > 1) { if (!G.shelve(x, G.state.stock[x] - 1)) G.place(G.shelves().findIndex(s => !s.id), x); }
    G.setPrice(pick(ids), 0.85 + Math.round(rnd() * 6) * 0.05);
    if (rnd() < 0.33) { const o = pick(ids); if (!G.state.stock[o]) G.buy(o, 3); G.open(o, 1 + Math.floor(rnd() * 3)); }
    if (rnd() < 0.3) G.sellBulk();
    if (rnd() < 0.25) {
      const opts = [...Object.keys(G.UPGRADES).filter(k => G.upgradeCost(k) != null && G.canUpgrade(k) && G.upgradeCost(k) <= G.state.cash).map(k => () => G.upgrade(k)),
        ...Object.keys(G.SKILLS).filter(k => G.skillCost(k) != null && G.canLearn(k) && G.skillCost(k) <= G.state.cash).map(k => () => G.learn(k))];
      if (opts.length) pick(opts)();
    }
    if (G.state.shown.length < G.slots()) for (const [k, c] of Object.entries(G.state.singles)) if (c.price >= 5 && G.list(k)) break;
    if (t >= rows.length * log) rows.push({ min: Math.round(t / 60), cash: Math.round(G.state.cash), rev: Math.round(G.revenue()), week: G.state.week, debt: Math.round(G.state.debt), loan: Math.round(G.state.loan), broke: G.state.branch.broke || 0 });
  }
  rows.debt = debt; rows.G = G;
  return rows;
}

// The four kinds of player in GAMEPLAY.md「难度」, each over `seeds` seeds for `hours` of real time.
export const KINDS = {
  纯经营: s => play({ hours: s.hours, seed: s.seed, openShare: 0, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  普通: s => play({ hours: s.hours, seed: s.seed, step: 90, openShare: 0.02, pct: 1, reserve: 1, repay: true, log: 3600 }), // looks in every 90 s with the page open (ticks under G.AWAY apart are no absence), prices at market
  爱开包: s => play({ hours: s.hours, seed: s.seed, openShare: 0.05, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  开包上头: s => play({ hours: s.hours, seed: s.seed, openShare: 0.12, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  新手乱点: s => noob({ hours: s.hours, seed: s.seed }),
  挂机离线: s => play({ hours: s.hours, seed: s.seed, openShare: 0, pct: 0.95, reserve: 1, repay: true, away: [20, 480], clerkFirst: true, log: 3600 }), // 20 min in, 8 h away, again; hires the clerk first
};
export function survive({ hours = 10, seeds = 20, kinds = Object.keys(KINDS) } = {}) {
  return kinds.map(k => {
    const runs = Array.from({ length: seeds }, (_, i) => KINDS[k]({ hours, seed: i + 1 }).debt);
    const firstBroke = runs.map(d => d.broke[0]?.week ?? Infinity), q = w => firstBroke.filter(x => !(x <= w)).length / seeds;
    const cleared = runs.filter(d => d.cleared), med = a => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
    return { kind: k, 'week 3': q(3), 'week 6': q(6), 'week 12': q(12), 'week 24': q(24), 'no 破产': firstBroke.filter(x => x === Infinity).length / seeds, 'paid off': cleared.length / seeds,
      'paid off @ h (median)': med(cleared.map(d => d.cleared.h)), 'loans/run': +(runs.reduce((a, d) => a + d.loans, 0) / seeds).toFixed(1), 'forced': +(runs.reduce((a, d) => a + d.forced, 0) / seeds).toFixed(1) };
  });
}

// 成长节奏 (GAMEPLAY.md §12.1): for each `win`-hour stretch, how many upgrades/skills this player bought and the longest wait
// between two buys (counted from the last buy before the stretch), with walk-ins and net income at its end.
export function pace(opts, { hours = 16, win = 2 } = {}) {
  const rows = play({ hours, log: 3600, ...opts }), b = rows.buys, out = [];
  for (let h = 0; h < hours; h += win) {
    const inW = b.filter(x => x.min >= h * 60 && x.min < (h + win) * 60), next = b.find(x => x.min >= (h + win) * 60)?.min ?? Infinity;
    const pts = [b.filter(x => x.min < h * 60).at(-1)?.min ?? 0, ...inW.map(x => x.min), Math.min(next, (h + win) * 60)];
    const end = rows[Math.min(h + win, rows.length - 1)];
    out.push({ h: `${h}–${h + win}`, buys: inW.length, 'longest wait (min)': Math.round(Math.max(...pts.slice(1).map((x, i) => x - pts[i]))), 'walk-ins/min': end.rate, 'net $/min': end.perMin, debt: end.debt, bought: inW.map(x => x.k.replace('skill:', '') + x.lv).join(' ') });
  }
  return out;
}

if (process.argv[1]?.endsWith('autoplay.mjs')) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'pace') { const [hours = 16, ...kinds] = rest; for (const k of kinds.length ? kinds : ['纯经营', '普通']) { const o = { 纯经营: { openShare: 0, pct: 0.95 }, 普通: { step: 90, openShare: 0.02, pct: 1 }, 收图鉴: { openShare: 0, pct: 1, masterShare: 0.02 } }[k]; console.log(k); console.table(pace({ ...o, reserve: 1, repay: true }, { hours: +hours })); } }
  else if (mode === 'survive') { const [hours = 10, seeds = 20] = rest.map(Number), kinds = rest[2] ? rest[2].split(',') : undefined; console.table(survive({ hours, seeds, kinds })); }
  else if (mode === 'bills') { // one row per week until the debt is cleared: the bill against what the shop made that week before paying it
    const rows = play({ hours: 12, openShare: 0, pct: 0.95, reserve: 1, repay: true, log: 1200 }), G = rows.G, bill = w => Math.round(G.BILL0 * G.BILL_G ** (w - 1));
    const out = []; for (let i = 1; i < rows.length && rows[i - 1].debt > 0; i++) { const w = i, b = Math.min(bill(w), rows[i - 1].debt), gross = rows[i].perMin * 20 + b; out.push({ week: w, bill: b, 'made that week': gross, 'bill / made': +(b / gross).toFixed(2), 'debt after': rows[i].debt, loan: rows[i].loan }); }
    console.table(out); console.log(rows.debt);
  } else {
    const [hours = 3, openShare = 0.15, pct = 1, masterShare = 0, racks = Infinity, depth = Infinity] = [mode, ...rest].map(Number);
    const rows = play({ hours, openShare, pct, masterShare, cap: { racks, depth }, log: 1800 });
    console.table(rows); console.log(rows.debt);
  }
}
