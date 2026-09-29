// Fairness check: 200k simulated packs per set must land inside TCGplayer's measured 95% CI for every rarity.
// Run: node test/sim.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SETS as PTCG_SETS, DATA as PTCG_DATA } from '../src/sets.ts';
import * as S from '../src/sim.ts';
import { createGame } from '../src/game.ts';
import * as A from '../src/achievements.ts';
import * as ST from '../src/story.ts';
import * as D from '../src/debt.ts';

const N = 200000;
// 债务 (GAMEPLAY.md): the bill curve, auto-pay, loan interest, grace → forced loan → bankruptcy, the closed-shop rule, old saves,
// and a short survival check per kind of player (the full table is `node scripts/autoplay.mjs survive`).
{
  let T = 1_700_000_000_000; const store = {};
  const env = { now: () => T, random: S.rng(21), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const G = createGame(env), st = () => G.state, evs = []; G.on(ev => { if (ev?.type) evs.push(ev); });
  const run = secs => { for (let i = 0; i < secs; i += 20) { T += 20e3; G.tick(); } }, week = () => run(G.WEEK); // page open: a tick every 20 s (over 30 s is a closed stretch)
  // Bills: week 1's bill exists from the start (the opening scene prints it), each week's is ×BILL_G the last, and they add up to the debt.
  assert.deepEqual([st().debt, st().owe, st().loan, st().week], [G.DEBT0, G.DEBT0, 0, 1]);
  assert.deepEqual([G.nextBill().week, G.nextBill().amount], [1, G.BILL0], 'week 1 bill at start');
  let sum = 0, w = 1; for (; sum < G.DEBT0; w++) { const b = Math.min(G.DEBT0 - sum, Math.round(G.BILL0 * G.BILL_G ** (w - 1))); if (w > 1 && sum + b < G.DEBT0) assert.ok(b > Math.round(G.BILL0 * G.BILL_G ** (w - 2)), 'bills grow'); sum += b; }
  assert.ok(w - 1 >= 20 && w - 1 <= 30, `the first debt takes ${w - 1} weekly installments`);
  // Auto-pay: cash covers it, so the bill is paid the moment it falls due, and the story hears due then paid, once, for that week.
  st().cash = 1e5; st().earned.sealed = 1; week();
  assert.deepEqual(evs.map(e => [e.type, e.week, e.amount]), [['bill_due', 1, G.BILL0], ['bill_paid', 1, G.BILL0]]);
  assert.deepEqual([st().week, st().owe, st().billsPaid, st().cash], [2, G.DEBT0 - G.BILL0, 1, 1e5 - G.BILL0]);
  // Loan interest: $1,000 left alone for two weeks is $1,210 (10% a week, compounded); repaying takes the loan first.
  assert.ok(G.takeLoan(1000)); assert.equal(evs.at(-1).type, 'loan_taken'); week(); week();
  assert.equal(st().loan, 1210, 'weekly compound interest'); assert.equal(st().debt, st().owe + st().loan);
  const owe0 = st().owe; G.repay(1300); assert.deepEqual([st().loan, st().owe], [0, owe0 - 90], 'repay: loan first, then the installments');
  // Short of cash: bill_missed, 5 minutes of grace (paying works once cash is there), then 九姐 lends the difference.
  evs.length = 0; st().cash = 10; st().stock.sv08 = 50; week(); // (packs in the back room: no soft-lock loan in the way)
  assert.deepEqual(evs.map(e => e.type), ['bill_due', 'bill_missed']); assert.ok(st().overdue && !G.payBill(), 'overdue, and 10 cash does not pay it');
  const o = st().overdue, c0 = G.credit(); run(G.GRACE - 60); assert.ok(st().overdue, 'still in grace');
  run(80); assert.equal(st().overdue, null, 'grace over: borrowed and paid');
  assert.ok(evs.some(e => e.type === 'loan_taken' && e.forced) && evs.at(-1).type === 'bill_paid' && evs.at(-1).week === o.week);
  assert.ok(Math.abs(c0 - G.credit() - (o.amount - 10)) < 1, 'the forced loan is exactly the shortfall');
  // Bankruptcy: short again with no credit left. 九姐 takes the shop; the same shop number starts over at week 1 owing its debt again;
  // cards and the case go, 图鉴 / achievements / the 欧气 record / 名气 stay, and every later loan costs 5 points more.
  st().cash = 1e4; G.buy('sv08', 20); G.open('sv08', 20); st().ach.x = 1; st().branch.fame = 3;
  const L0 = G.luck(), dex0 = Object.keys(st().dexSeen).length; st().cash = 0; st().loan = G.creditLimit(); evs.length = 0;
  week(); run(G.GRACE + 20);
  assert.deepEqual(evs.map(e => e.type).filter(t => t !== 'loan_taken'), ['bill_due', 'bill_missed', 'bankrupt']);
  assert.ok(st().wreck && st().wreck.week > 1, 'the statement waits to be read');
  assert.deepEqual([st().week, st().debt, st().loan, st().cash, Object.keys(st().singles).length, st().shown.length, G.revenue()], [1, G.debt0(), 0, G.START_CASH, 0, 0, 0]);
  const L1 = G.luck(); assert.deepEqual([L1.packs, L1.value, L1.pct, Object.keys(st().dexSeen).length, st().ach.x, st().branch.fame, st().branch.n], [L0.packs, L0.value, L0.pct, dex0, 1, 3, 0], 'what you learned stays');
  assert.deepEqual([st().branch.broke, G.loanRate()], [1, G.LOAN_RATE + G.LOAN_MARK]); assert.ok(!G.canBranch(), 'a bankrupt shop cannot branch');
  G.ackWreck(); assert.equal(st().wreck, null);
  // Closed shop: however long, one stretch moves the bill clock one week at most (and without a clerk only an hour is credited).
  st().cash = 1e6; T += 8 * 3600e3; G.tick(); assert.equal(st().week, 2, 'eight hours closed = one visit from 九姐');
  // Soft-lock guard with no credit left is a bankruptcy, not a free top-up.
  G.reset(); st().cash = 0; st().loan = G.creditLimit(); T += 1e3; G.tick(); assert.equal(st().branch.broke, 1, 'nothing to sell, nothing to borrow: bankrupt');
  // Old save (no debt fields): the opening debt, week 1, and the first bill a full week away even after hours closed.
  store['ptcg-shop-v1'] = JSON.stringify({ cash: 5000, earned: { sealed: 2e4, singles: 0 }, up: { clerk: 1 }, savedAt: T - 5 * 3600e3 });
  const O = createGame(env); O.tick();
  assert.deepEqual([O.state.debt, O.state.week, O.state.overdue], [G.DEBT0, 1, null]); assert.ok(O.dueIn() >= G.WEEK - 1, `first bill ${O.dueIn()}s away`);
  delete store['ptcg-shop-v1'];
  // Each kind of player over a short horizon (GAMEPLAY.md §8 targets): the manager and the idler never go bankrupt; even a
  // newbie who never learns gets through the first 6 weeks.
  const { KINDS } = await import('../scripts/autoplay.mjs');
  const mgr = KINDS['纯经营']({ hours: 4, seed: 1 }).debt, idle = KINDS['挂机离线']({ hours: 48, seed: 1 }).debt, noob = KINDS['新手乱点']({ hours: 2, seed: 1 }).debt;
  assert.deepEqual([mgr.broke, idle.broke, noob.broke], [[], [], []], 'no bankruptcy for the manager (4h), the idler (48h) or the newbie in the first 2h');
  assert.ok(mgr.paid >= 11 && mgr.forced === 0, `the manager pays every bill from takings (${mgr.paid} paid, ${mgr.forced} forced loans)`);
  console.log(`ok 债务: ${w - 1} installments, $1,000 → $1,210 in 2 weeks, grace → loan → bankruptcy, 8h closed = 1 week; manager ${mgr.paid} bills in 4h, idler ${idle.paid} in 48h, newbie ${noob.paid} in 2h`);
}
// 剧情: every scene has lines, every line renders to text (debt lines with and without a bill; milestones always get their card/set); debt beats degrade to nothing
// on a game without the economy, map each event to its scene once per week, and a paid week after the first plays the short line.
{
  for (const [id, scenes] of Object.entries(ST.SCENES)) for (const sc of scenes) {
    assert.ok(sc.lines.length, `story ${id}: empty scene`);
    for (const l of sc.lines) for (const c of [...(['bigpull', 'unlock'].includes(id) ? [] : [{}]), { bill: '$12.00', week: 2, card: 'X', price: '$1', set: 'Y' }]) {
      const t = typeof l.t === 'string' ? l.t : l.t(c); assert.ok(t && !t.includes('undefined'), `story ${id}: "${t}"`);
    }
  }
  const g = createGame({ now: () => 0, random: S.rng(1), storage: { getItem: () => null, setItem() {} } });
  if (!g.nextBill) assert.equal(D.bill(g), null); // no economy yet: nothing to read
  assert.equal(D.debtBeat(undefined, g), null); assert.equal(D.debtBeat({ open: [] }, g), null);
  const fake = Object.assign(Object.create(g), { nextBill: () => ({ week: 3, amount: 120, dueAt: 9 }) });
  const due = D.debtBeat({ type: 'bill_due' }, fake);
  assert.deepEqual([due.kind, due.key, due.week, due.amount], ['due', 'due:3', 3, 120]);
  assert.equal(ST.sceneFor(due, {}), 'due'); assert.equal(ST.sceneFor(due, { 'due:3': 1 }), null);
  const paid = w => D.debtBeat({ type: 'bill_paid', week: w }, fake);
  assert.equal(ST.sceneFor(paid(1), {}), 'paid1'); assert.ok(['paid', 'paid2'].includes(ST.sceneFor(paid(2), { paid1: 1 })));
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'bankrupt' }, fake), { bankrupt: 1 }), 'bankrupt'); // a bankruptcy always plays
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'nope' }, fake), {}), null);
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'loan' }, fake), {}), 'loan');
  for (const k of ['due', 'paid1', 'paid', 'paid2', 'missed', 'loan', 'bankrupt']) assert.ok(ST.SCENES[k], `no scene ${k}`);
  console.log('ok story beats');
}
