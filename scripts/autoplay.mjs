// Balance harness: plays the real src/game.ts with a scripted player on a fake clock and prints the growth curve.
// Run: node scripts/autoplay.mjs [hours=3] [openShare=0.15] [pct=1] [masterShare=0] [racks] [depth] — pct = asking price as a share of market (a number,
// or per set { sv08: 0.95, … }); masterShare = share of revenue put into finishing 图鉴 master sets (open packs for C/U/R, buy the hits);
// racks / depth = the highest 货架 / 加层 level this player buys (to measure what those upgrades are worth).
// node scripts/autoplay.mjs survive [hours=10] [seeds=20]: the 债务 survival table of GAMEPLAY.md (six kinds of player; 12 h × 10 seeds ≈ 25 s).
// node scripts/autoplay.mjs pace [hours=16] [纯经营 普通 收图鉴]: the 成长节奏 table of GAMEPLAY.md §12.1 (longest wait between buys per 2 h).
// node scripts/autoplay.mjs opening [packs=10] [seeds=10]: the first ten minutes of a fresh save (see opening() below).
// node scripts/autoplay.mjs bills: the bill schedule next to the pure manager's weekly profit (GAMEPLAY.md「账单曲线」).
import { createGame } from '../src/game.ts';
import * as S from '../src/sim.ts';
import { SETS } from '../src/sets.ts';
import { note, check, watch } from '../src/achievements.ts';
import { debtBeat } from '../src/debt.ts';
import { SCENES, sceneFor, BIG_PULL } from '../src/story.ts';
// node scripts/autoplay.mjs firsthour [seeds=12] [react=6] [json] [old]: the deterministic first hour of a new player who does what the guide (ui/guide.ts) and the shop's message box (ui/notice.ts) say; see firstHour() below.
// node scripts/autoplay.mjs firsthour [seeds=12] [react=6] diag [old]: where the longest drought's money went, the cost ladder it stalls on, and whether the afford events at the start are decisions the player can take (droughtWhy()).

// NOCOMM=1 in the environment (or commissions: false) switches 找卡委托 off (game.ts GameEnv.commissions): the before/after pair of ROADMAP loop 17. The request's draw never
// touches the walk-in stream, so a run that never serves one is bit-identical either way.
export function boot(seed = 1, t0 = 1_700_000_000_000, { commissions = !process.env.NOCOMM } = {}) {
  let T = t0, s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = createGame({ now: () => T, random: rnd, storage: null, commissions });
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

// 找卡委托 the model saw and served: seen = requests asked for, held = of those, how many ever had their card in the binder or the case while open, done / paid = served and what they paid (seenAt / doneAt = seconds of play when each was asked / served).
function watchComm(G, clock) {
  const c = { seen: 0, held: 0, done: 0, paid: 0, seenAt: [], doneAt: [] }; let key = '', had = false;
  G.on(() => {
    const x = G.state.comm, k = x ? `${G.commKey(x)}@${x.due}` : ''; if (k !== key) { if (x) { c.seen++; c.seenAt.push(clock()); } key = k; had = false; }
    if (x && !had && (G.state.singles[G.commKey(x)]?.count || G.state.shown.some(s => s.key === G.commKey(x)))) { had = true; c.held++; }
  });
  return c;
}
// A player who serves the request whenever the binder holds its card (taking it off the case first if that is where it stands). True when it was served.
function serveComm(G, c, clock) {
  const x = G.state.comm; if (!x) return false;
  const key = G.commKey(x), i = G.state.singles[key]?.count ? -1 : G.state.shown.findIndex(k => k.key === key);
  if (i >= 0) G.unlist(i); else if (!G.state.singles[key]?.count) return false;
  if (!G.deliverCommission()) return false;
  c.done++; c.paid += x.reward; c.doneAt.push(clock()); return true;
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
// spare = buys growth only out of 闲钱 (G.spare: cash beyond the next bill), as the 成长 badge counts (a shelf a set waits for excepted).
// Shelves: an empty shelf gets the unlocked set with the fewest shelves (pricier sets first), so every set is on sale before any doubles up.
export function play({ hours = 3, openShare = 0.15, step = 20, seed = 1, pct = 1.0, cardPct = 1.0, masterShare = 0, luck, cap = {}, off = 0, branch = false, reserve = 0, repay = false, away, clerkFirst = false, heed = false, spare = false, binder = false, log = 600, hook } = {}) {
  const { G, SETS, advance } = boot(seed), rows = [], buys = []; let spent = 0, pot = 0, rev = 0, t = 0, nextRow = 0;
  const debt = watchDebt(G, () => t), comm = watchComm(G, () => t);
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
    serveComm(G, comm, () => t); // 找卡委托 first: before this visit sells the card to a peer or stands it in the case
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
    if (SETS.filter(x => G.unlocked(x.id)).length > G.racks() && G.canUpgrade('racks') && G.upgradeCost('racks') != null && G.lvl('racks') < (cap.racks ?? Infinity)) best = ['racks', G.upgradeCost('racks')]; // a set is waiting for a shelf: that comes first
    if (clerkFirst && G.lvl('clerk') < 1) best = ['clerk', G.upgradeCost('clerk')]; // someone who leaves the page for hours hires a clerk before anything else
    if (repay && G.state.loan > 0 && best?.[0] !== 'racks') best = null; // a repaying player clears a 10%-a-week loan before buying growth (else upgrades cheaper than the float always come first and the loan compounds)
    if (heed && G.clerkShort() > 0 && !keep) G.clerkNow(); // not in the last 5 minutes before a bill
    if (heed && best && G.lvl('clerk') && free() - best[1] < G.clerkBudget()) best = null; // the 成长 page's note under the button
    if (spare && best && best[0] !== 'racks' && best[1] > G.spare()) best = null; // the 成长 badge's rule: only 闲钱 (cash beyond the next bill) buys growth
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
  rows.debt = debt; rows.G = G; rows.buys = buys; rows.comm = comm;
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

// 开张的头十分钟 (game.ts OPENING): a new player who plays the story (`story` seconds, the shop clock paused if the game can pause it, else running),
// buys `packs` packs of the first set they can afford, shelves them at the default tag, and looks in every `look` seconds: restocks `packs` packs
// if the shelf is empty. Nothing else is bought. With `guide`, the player follows the new-player guide as it is now (guide.ts): the row's
// 补到满 (ui/common.ts refillQuote: a shelf's worth plus the one pack kept back, bought and shelved in one press) of every set the shop can sell, each on its own shelf, and the same again for a set
// whose shelf is empty at a look. Reports what the guide's first ten minutes feel like: flipper sweeps and when, seconds with every
// shelf bare (`bare`) and with some sellable set not on a shelf (`gap`), the 货柜 badge (pack buyers who found their set missing,
// G.missed) when the story ends and at the tenth minute, cash / profit, and whether the first bill was paid without a loan.
export function opening({ packs = 10, seed = 1, story = 40, look = 60, minutes = 10, guide = false } = {}) {
  const { G, SETS, advance } = boot(seed), open = SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
  const ids = guide ? open : [open.find(i => G.wholesale(i) * packs <= G.state.cash)];
  const missed = () => SETS.reduce((a, x) => a + G.missed(x.id), 0), out = { sweeps: [], bare: 0, gap: 0, restocks: 0, badge0: 0, badge: 0, cash: 0, profit: 0, sold: 0, bill: '' };
  if (G.pause) G.pause(true); for (let t = 0; t < story; t++) { advance(1); G.tick(); } if (G.pause) G.pause(false);
  out.badge0 = missed();
  const stockUp = id => {
    if (guide) { // the row key, as ui/common.ts refillQuote quotes it: the back room's spare packs go up as they are, else the shelf's gap is bought (cash and room permitting, at least 2 packs) and shelved
      const own = G.shelves().filter(s => s.id === id), st = G.state.stock[id] || 0;
      if (!own.length && G.shelves().every(s => s.id)) return;
      const room = own.length ? own.reduce((a, s) => a + G.depth() - s.qty, 0) : G.depth(), up = Math.min(room, st > 1 ? st - 1 : st);
      if (st > 1 && up) { G.shelve(id, up); return; }
      const n = Math.min(Math.max(0, Math.min(room + 1 - st, G.WAREHOUSE - st)), Math.floor(G.state.cash / G.wholesale(id)));
      if (n > 1 && G.buy(id, n)) G.shelve(id, Math.max(0, (G.state.stock[id] || 0) - 1));
      return;
    }
    G.buy(id, packs);
    const i = G.shelves().findIndex(s => s.id === id), j = i >= 0 ? i : G.shelves().findIndex(s => !s.id); if (j >= 0 && i < 0) G.place(j, id);
    G.shelve(id, packs);
  };
  ids.forEach(stockUp);
  let seen = G.state.recent[0]?.at ?? 0;
  for (let t = 1; t <= minutes * 60; t++) {
    advance(1); G.tick();
    for (const v of G.state.recent) { if (v.at <= seen) break; if (v.t === 'flipper' && v.r === 'sold') out.sweeps.push(`${t}s×${v.n}`); }
    seen = G.state.recent[0]?.at ?? seen;
    const q = open.map(G.shelfQty); if (q.every(x => !x)) out.bare++; if (q.some(x => !x)) out.gap++;
    if (t % look === 0) for (const id of ids) if (!G.shelfQty(id)) { stockUp(id); out.restocks++; }
  }
  out.badge = missed(); out.cash = Math.round(G.state.cash); out.sold = G.state.cust.sold;
  out.profit = Math.round(G.state.cash + ids.reduce((a, id) => a + (G.shelfQty(id) + (G.state.stock[id] || 0)) * G.wholesale(id), 0) - 1000); out.sweeps = out.sweeps.join(' ') || '—';
  for (let t = minutes * 60; t < 20 * 60 + 5; t++) { advance(1); G.tick(); if (t % look === 0) for (const id of ids) if (!G.shelfQty(id)) stockUp(id); } // on to the first bill (20 min), the same player
  out.bill = G.state.billsPaid > 0 && !(G.state.loan > 0) && !G.state.overdue ? 'paid' : G.state.overdue ? 'overdue' : 'loan';
  return out;
}

// The four kinds of player in GAMEPLAY.md「难度」, each over `seeds` seeds for `hours` of real time.
export const KINDS = {
  纯经营: s => play({ hours: s.hours, seed: s.seed, openShare: 0, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  普通: s => play({ hours: s.hours, seed: s.seed, step: 90, openShare: 0.02, pct: 1, reserve: 1, repay: true, log: 3600 }), // looks in every 90 s with the page open (ticks under G.AWAY apart are no absence), prices at market
  爱开包: s => play({ hours: s.hours, seed: s.seed, openShare: 0.05, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  开包上头: s => play({ hours: s.hours, seed: s.seed, openShare: 0.12, pct: 0.95, reserve: 1, repay: true, log: 3600 }),
  新手乱点: s => noob({ hours: s.hours, seed: s.seed }),
  // 冲动新手: stocks and prices like 普通 but keeps nothing back for bills and never repays: buys growth whenever the till covers it.
  // 看闲钱 is the same player buying only what the 成长 badge counts (闲钱). The pair measures the badge's lesson (GAMEPLAY.md §8).
  冲动新手: s => play({ hours: s.hours, seed: s.seed, step: 90, openShare: 0.02, pct: 1, log: 3600 }),
  '冲动新手·看闲钱': s => play({ hours: s.hours, seed: s.seed, step: 90, openShare: 0.02, pct: 1, spare: true, log: 3600 }),
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
// ---------- 第一小时 (firstHour): a new player who presses what the guide and the shop's message box tell them to ----------
// The decision rules are PORTED from src/ui/guide.ts (STEPS, current(), toStock/toRack, GRAD), src/ui/notice.ts (watchShop, pick, holds, fix,
// the box's printed counts), src/ui/upgrades.ts (nextStep, growCount), src/ui/common.ts (toShelf, shelfFill, deepFill, refillQuote, restock) and the event wiring of
// src/ui/story.ts / ach.ts (debtBeat, sceneFor, note/watch/check come from the real modules). Nothing in src/ui is imported (it needs a DOM), so
// a rule changed there must be changed here: this is a model of the UI, NOT exact UI parity. Deliberate assumptions and divergences:
//  - time is the fake wall clock, one second a step. The shop clock is paused while a scene is read (G.pause, as the story player does): a scene
//    costs lines × `read` seconds (default 3) and is not counted in shop time, so the third bill falls just past the hour.
//  - the player presses ONE prompt every `react` seconds (default 6), only after it has been on screen `react` seconds; priority: a sold-out box,
//    then the guide step, then other box kinds. A step whose button is on another page costs a tab press first. No presses during a reveal.
//  - a pack opened by hand holds the table (hold = true) for `reveal` seconds (default 15; mat.ts' real flip times depend on the cards). While
//    held: no achievement check, no scene, the box shows only 'out' (as ui does). On release both flush the same second (the UI's 400/600 ms
//    delays are dropped).
//  - the guide's 定价 step is answered with 「先按这个价卖」 (default price); 账单 with 「知道了」; no price is ever changed, so 倒爷 sweeps are only the default-price ones.
//  - what used to be boxes (「新到」「钱够升级了」「上柜」「图鉴补到 N%」「仓库留包」, all gone from ui/notice.ts) is persistent UI now, and this player presses it in the same priority order, each after `react` seconds on screen, not while the guide speaks:
//    the new set's row key on 货柜 (a rack is free, an unlocked set has none: `shelf row`); 展示柜's 补满柜位 (G.fillCase) when a slot is free and caseMoves() > 0, at most once per visit — the player is on the case page after 收卡's / 找卡's keys
//    and a 委托 delivery, else it costs a tab press to get there (the 展示柜 sub-tab's badge); 成长 when the 闲钱 covers nextStep() — the 「下一个目标」 line, the tab's badge — or, when `others` (default true), any level (the badge counts them all):
//    buy nextStep() if the 闲钱 covers it, else the cheapest level it covers, then back to 货柜; 卡册's 补到 N% on 欧气 (the cheapest tier 补卡 alone reaches, within a tenth of the next upgrade); the 开包 rail's 开 N 包 of what the warehouse holds. No 先不管 for any of them.
//  - the opening scene plays at t = 0 and is kept OUT of the event metric by default (`countOpening`): it would hide a leading drought.
//  - start time is local noon, so 夜猫子 can't fire from the time zone of whoever runs this.
//  - uiNotes (default true) mirrors the message box of the current ui/notice.ts, which says only events: a sold-out shelf (a newly unlocked set waiting for a free shelf rides along as a second, lower key), the first-sale note gated on earned.sealed, the first seeker / collector
//    sale each leave a 知道了 note, 找卡委托, and 收卡's button (去看收到的卡) takes the player to the case page. `old` (uiNotes: false) is the box before the card notes (cust.sold gate, no card/委托 notes); 成长 and 展示柜 above do not depend on it.
//    The 'old' baseline of ROADMAP (mean 20.4 events, mean longest drought 1055.8 s, worst 1557 s over seeds 1–12) was measured with the boxes that are gone now.
//  - 找卡委托 (comm, default on; `nocomm` on the command line / NOCOMM=1 switches it off for the before/after pair): the box shows its 「有人来找卡」 note once per request (not while the guide speaks, dropped when the
//    request is gone or the player is on 展示柜; its key goes to the case page), and a player who finds the card in the binder (or the case) serves it with one press, on to 展示柜 and 交付. The model knows at once
//    when the card is in the binder: the real panel shows it only on 展示柜, so this is the generous end. Requests are NOT M2 events (no ev() for them); their effect is only the cash and the presses they take.
//  - NOT modelled (so no events from them): receipts (SLIP), selling cards to peers, price changes, 离开/打烊, 还款 (repay), 破产 UI, the
//    phone layout, the sound/animation timings, 先不管 (the player never waves the sold-out box off).
// Event metric = the FIRST occurrence of each distinct thing: a set unlock, an upgrade/skill level becoming affordable (spare cash, 闲钱; only
// the levels nextStep() could recommend — 看店, 手气 and sub-2% 人气/扩建 are left out, as there), an achievement, a story scene, a 图鉴 tier
// of a set reached (a permanent walk-in step; `nodex` on the command line leaves it uncounted for comparison). Refills never count.
export function firstHour({ seed = 1, minutes = 60, react = 6, read = 3, reveal = 15, others = true, countOpening = false, basis = 'spare', snapEvery = 300, series = false, uiNotes = true, countDex = true, dump = false, comm = true } = {}) {
  const { G, SETS, advance } = boot(seed, new Date(2023, 10, 14, 12, 0, 0).getTime(), { commissions: comm && !process.env.NOCOMM }), N = minutes * 60;
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0), st = () => G.state;
  let t = 0, page = 'open', hold = false, holdLeft = 0, storyLeft = 0, cashPrev = st().cash;
  const cq = watchComm(G, () => t); let commNoted = ''; // cq: the requests this player saw and served; commNoted: the request its note was said for
  const rec = {}, events = [], seenEv = new Set(), acts = [];
  const stamp = () => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const ev = (kind, key, label, count = true, extra) => { const k = kind + ':' + key; if (seenEv.has(k)) return; seenEv.add(k); events.push({ t, at: stamp(), kind, key, label, count, ...(typeof extra === 'function' ? extra() : extra) }); };
  const did = s => acts.push(`${stamp()} ${s}`);
  // Diagnostics only (no random calls, no policy): money the player puts out, by kind. refill = packs bought by hand or clerk, growth = upgrades/skills
  // bought, bill = 九姐's bill_paid amounts, bonus = 成就 cash paid in; intake = state.intake.cost (收卡 at the counter); bare* = seconds a racked shelf stood empty.
  const sp = { refill: 0, growth: 0, bill: 0, bonus: 0 }, bare = { any: 0, all: 0 }, ser = [];
  let clerkAt = null, clerkSpent = 0;
  const pay = (id, n) => { const before = st().stock[id] || 0, ok = G.buy(id, n); if (ok) sp.refill += ((st().stock[id] || 0) - before) * G.wholesale(id); return ok; };
  // ----- common.ts -----
  const keepsBack = id => (G.lvl('clerk') && st().auto[id] ? G.CLERK_KEEP : 1); // common.ts: the clerk's kept-back packs don't count as shelvable stock
  const toShelf = id => { const own = G.shelves().filter(r => r.id === id), room = own.length ? own.reduce((a, r) => a + G.depth() - r.qty, 0) : G.depth(), n = st().stock[id] || 0, k = keepsBack(id); return Math.min(room, n > k ? n - k : k === 1 ? n : 0); };
  const shelfFill = id => { const own = G.shelves().filter(r => r.id === id), room = own.length ? own.reduce((a, r) => a + G.depth() - r.qty, 0) : G.depth(), s = st().stock[id] || 0, want = Math.max(0, Math.min(room + keepsBack(id) - s, G.WAREHOUSE - s)), n = Math.min(want, Math.floor(st().cash / G.wholesale(id))); return { n, full: n === want }; };
  // shelf.ts: a set row's ONE yellow key (common.ts refillQuote), the same quote as the sold-out box: 上架 N 包 from the back room when it holds
  // more than the pack kept back, else 补到满 — buy the shelf's gap (deepFill: bigger with a clerk on the set) and shelve it in the same press
  // (events.ts 'refill'). null = the key is off: no empty shelf for a set on none, a full shelf, cash under 2 packs.
  const rowKey = id => { if (!racked(id) && !G.shelves().some(r => !r.id)) return null; if (racked(id) && G.shelfQty(id) >= G.shelves().filter(r => r.id === id).length * G.depth()) return null; // common.ts: a full shelf's key is off
    const up = toShelf(id); if ((st().stock[id] || 0) > keepsBack(id) && up) return { act: 'shelve', id, n: up }; const f = deepFill(id); return f.n > 1 ? { act: 'refill', id, n: f.n } : null; };
  const canShelve = id => { const own = G.shelves().filter(r => r.id === id).length; return !!st().stock[id] && (own ? G.shelfQty(id) < own * G.depth() : G.shelves().some(r => !r.id)); };
  const unlockedIds = () => SETS.filter(x => G.unlocked(x.id)).map(x => x.id);
  // ----- guide.ts -----
  const sellable = () => SETS.filter(x => G.unlocked(x.id) && !G.unlockAt(x.id));
  const racked = id => G.shelves().some(r => r.id === id);
  const toStock = () => sellable().find(x => !(st().stock[x.id] || 0) && !racked(x.id) && st().cash >= G.wholesale(x.id) * 10);
  const toRack = () => sellable().find(x => (st().stock[x.id] || 0) > 1 && !racked(x.id) && G.shelves().some(r => !r.id));
  const graduated = () => { const s = st(); return s.billsPaid >= 2 || (sum(s.opened) >= 30 && (s.billsPaid > 0 || !G.nextBill())) || s.branch.n > 0 || !!s.branch.broke; };
  let billAt = 0;
  const STEPS = [
    { h: '进货', page: 'shelf', done: () => !toStock() && (sum(st().stock) + sum(st().opened) > 0 || G.shelves().some(r => r.id)),
      target: () => { const x = toStock(); return x ? rowKey(x.id) : null; } },
    { h: '摆上货架', page: 'shelf', done: () => G.shelves().some(r => r.id) && !toRack(),
      target: () => { const x = toRack() ?? SETS.find(s => G.unlocked(s.id) && canShelve(s.id)); return x && canShelve(x.id) ? { act: 'shelve', id: x.id, n: toShelf(x.id) } : null; } },
    { h: '定价', page: 'shelf', done: () => !!rec.price || Object.keys(st().price).length > 0,
      target: () => (G.shelves().some(r => r.id) ? { act: 'price' } : null) },
    { h: '开一包', page: 'open', done: () => sum(st().opened) > 0,
      target: () => { if (page !== 'shelf' && page !== 'open') return null; const s = unlockedIds().find(i => st().stock[i] > 0); if (s) return { act: 'open1', id: s };
        if (page === 'open') { const b = unlockedIds().find(i => st().cash >= G.wholesale(i)); if (b) return { act: 'buyopen', id: b }; } return null; } },
    { h: '账单', page: 'open', done: () => {
        if (!rec.bill && billAt > 0 && t * 1000 - billAt > 8000 && G.shelves().some(r => r.id && !r.qty)) rec.bill = 1;
        return !!rec.bill || st().billsPaid > 0 || !!st().overdue || !G.nextBill(); },
      target: () => (G.nextBill() ? { act: 'bill', always: true } : null) },
    { h: '补货', page: 'shelf', done: () => !G.shelves().some(r => r.id && !r.qty),
      target: () => { const id = G.shelves().find(r => r.id && !r.qty)?.id; return id ? rowKey(id) : null; } },
    { h: '测欧气', page: 'luck', done: () => !!rec.luck, target: () => null },
  ];
  const current = () => (rec.off || rec.done || graduated() ? -1 : STEPS.findIndex(s => !s.done()));
  const guiding = () => current() >= 0;
  // ----- upgrades.ts -----
  const KS = ['racks', 'depth', 'supplier', 'signage', 'talk', 'crowd', 'expand', 'clerk', 'apprentice', 'watch', 'case', 'luck'];
  const buyables = () => [
    ...Object.entries(G.UPGRADES).filter(([k]) => G.canUpgrade(k)).map(([k, u]) => ({ k, act: 'up', name: u.name, lv: G.lvl(k), cost: G.upgradeCost(k) })),
    ...Object.entries(G.SKILLS).filter(([k]) => G.canLearn(k)).map(([k, s]) => ({ k, act: 'learn', name: s.name, lv: G.skill(k), cost: G.skillCost(k) })),
  ].filter(b => b.cost != null);
  const live = all => all.filter(b => b.k !== 'watch' && b.k !== 'luck' && !((b.k === 'crowd' || b.k === 'expand') && G.peek(b.k, G.rate) / G.rate() - 1 < 0.02));
  const nextStep = () => { const all = buyables().sort((a, b) => a.cost - b.cost);
    if (SETS.filter(s => G.unlocked(s.id)).length > G.racks()) { const r = all.find(b => b.k === 'racks'); if (r) return r; }
    return live(all)[0] || all[0]; };
  const yellow = () => buyables().filter(b => b.cost <= st().cash && b.cost <= G.spare()).sort((a, b) => a.cost - b.cost || KS.indexOf(a.k) - KS.indexOf(b.k));
  const growPick = () => { const g = nextStep(); return !g || guiding() ? null : g.cost <= G.spare() ? g : others ? yellow()[0] ?? null : null; }; // what the player buys on 成长 once the 闲钱 covers something, if anything
  // ui/binder.ts 卡册's 补到 N%: the missing hits of the cheapest next 图鉴 tier a set can reach by 补卡 alone (at market): a permanent walk-in step. It lives on 欧气 as a yellow key now (no box says it any more); the player who has the
  // 闲钱 for one goes there and presses it, within a tenth of the next upgrade (a side purchase: it must not push 成长's next step back). Not while the guide speaks.
  const dexOffer = () => {
    if (guiding()) return null;
    let best = null;
    for (const s of SETS) { if (!G.unlocked(s.id) || G.master(s.id)) continue;
      const share = G.dexCount(s.id) / G.dexTotal(s.id), tier = G.DEX_TIERS.find(([at]) => share < at - 1e-9); if (!tier) continue;
      const need = Math.ceil(tier[0] * G.dexTotal(s.id) - 1e-9) - G.dexCount(s.id), miss = G.missing(s.id);
      if (need <= 0 || miss.length < need) continue;
      const cost = miss.slice(0, need).reduce((a, c) => a + c.price, 0);
      const cap = 0.1 * (nextStep()?.cost ?? Infinity);
      if (cost <= G.spare() && cost <= cap && (!best || cost < best.cost)) best = { id: s.id, need, cost }; }
    return best; };
  // shelf.ts: an unlocked set with no shelf, while a rack stands free, shows its row's yellow key (buy the quoted shelf and put it up); the player presses it on 货柜 once the guide is over
  const newSet = () => (guiding() || !G.shelves().some(r => !r.id) ? null : unlockedIds().find(id => !racked(id) && fix(id, false)) ?? null);
  // rail.ts 开包's right column lists the packs the warehouse holds with an 「开 N 包」 key (no box invites to it any more): the one 上架 leaves, or the clerk's kept-back packs (notice.ts' old keptAvailable);
  // the lowest-priority thing this player does: not while the guide speaks, and only while a shelf still sells
  const keptAvailable = id => (st().stock[id] || 0) >= 1 && (st().stock[id] || 0) <= (G.lvl('clerk') && st().auto[id] ? G.CLERK_KEEP : 1) && G.unlocked(id) && !G.master(id);
  const keptPack = () => {
    if (guiding() || !G.shelves().some(s => s.id && s.qty > 0)) return null;
    let id = null, share = Infinity;
    for (const s of SETS) if (keptAvailable(s.id)) { const p = G.dexCount(s.id) / G.dexTotal(s.id); if (p < share) { id = s.id; share = p; } }
    return id;
  };
  const boughtAt = {}, buy = b => { const ok = b.act === 'up' ? G.upgrade(b.k) : G.learn(b.k); if (ok) { sp.growth += b.cost; boughtAt[`${b.k}:${b.lv + 1}`] ??= t; } return ok; };
  // ----- notice.ts -----
  // uiNotes = the box of the current ui/notice.ts (events only: a sold-out shelf, the first-sale note gated on earned.sealed, 知道了 notes for the first seeker / collector sale, 找卡委托, 收卡's button going to the case page);
  // uiNotes: false = the box as it was before (cust.sold gate, no card notes). A sold-out shelf comes before every note: it cuts in over a printed note.
  let memo = null, memoShown = false, printed = null, soldBefore = uiNotes ? st().earned.sealed : st().cust.sold, tookBefore = st().intake?.n ?? 0;
  const stocked = {}, out = new Set(), fresh = new Set(), notes = [], known = new Set(unlockedIds());
  const rackedIds = () => [...new Set(G.shelves().filter(r => r.id).map(r => r.id))];
  // ui/common.ts deepFill: with a clerk, the box naming one set also stocks the back room with what the 闲钱 covers (the clerk shelves it)
  const deepFill = id => { const f = shelfFill(id), w = G.wholesale(id), s = st().stock[id] || 0; if (process.env.NODEEP || !G.lvl('clerk') || !st().auto[id] || f.n <= 1) return f;
    const n = Math.min(G.WAREHOUSE - s, f.n + Math.max(0, Math.floor((G.spare() - f.n * w) / w))); return n <= f.n ? f : { n, full: f.full }; };
  const fix = (id, alone = true) => { const up = toShelf(id); if ((st().stock[id] || 0) > keepsBack(id) && up) return { cost: 0, up, n: 0 }; const f = alone ? deepFill(id) : shelfFill(id); return f.n > 1 ? { cost: f.n * G.wholesale(id), up: 0, n: f.n } : null; };
  const outIds = () => { const all = [...out], fx = all.map(x => fix(x, false)), cost = fx.reduce((a, f) => a + (f?.cost ?? 0), 0); return all.length > 1 && fx.every(Boolean) && cost <= st().cash ? all : all.slice(0, 1); };
  const shelfMine = () => hold || STEPS[current()]?.h !== '补货'; // guide.ts guideShelf: only the guide's own 补货 step speaks for an empty shelf
  const holds = m => { switch (m.kind) {
    case 'first': case 'intake': case 'done': case 'cards': case 'comm': return notes[0] === m;
    case 'out': return shelfMine() && m.ids.every(i => out.has(i)) && outIds().length <= m.ids.length;
    default: return false; } };
  const pickMemo = () => (shelfMine() && out.size ? { kind: 'out', ids: outIds() } : notes[0] ?? null);
  let inWatch = false;
  function watchShop() {
    if (inWatch) return; inWatch = true;
    try {
      const s = st();
      if (soldBefore === 0 && (uiNotes ? s.earned.sealed > 0 : s.cust.sold > 0)) { if (!uiNotes || s.recent.find(x => x.r === 'sold' && !!x.n && !x.card)) notes.push({ kind: 'first' }); }
      soldBefore = uiNotes ? s.earned.sealed : s.cust.sold;
      if (!tookBefore && s.intake?.n) notes.push({ kind: 'intake' });
      tookBefore = s.intake?.n ?? 0;
      if (uiNotes) for (const buyer of ['seeker', 'collector']) {
        if (s.cardFirst?.[buyer]?.card && !notes.some(n => n.kind === 'cards' && n.buyer === buyer)) notes.push({ kind: 'cards', buyer });
      }
      if (uiNotes && comm) { // ui/notice.ts 找卡委托: one note per request, not while the guide speaks; it goes with the request, or once the player is looking at 展示柜
        const x = s.comm, k = x ? `${G.commKey(x)}@${x.due}` : '';
        for (let i = notes.length - 1; i >= 0; i--) if (notes[i].kind === 'comm' && (notes[i].key !== k || page === 'case')) notes.splice(i, 1);
        if (!x) commNoted = ''; else if (k !== commNoted && !guiding()) { if (page !== 'case') notes.push({ kind: 'comm', key: k }); commNoted = k; }
      }
      const on = rackedIds();
      for (const id of on) { const q = G.shelfQty(id) > 0; if (stocked[id] && !q) out.add(id); if (q) out.delete(id); stocked[id] = q; }
      for (const id of out) if (!on.includes(id)) out.delete(id);
      for (const id of unlockedIds()) if (!known.has(id)) { known.add(id); if (!on.includes(id)) fresh.add(id); }
      for (const id of fresh) if (on.includes(id)) fresh.delete(id); // keep a newly unlocked set pending until a shelf is free
      const cut = memo && memo.kind !== 'out' && out.size > 0 && shelfMine();
      if (!(memo && holds(memo) && !cut)) memo = pickMemo();
      // showMemo: hidden mid-reveal except a sold-out box; a box keeps its printed counts while it stays up and the cash covers them
      const shown = !!memo && !(hold && memo.kind !== 'out');
      if (shown) {
        const sets = memo.kind === 'out' ? memo.ids : [], fixes = sets.map(x => fix(x, sets.length === 1)), cost = fixes.reduce((a, f) => a + (f?.cost ?? 0), 0);
        // the newly unlocked set the sold-out box also names (a second, lower key): while a shelf stands free and there is something to put on it
        const add = memo.kind === 'out' && G.shelves().some(r => !r.id) ? [...fresh].find(i => fix(i, false)) : undefined, addFix = add ? fix(add, false) : null;
        const q = (id, f) => (f ? (f.up ? 'u' : `b${G.wholesale(id)}`) : '-');
        const ident = memo.kind === 'out' ? `out:${sets.join()}:${fixes.map((f, i) => q(sets[i], f)).join(',')}${add ? `+${add}:${q(add, addFix)}` : ''}` : memo.kind === 'cards' ? `cards:${memo.buyer}` : memo.kind === 'comm' ? `comm:${memo.key}` : memo.kind;
        if (!(memoShown && printed?.ident === ident && printed.cost <= s.cash && !(printed.cost > 0 && cost >= 2 * printed.cost + 1))) printed = { ident, cost, fixes, sets, add, addFix }; // ui/notice.ts: an outgrown quote is printed again
      }
      memoShown = shown;
    } finally { inWatch = false; }
  }
  // ----- achievements (ui/ach.ts) / story (ui/story.ts) -----
  const achFlush = () => { if (hold) return; for (const a of check(G)) { sp.bonus += a.cash; ev('ach', a.id, a.name); } };
  const seen = {}, queue = []; let cur = null, missedWeek = 0;
  const lines = id => SCENES[id].reduce((a, sc) => a + sc.lines.length, 0);
  function storyFlush() {
    while (!cur && !hold && queue.length) {
      const q = queue.shift();
      if (q.id === 'missed' && !st().overdue) continue;
      seen[q.id] = 1; if (q.key) seen[q.key] = 1;
      cur = q.id; storyLeft = lines(q.id) * read; G.pause(true);
      ev('story', q.id, q.id, q.id !== 'opening' || countOpening);
    }
  }
  function play(id, key) { if (!SCENES[id] || cur === id || queue.some(q => q.id === id)) return; queue.push({ id, key }); storyFlush(); }
  const unlockedN = () => unlockedIds().length;
  function storyEmit(e) {
    const b = debtBeat(e, G), late = b?.kind === 'paid' && !!b.week && b.week === missedWeek, id = sceneFor(b, seen, late);
    if (b?.kind === 'missed') missedWeek = b.week ?? 0;
    if (id === 'branch') seen.sets = unlockedN();
    if (b && id) play(id, b.key || undefined);
    const big = e?.open?.flat().filter(c => c.price >= BIG_PULL).sort((a, c) => c.price - a.price)[0];
    if (big && !seen.bigpull) play('bigpull');
    if (unlockedN() > (seen.sets ?? 0)) { seen.sets = unlockedN(); play('unlock'); }
  }
  // ----- bills -----
  const bills = {};
  const bill = w => (bills[w] ||= { week: w, amount: G.installment(w), due: null, paid: null, missed: null, loan: null, cashBefore: null });
  // ----- guide bookkeeping -----
  function guideSync() {
    const i = current();
    if (i >= 0 && STEPS[i].h === '账单' && !billAt) billAt = t * 1000 || 1;
    if (i < 0 && !rec.off && !rec.done && !graduated() && sum(st().opened) > 0) { rec.done = 1; notes.push({ kind: 'done' }); watchShop(); }
  }
  G.on(e => { // listener order of main.ts: message box, story, guide, achievements
    if (e?.type === 'bill_due' && e.week <= 3) { const b = bill(e.week); b.amount = e.amount; b.due = t; b.cashBefore = Math.round(cashPrev); b.shop = snap(); }
    if (e?.type === 'bill_paid') sp.bill += e.amount;
    if (e?.type === 'bill_paid' && e.week <= 3) { const b = bill(e.week); b.paid = t; b.cashAfter = Math.round(st().cash); }
    if (e?.type === 'bill_missed' && e.week <= 3) bill(e.week).missed = t;
    if (e?.type === 'loan_taken' && e.week <= 3) bill(e.week).loan = { t, amount: e.amount, forced: !!e.forced };
    watchShop(); storyEmit(e); guideSync();
    if (e?.open) note(G, e.open); watch(G); achFlush();
  });
  // ----- the player -----
  const refill = (x, dataN) => { if ((st().stock[x] || 0) > keepsBack(x) && toShelf(x)) { G.shelve(x, toShelf(x)); return; }
    const n = dataN ?? shelfFill(x).n; if (n > 1 && pay(x, n)) G.shelve(x, Math.max(0, (st().stock[x] || 0) - keepsBack(x))); };
  const openPack = (id, buyFirst, n = 1) => { if (hold) return; if (buyFirst && !pay(id, 1)) return; hold = true; holdLeft = reveal; page = 'open'; if (!G.open(id, n).length) { hold = false; holdLeft = 0; } };
  const grow = b => { page = 'grow'; if (buy(b)) did(`成长 ${b.name} Lv${b.lv + 1}`); page = 'shelf'; };
  // the box's second key, the newly unlocked set: shelve what the back room holds, or buy the printed quantity and shelve it
  function addKey() { const { add, addFix: f } = printed; did(`box out+ ${add}`); if (f.up) G.shelve(add, f.up); else refill(add, f.n); watchShop(); }
  // what is on screen, top priority first: { id, press }
  function prompts() {
    const ps = [], m = memoShown ? memo : null;
    if (m?.kind === 'out') { ps.push({ id: 'm:' + printed.ident, press: () => memoKey(m) }); if (printed.addFix) ps.push({ id: 'm+:' + printed.ident, press: addKey }); }
    const i = current();
    if (i >= 0) { const s = STEPS[i], tg = s.target();
      if (s.h === '测欧气') ps.push({ id: `g:${i}:${page === 'luck'}`, press: () => { page = 'luck'; if (sum(st().opened)) rec.luck = 1; did('guide 测欧气'); } });
      else if (tg && (tg.always || page === s.page || tg.act === 'open1' || tg.act === 'buyopen')) ps.push({ id: `g:${i}:${page}:${tg.act}:${tg.id ?? ''}:${tg.n ?? ''}`, press: () => guideKey(s, tg) });
      else if (page !== s.page) ps.push({ id: `g:${i}:tab`, press: () => { page = s.page; did(`tab ${s.page}`); } }); }
    if (m && m.kind !== 'out') ps.push({ id: 'm:' + printed.ident, press: () => memoKey(m) });
    const ns = newSet(); if (ns) ps.push(page === 'shelf' ? { id: `r:${ns}`, press: () => { did(`shelf row ${ns}`); refill(ns, fix(ns, false).n); } } : { id: 'r:tab', press: () => { page = 'shelf'; did('tab shelf'); } }); // 货架: the new set's row key
    // 展示柜: 补满柜位 (yellow while a slot is free and the binder holds cards for it), once per visit; a player whose 展示柜 tab badge shows walk-outs, or who passes through on a 委托, is on that page, else it costs a tab press first
    if (st().shown.length < G.slots() && G.caseMoves() > 0 && !(page === 'case' && caseFilled) && (page === 'case' || !guiding())) ps.push(page === 'case' ? { id: `f:${caseVisit}`, press: () => { did('展示柜 补满柜位'); caseFilled = true; G.fillCase(); } } : { id: 'v:case', press: () => { page = 'case'; did('tab case'); } });
    const up = growPick(); if (up) ps.push({ id: `u:${up.k}:${up.lv}`, press: () => grow(up) }); // 成长: the 下一个目标 line / the tab's badge
    const dx = dexOffer(); if (dx) ps.push({ id: `d:${dx.id}:${dx.need}`, press: () => { page = 'luck'; if (G.collect(dx.id, dx.need)) { sp.dex = (sp.dex || 0) + dx.cost; did(`卡册 补到 ${dx.id} ×${dx.need}`); } page = 'shelf'; } }); // 欧气: 卡册's 补到 N%
    const kp = keptPack(); if (kp) ps.push({ id: `k:${kp}:${st().stock[kp] || 0}`, press: () => { did(`rail 开 ${kp}`); openPack(kp, false, Math.min(10, st().stock[kp] || 0)); } }); // 开包 rail: 开 N 包 of what the warehouse holds
    const x = comm && !hold && st().comm; // 找卡委托: serve it once the binder (or the case) holds the card
    if (x && (st().singles[G.commKey(x)]?.count || st().shown.some(k => k.key === G.commKey(x)))) ps.push({ id: `c:${G.commKey(x)}@${x.due}`, press: () => { did(`deliver ${x.name}`); page = 'case'; serveComm(G, cq, () => t); watchShop(); } });
    return ps; }
  function guideKey(s, tg) {
    did(`guide ${s.h} ${tg.act}${tg.id ? ' ' + tg.id : ''}${tg.n ? ' ×' + tg.n : ''}`);
    if (tg.act === 'buy') pay(tg.id, tg.n); else if (tg.act === 'refill') refill(tg.id, tg.n); else if (tg.act === 'shelve') G.shelve(tg.id, tg.n);
    else if (tg.act === 'price') rec.price = 1; else if (tg.act === 'bill') rec.bill = 1;
    else if (tg.act === 'open1') openPack(tg.id, false); else if (tg.act === 'buyopen') openPack(tg.id, true); }
  function memoKey(m) {
    did(`box ${m.kind}${m.ids ? ' ' + m.ids.join() : m.id ? ' ' + m.id : ''}${m.key ? ' ' + m.key : ''}${m.buyer ? ' ' + m.buyer : ''}`);
    if (m.kind === 'first' || m.kind === 'intake' || m.kind === 'done' || m.kind === 'cards' || m.kind === 'comm') { if (uiNotes && (m.kind === 'intake' || m.kind === 'comm')) page = 'case'; notes.shift(); memo = null; memoShown = false; if (m.kind === 'cards') G.ackCardSale(m.buyer); } // 收卡's and 找卡's primary button goes to the case page (收卡: 去看收到的卡, 找卡: 去展示柜看看)
    else { const ids = printed.sets, fx = printed.fixes;
      if (ids.length > 1) for (const [i, x] of ids.entries()) refill(x, fx[i]?.n ?? 0);
      else if (fx[0]?.up) G.shelve(ids[0], fx[0].up);
      else if (fx[0]) refill(ids[0], fx[0].n);
      else page = 'shelf'; }
    watchShop(); }
  // ----- the clock -----
  const shownAt = new Map(); let lastPress = -1e9, caseVisit = 0, caseFilled = false, prevPage = page;
  const level = () => Object.keys(G.UPGRADES).reduce((a, k) => a + G.lvl(k), 0) + Object.keys(G.SKILLS).reduce((a, k) => a + G.skill(k), 0);
  const shelfGap = () => Math.round(G.shelves().reduce((a, r) => a + (r.id ? Math.max(0, G.depth() - r.qty) * G.wholesale(r.id) : 0), 0)); // what filling every labelled shelf to the top costs now
  const spent = () => ({ refill: Math.round(sp.refill), growth: Math.round(sp.growth), bill: Math.round(sp.bill), intake: Math.round(st().intake?.cost ?? 0), bonus: sp.bonus,
    idle: Math.round(st().extra.idle), offline: Math.round(st().extra.offline), tickets: Math.round(st().extra.tickets) });
  const snap = () => { const g = nextStep(), b = G.nextBill(), c = st().cust;
    return { t, cash: Math.round(st().cash), level: level(), racks: G.racks(), rate: +(G.rate() * 60).toFixed(2),
      spare: Math.round(G.spare()), bill: b ? b.amount : 0, next: g ? `${g.name} Lv${g.lv + 1} $${Math.round(g.cost)}` : null, nextCost: g ? Math.round(g.cost) : null, gap: shelfGap(),
      rev: Math.round(G.revenue()), visits: c.visits, sold: c.sold, pricey: c.pricey, none: c.none, spent: spent(), bare: { ...bare },
      held: Math.round(Object.values(st().singles).reduce((a, s) => a + s.price * s.count, 0)) }; }; // held = market value of singles in the binder (收卡 money not yet back)
  const rows = [], init0 = new Set(unlockedIds());
  watchShop(); seen.sets = init0.size; play('opening');
  for (t = 1; t <= N; t++) {
    if (page === 'case' && prevPage !== 'case') { caseVisit++; caseFilled = false; } prevPage = page; // a visit to 展示柜 starts when the player lands on it
    G.setIdle(page === 'shelf' || page === 'case'); advance(1); G.tick(hold); cashPrev = st().cash; // 挂机 counts on 货柜 (main.ts syncIdle)
    const round = st().clerkRound;
    if (round) {
      sp.refill += round.spent - (round.at === clerkAt ? clerkSpent : 0);
      clerkAt = round.at; clerkSpent = round.spent;
    }
    if (storyLeft > 0) { if (--storyLeft === 0) { cur = null; G.pause(false); storyFlush(); } if (t % snapEvery === 0) rows.push(snap()); continue; }
    for (const id of unlockedIds()) if (!init0.has(id)) ev('unlock', id, G.setById(id).name);
    for (const s of SETS) { const n = G.DEX_TIERS.filter(([at]) => G.dexCount(s.id) / G.dexTotal(s.id) >= at - 1e-9).length; if (n) ev('dex', `${s.id}:${n}`, `图鉴 ${G.setById(s.id).name} 第 ${n} 档`, countDex); } // a permanent walk-in tier of one set, reached
    const all = buyables().sort((a, b) => a.cost - b.cost), pool = live(all);
    if (SETS.filter(s => G.unlocked(s.id)).length > G.racks()) { const r = all.find(b => b.k === 'racks'); if (r && !pool.includes(r)) pool.push(r); }
    const afford = () => { const g = nextStep(), b = G.nextBill(), i = current(); // what the player faces when a level first becomes affordable (diagnostic)
      return { cash: Math.round(st().cash), spare: Math.round(G.spare()), bill: b ? b.amount : 0, gap: shelfGap(), guiding: i >= 0, step: i >= 0 ? STEPS[i].h : null, rec: g ? `${g.k}:${g.lv + 1}` : null, box: memoShown ? memo.kind : null, hold }; };
    for (const b of pool) if ((basis === 'cash' ? st().cash : G.spare()) >= b.cost) ev('afford', `${b.k}:${b.lv + 1}`, `${b.name} Lv${b.lv + 1} $${Math.round(b.cost)}`, true, afford);
    const gate = pool.filter(b => !seenEv.has(`afford:${b.k}:${b.lv + 1}`)).sort((a, b) => a.cost - b.cost)[0]; // the cheapest level that has not yet counted as an event
    const racked = G.shelves().filter(r => r.id); if (racked.some(r => !r.qty)) bare.any++; if (racked.length && racked.every(r => !r.qty)) bare.all++;
    if (series) ser.push({ t, cash: Math.round(st().cash), spare: Math.round(G.spare()), gate: gate ? Math.round(gate.cost) : null, gateName: gate ? `${gate.name} Lv${gate.lv + 1}` : null, rev: Math.round(G.revenue()), ...spent(), bareAny: bare.any, none: st().cust.none, sold: st().cust.sold });
    watchShop(); guideSync();
    if (hold) { if (--holdLeft <= 0) { hold = false; page = 'shelf'; achFlush(); storyFlush(); watchShop(); guideSync(); } } // cards flipped: back to 货柜, where 挂机 counts and #playmode says so
    else {
      achFlush(); storyFlush(); watchShop();
      if (!cur) {
        const ps = prompts(), ids = new Set(ps.map(p => p.id));
        for (const k of [...shownAt.keys()]) if (!ids.has(k)) shownAt.delete(k);
        for (const p of ps) if (!shownAt.has(p.id)) shownAt.set(p.id, t);
        const p = ps[0]; if (p && t - shownAt.get(p.id) >= react && t - lastPress >= react) { lastPress = t; shownAt.delete(p.id); p.press(); }
      }
    }
    if (t % snapEvery === 0) rows.push(snap());
  }
  t = N;
  const counted = events.filter(e => e.count), times = counted.map(e => e.t).sort((a, b) => a - b), edges = [0, ...times, N];
  let drought = { secs: 0, from: 0, to: 0 }; for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > drought.secs) drought = { secs: edges[i] - edges[i - 1], from: edges[i - 1], to: edges[i] };
  const per5 = Array.from({ length: Math.ceil(N / 300) }, () => 0); for (const e of counted) per5[Math.min(per5.length - 1, Math.floor(Math.max(0, e.t - 1) / 300))]++;
  const byKind = {}; for (const e of counted) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const firsts = Object.fromEntries(['unlock', 'afford', 'ach', 'story'].map(k => [k, counted.find(e => e.kind === k)?.t ?? null]));
  for (const w of [1, 2, 3]) bill(w);
  for (const e of events) if (e.kind === 'afford') e.boughtAt = boughtAt[e.key] ?? null; // when the player actually bought that level (null = never in the hour)
  // M2 判据 1 as revised 2026-10-05 (ROADMAP 决策记录): no 图鉴 tiers, an afford counts only if that level was bought within the hour;
  // (a) 0–30 min: every 5-min bucket ≥1, longest gap ≤240 s; (b) 30–60 min: every bucket ≥1, longest gap ≤480 s (gaps clipped to the half)
  const m2t = events.filter(e => e.count && e.kind !== 'dex' && (e.kind !== 'afford' || e.boughtAt != null)).map(e => e.t).sort((a, b) => a - b), m2e = [0, ...m2t, N];
  const gapIn = (a, b) => { let g = 0; for (let i = 1; i < m2e.length; i++) g = Math.max(g, Math.min(m2e[i], b) - Math.max(m2e[i - 1], a)); return g; };
  const m2b = Array.from({ length: Math.ceil(N / 300) }, () => 0); for (const x of m2t) m2b[Math.min(m2b.length - 1, Math.floor(Math.max(0, x - 1) / 300))]++;
  const m2 = { gapA: gapIn(0, 1800), gapB: gapIn(1800, N), emptyA: m2b.slice(0, 6).filter(n => !n).length, emptyB: m2b.slice(6).filter(n => !n).length };
  m2.a = !m2.emptyA && m2.gapA <= 240; m2.b = !m2.emptyB && m2.gapB <= 480;
  return { seed, comm: cq, per5, byKind, drought, firsts, m2, events: counted.length, timeline: events, snaps: rows, end: snap(), opened: sum(st().opened), sold: st().cust.sold, revenue: Math.round(G.revenue()), billsPaid: st().billsPaid, loan: Math.round(st().loan), loans: st().loans.map(l => ({ week: l.week, amount: l.amount, forced: l.forced })),
    bills: [1, 2, 3].map(w => bills[w]), shelves: G.shelves().map(r => r.id), acts, spent: spent(), bare, boughtAt, series: series ? ser : undefined, save: dump ? JSON.stringify({ ...st(), feat: { ...st().feat, ...Object.fromEntries(Object.entries(seen).map(([k, v]) => [`story:${k}`, +v || 0])), 'story:return': 1 } }) : undefined }; // the scenes this player saw go with it (ui/story.ts keeps them in feat), so the reviewer's tab doesn't replay them // dump: the save at the end, to hand a reviewer the 30→60 min stretch
}

// firsthour diagnosis (read-only on a run made with { series: true }): what the player's money did inside the longest event drought.
// Cash identity: cash = START_CASH + revenue + bonus − refill − growth − bill − intake (other = what that leaves unexplained, 0 when every outflow is counted).
export function droughtWhy(r) {
  const s = r.series, { from, to } = r.drought, at = x => s.findLast(p => p.t <= x) ?? s[0], a = at(from), b = at(to), win = s.filter(p => p.t > from && p.t <= to);
  const peak = win.reduce((m, p) => (p.spare > m.spare ? p : m), win[0]), near = win.filter(p => p.gate != null).reduce((m, p) => (p.gate - p.spare < m.gap ? { gap: p.gate - p.spare, p } : m), { gap: Infinity, p: null });
  const d = k => b[k] - a[k], mins = (to - from) / 60, buys = Object.entries(r.boughtAt).filter(([, x]) => x > from && x <= to).map(([k, x]) => `${k}@${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`);
  const clock = x => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  return { seed: r.seed, window: `${clock(from)}–${clock(to)}`, mins: +mins.toFixed(1), gate: `${a.gateName} $${a.gate}`, 'spare start→peak(@t)': `${a.spare}→${peak.spare}(@${clock(peak.t)})`, 'closest gate−spare': near.p ? `${near.gap}@${clock(near.p.t)} (gate $${near.p.gate}, spare ${near.p.spare}, cash ${near.p.cash})` : '-',
    'rev/min': Math.round(d('rev') / mins), 'refill/min': Math.round(d('refill') / mins), 'growth/min': Math.round(d('growth') / mins), 'bill': d('bill'), 'intake': d('intake'), 'cash Δ': d('cash'),
    'lost visits': d('none'), 'bare s': d('bareAny'), other: Math.round(d('cash') - (d('rev') + d('bonus') + d('idle') + d('offline') + d('tickets') - d('refill') - d('growth') - d('bill') - d('intake'))), 'bought in window': buys.join(' ') || '-',
    'buy waits min': Object.values(r.boughtAt).sort((x, y) => x - y).map((x, i, a) => Math.round((x - (a[i - 1] ?? 0)) / 60)).join(' ') };
}

// A checkpoint for a reviewer: the first-hour player's save at minute `minutes`, as a browser init script (pass it to addInitScript,
// or run it once on a same-origin page) that installs it once per tab session with every timestamp shifted so the save reads as
// just closed, and marks the guide done. With `npm run dev` the reviewer can then use ?speed=N / __dev.skip(sec) / __dev.speed(0)
// (src/ui/common.ts) to fast-forward waits; skipped time is idle time and goes in the report.
export function checkpoint(seed = 3, minutes = 30) {
  const save = firstHour({ seed, minutes, dump: true }).save, tag = `ptcg.cp.${seed}.${minutes}`;
  return `(() => {
  if (sessionStorage.getItem(${JSON.stringify(tag)})) return; sessionStorage.setItem(${JSON.stringify(tag)}, '1');
  const s = ${save}, d = Date.now() - s.savedAt, shift = v => (typeof v === 'number' && v > 1e12 ? v + d : v);
  s.savedAt += d; s.heatT = shift(s.heatT); s.clerkT = shift(s.clerkT);
  for (const k in s.flipT || {}) s.flipT[k] = shift(s.flipT[k]);
  for (const k in s.miss || {}) s.miss[k] = s.miss[k].map(shift);
  for (const v of s.recent || []) v.at = shift(v.at);
  for (const l of s.log || []) l.t = shift(l.t);
  for (const k in s.ach || {}) s.ach[k] = shift(s.ach[k]);
  if (s.clerkRound) s.clerkRound.at = shift(s.clerkRound.at);
  localStorage.setItem('ptcg-shop-v1', JSON.stringify(s));
  localStorage.setItem('ptcg.guide', JSON.stringify({ done: 1, price: 1, bill: 1, share: 1 }));
})();\n`;
}

if (process.argv[1]?.endsWith('autoplay.mjs')) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'checkpoint') { // node scripts/autoplay.mjs checkpoint [seed=3] [minutes=30] > /tmp/cp.js
    const [seed = 3, minutes = 30] = rest.map(Number); process.stdout.write(checkpoint(seed, minutes));
  } else
  if (mode === 'firsthour' && rest.includes('diag')) { // node scripts/autoplay.mjs firsthour [seeds=12] [react=6] diag [old]: why the longest drought, per seed (see droughtWhy); plus snaps and the starting-afford check. old = the message box before the collector/card notes (uiNotes: false)
    const [seeds = 12, react = 6] = rest.filter(x => x !== 'diag' && x !== 'old').map(Number), runs = Array.from({ length: seeds }, (_, i) => firstHour({ seed: i + 1, react, snapEvery: 300, series: true, uiNotes: !rest.includes('old') }));
    console.table(runs.map(droughtWhy));
    const R = runs[0]; console.log('seed 1 snaps every 300 s'); console.table(R.snaps.map(x => ({ t: x.t, cash: x.cash, spare: x.spare, bill: x.bill, next: x.next, 'shelf gap $': x.gap, rev: x.rev, ...x.spent, held: x.held, visits: x.visits, sold: x.sold, pricey: x.pricey, none: x.none, 'bare s': x.bare.any })));
    console.log('afford events that fired while the guide was still running (guiding) — can the player take them?');
    console.table(runs.flatMap(r => r.timeline.filter(e => e.kind === 'afford' && e.guiding).map(e => ({ seed: r.seed, at: e.at, level: e.label, cash: e.cash, spare: e.spare, 'shelf gap $': e.gap, step: e.step, rec: e.rec, box: e.box, 'bought at': e.boughtAt ?? '-' }))));
    const tot = k => runs.reduce((a, r) => a + r.spent[k], 0), rev = runs.reduce((a, r) => a + r.revenue, 0);
    const lag = runs.flatMap(r => r.timeline.filter(e => e.kind === 'afford' && !e.guiding && e.boughtAt != null).map(e => e.boughtAt - e.t)).sort((a, b) => a - b), unbought = runs.reduce((a, r) => a + r.timeline.filter(e => e.kind === 'afford' && !e.guiding && e.boughtAt == null).length, 0);
    console.log('afford events after the guide:', lag.length + unbought, '— bought later:', lag.length, `(median wait ${lag[lag.length >> 1]} s, max ${lag.at(-1)} s); never bought in the hour:`, unbought);
    console.log('hour totals over', seeds, 'seeds: revenue', rev, 'refill', tot('refill'), `(${Math.round(100 * tot('refill') / rev)}% of revenue)`, 'growth', tot('growth'), 'bill', tot('bill'), 'intake', tot('intake'), 'bonus', tot('bonus'));
  } else
  if (mode === 'firsthour') { // node scripts/autoplay.mjs firsthour [seeds=12] [react=6] [json] [old] [nodex] [nocomm]  (old = uiNotes: false, the baseline box before the collector/card notes, and no 找卡委托; nocomm = 找卡委托 off)
    const [seeds = 12, react = 6] = rest.filter(x => x !== 'json' && x !== 'old' && x !== 'nodex' && x !== 'nocomm').map(Number), runs = Array.from({ length: seeds }, (_, i) => firstHour({ seed: i + 1, react, uiNotes: !rest.includes('old'), countDex: !rest.includes('nodex'), comm: !rest.includes('nocomm') && !rest.includes('old') }));
    if (rest.includes('json')) console.log(JSON.stringify(runs, null, 1));
    else { console.table(runs.map(r => ({ seed: r.seed, events: r.events, per5: r.per5.join(' '), 'drought s': r.drought.secs, 'from–to': `${r.drought.from}–${r.drought.to}`, 'unlock/afford/ach/story s': [r.firsts.unlock, r.firsts.afford, r.firsts.ach, r.firsts.story].join('/'), cash: r.end.cash, level: r.end.level, racks: r.end.racks, 'walk-ins/min': r.end.rate, billsPaid: r.billsPaid, loan: r.loan })));
      const mean = f => +(runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(1); console.log('mean events', mean(r => r.events), 'mean longest drought s', mean(r => r.drought.secs), 'worst', Math.max(...runs.map(r => r.drought.secs)));
      console.log(`M2 (a) 0–30 min ≤240 s: ${runs.filter(r => r.m2.a).length}/${runs.length} (worst ${Math.max(...runs.map(r => r.m2.gapA))} s)  (b) 30–60 min ≤480 s: ${runs.filter(r => r.m2.b).length}/${runs.length} (worst ${Math.max(...runs.map(r => r.m2.gapB))} s)  [no 图鉴 tiers, afford only if bought; node ${process.version}]`);
      const late = (r, k) => r.comm[k + 'At'].filter(x => x > 1800).length, tot = (f, k) => runs.reduce((a, r) => a + f(r, k), 0); // 找卡委托 are not M2 events; this is what the model saw and served
      console.log(`找卡委托 (not M2 events): asked ${tot(r => r.comm.seen)} / card ever in the binder ${tot(r => r.comm.held)} / served ${tot(r => r.comm.done)} in the hour over ${runs.length} seeds (paid $${Math.round(tot(r => r.comm.paid))}); minutes 30–60: asked ${tot(late, 'seen')} / served ${tot(late, 'done')}`); }
  } else if (mode === 'opening') { const [packs = 10, seeds = 10] = rest.map(Number), guide = rest.includes('guide'); console.log(guide ? 'following the guide (补到满 of every sellable set)' : `${packs} packs a restock`); console.table(Array.from({ length: seeds }, (_, i) => opening({ packs, seed: i + 1, guide }))); }
  else if (mode === 'pace') { const [hours = 16, ...kinds] = rest; for (const k of kinds.length ? kinds : ['纯经营', '普通']) { const o = { 纯经营: { openShare: 0, pct: 0.95 }, 普通: { step: 90, openShare: 0.02, pct: 1 }, 收图鉴: { openShare: 0, pct: 1, masterShare: 0.02 } }[k]; console.log(k); console.table(pace({ ...o, reserve: 1, repay: true }, { hours: +hours })); } }
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
