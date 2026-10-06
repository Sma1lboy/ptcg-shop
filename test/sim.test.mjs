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
import * as BD from '../src/board.ts';
import * as SR from '../src/series.ts';

const N = 200000;
for (const set of PTCG_SETS) {
  assert.ok(PTCG_DATA[set.id], `no card data for ${set.id}`);
  for (const [slot, table] of Object.entries(S.slotTables(set))) {
    const sum = Object.values(table).reduce((a, b) => a + b, 0);
    assert.ok(sum < 100, `${set.id} ${slot} odds sum to ${sum}%`);
  }
  const r = S.rng(42), hits = {};
  let value = 0;
  for (let i = 0; i < N; i++) {
    const pack = S.openPack(set.id, r);
    assert.equal(pack.length, 11); // 4C 3U 2 reverse 1 rare-slot + basic Energy (PokéBeach config reveal)
    value += S.packValue(pack);
    for (const c of pack) hits[c.kind] = (hits[c.kind] || 0) + 1;
  }
  for (const [k, pct] of Object.entries(set.rates)) {
    const got = (hits[k] || 0) / N * 100;
    assert.ok(Math.abs(got - pct) <= set.ci[k], `${set.id} ${k}: sim ${got.toFixed(2)}% vs measured ${pct}% ± ${set.ci[k]}`);
  }
  // Mega Hyper Rare sits where the Hyper Rare it replaced sat: the second reverse slot (position 9 of the reveal order).
  if (set.rates.MHR) {
    const r2 = S.rng(3); let n = 0;
    for (let i = 0; i < 20000; i++) S.openPack(set.id, r2).forEach((c, j) => { if (c.kind === 'MHR') { n++; assert.equal(j, 9, `${set.id} MHR in slot ${j}`); } });
    assert.ok(n > 0, `${set.id}: no MHR in 20k packs`);
  }
  const ev = S.packEV(set.id), mean = value / N;
  assert.ok(Math.abs(mean - ev) / ev < 0.05, `${set.id} EV ${ev.toFixed(2)} vs sim mean ${mean.toFixed(2)}`);
  console.log(`ok ${set.id.padEnd(7)} EV $${ev.toFixed(2)} / pack $${set.packPrice} (${(ev / set.packPrice * 100).toFixed(0)}%)`);
}
// 手气 (game bonus) must leave the measured odds alone: with no bonus, openPack is byte-identical to the pre-手气 code
// (hash recorded from that code, 2000 packs per set, seed 42), and the default argument is the same as m = 1.
// Sets are locked in groups so adding a set never moves an existing digest: the first four sets, the three added with MHR, then me03–me05.
{
  const LOCK = [[['sv08', 'sv10', 'sv08.5', 'sv03.5'], '321b156f4309598b9545f432c25e2ae6fa16e292adf9bb8643c5a5e6c7df7254'],
    [['sv09', 'me01', 'me02'], 'fbedfccba29145577bd60d0040e7a88b3a6615c1c359e8afdb0c978ccd524953'],
    [['me03', 'me04', 'me05'], '8d63816751b209fc6187278b106fe6341f6aa8fbb4a4acef17e86e8f1d6070c4']];
  assert.deepEqual(LOCK.flatMap(([ids]) => ids), PTCG_SETS.map(s => s.id), 'every set is hash-locked');
  for (const [ids, digest] of LOCK) for (const m of [undefined, 1]) {
    const h = createHash('sha256');
    for (const id of ids) { const r = S.rng(42); for (let i = 0; i < 2000; i++) for (const c of S.openPack(id, r, m)) h.update(id + c.n + c.kind + '|'); }
    assert.equal(h.digest('hex'), digest, `no-bonus packs changed (${ids}, m=${m})`);
  }
  console.log('ok 手气 off = official odds, byte for byte');
}
// Each 手气 level: every hit rarity lands on official × m (the number the skill page and footer print), and so does each
// slot's total hit rate, which is what separates neighbouring levels. 40k packs per set per level, 4.5σ bands.
{
  const G0 = createGame({ storage: { getItem: () => null, setItem() {} } }), luckSkill = G0.SKILLS.luck;
  for (let lv = 1; lv <= luckSkill.max; lv++) {
    const m = S.roundM(1 + luckSkill.step * lv), n = 40000;
    for (const set of PTCG_SETS) {
      const eff = S.ratesFor(set, m), r = S.rng(1000 + lv), got = {};
      for (let i = 0; i < n; i++) for (const c of S.openPack(set.id, r, m)) got[c.kind] = (got[c.kind] || 0) + 1;
      const near = (count, pct, what) => { const p = pct / 100, sd = Math.sqrt(p * (1 - p) / n); assert.ok(Math.abs(count / n - p) <= 4.5 * sd, `手气 Lv${lv} ${set.id} ${what}: ${(count / n * 100).toFixed(2)}% vs stated ${pct.toFixed(2)}%`); };
      for (const k of S.HITS) if (set.rates[k]) { assert.ok(Math.abs(eff[k] - set.rates[k] * m) < 1e-9); near(got[k] || 0, eff[k], k); }
      for (const [slot, table] of Object.entries(S.slotTables(set, m))) {
        const sum = Object.values(table).reduce((a, b) => a + b, 0); assert.ok(sum < 100, `${set.id} ${slot} at ×${m} sums to ${sum}%`);
        if (sum) near(Object.keys(table).reduce((a, k) => a + (got[k] || 0), 0), sum, `${slot} slot total`);
      }
    }
  }
  console.log('ok 手气 levels hit their stated odds');
}
const p = S.luckPercentile({ sv08: 36 }, 0);
assert.equal(p, 0, 'zero value must be the unluckiest');
console.log('ok luck percentile');

// Single-pack ranking: monotone, 0 for an empty pack, ~1 for a huge pull, and a fresh pack lands where the sorted samples say (median ≈ 0.5).
{
  const id = PTCG_SETS[0].id, r = S.rng(99), vals = [];
  for (let i = 0; i < 4000; i++) vals.push(S.packValue(S.openPack(id, r)));
  assert.equal(S.packPercentile(id, 0), 0); assert.equal(S.packPercentile(id, 1e9), 1);
  const ps = vals.map(v => S.packPercentile(id, v)), mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `pack percentile mean ${mean.toFixed(3)} should be ~0.5`);
  assert.ok(S.packPercentile(id, 5) <= S.packPercentile(id, 50), 'pack percentile is monotone');
  console.log('ok pack percentile');
}

// Luck statistics: percentile must agree with a fresh, independent simulation, and hitTail with the binomial.
{
  const counts = { sv08: 30 }, r = S.rng(99), vals = [];
  for (let i = 0; i < 3000; i++) { let v = 0; for (let k = 0; k < 30; k++) v += S.packValue(S.openPack('sv08', r)); vals.push(v); }
  vals.sort((a, b) => a - b);
  for (const q of [0.1, 0.5, 0.9, 0.99]) {
    const got = S.luckPercentile(counts, vals[Math.floor(q * vals.length)]);
    assert.ok(Math.abs(got - q) < 0.03, `percentile at true q=${q} came out ${got}`);
  }
  assert.equal(S.luckPercentile(counts, 1e9), 1);
  // binomial(100, 0.0674) UR: P(X<=0)=(1-p)^100, P(X>=20) tiny
  assert.ok(Math.abs(S.hitTail({ sv08: 100 }, 'UR', 0) - Math.pow(1 - 0.0674, 100)) < 1e-9);
  assert.ok(S.hitTail({ sv08: 100 }, 'UR', 20) < 1e-4);
  assert.ok(Math.abs(S.hitTail({ sv08: 100 }, 'UR', 7) - 0.5) < 0.35);
  console.log('ok luck statistics');
}
// cardPrice must agree with what openPack stamped on each card, or repricing an old save shifts the luck baseline.
{
  const r = S.rng(5);
  for (const set of PTCG_SETS) for (let i = 0; i < 300; i++) for (const c of S.openPack(set.id, r))
    assert.equal(S.cardPrice(set.id, c.n, c.kind), c.price, `${set.id} ${c.n} ${c.kind}`);
  assert.equal(S.cardPrice('sv08', '999', 'RR'), null);
  console.log('ok cardPrice repricing');
}
// ---------- economy (src/game.ts) ----------
{
  let T = 1_700_000_000_000, seed = 12345;
  const store = {};
  const env = { now: () => T, random: () => S.rng(seed++)(), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } }; // deterministic, but a fresh stream per call is fine for shop rolls
  const G = createGame(env), st = () => G.state;

  // 1. No money pump: opening a pack and selling it at market value returns less than the pack costs even at the best supplier level,
  //    with 手气 maxed too, including the extra levels 名气 can buy.
  const bestWholesale = G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length, maxM = S.roundM(1 + G.SKILLS.luck.step * (G.SKILLS.luck.max + G.PERKS.luck.max)); // 手气 maxed + 名气「手气底子」maxed
  for (const set of PTCG_SETS) assert.ok(S.packEV(S.rateKey(set.id, maxM)) < set.packPrice * bestWholesale, `${set.id}: opening packs must stay negative EV even at 手气 ×${maxM}`);
  assert.ok(maxM <= 1.35, `the 手气 ceiling stays bounded (×${maxM})`);
  assert.ok(bestWholesale > G.BUYLIST * 0.8, 'supplier discount must not undercut what the sealed sale is worth');
  for (const [k, u] of Object.entries(G.UPGRADES)) assert.ok(u.costs.every((c, i, a) => !i || c > a[i - 1]), `${k} costs must increase`);
  assert.ok(G.DEX_TIERS.every(([a, b], i, t) => !i || (a > t[i - 1][0] && b >= t[i - 1][1])) && G.DEX_TIERS.at(-1)[0] === 1, 'dex tiers ascend and end at 100%');

  // Dragging the price rail: a draft price (commit = false) is what G.ask reads, but nothing is saved or broadcast until it commits.
  { G.setPrice('sv08', 1); const k = Object.keys(store)[0], before = store[k]; let heard = 0; G.on(() => heard++);
    G.setPrice('sv08', 0.8, false); assert.equal(G.pctOf('sv08'), 0.8); assert.deepEqual([store[k], heard], [before, 0], 'a draft price neither saves nor re-renders');
    G.setPrice('sv08', 0.8); assert.notEqual(store[k], before); assert.equal(heard, 1, 'letting go commits once'); G.setPrice('sv08', 1); }

  // 2. Stock -> shelf: buying fills the back room only, nothing sells until it is on the shelf.
  assert.equal(G.buy('sv08.5', 1), false, 'locked set cannot be stocked');
  st().cash = 1; assert.equal(G.buy('sv08', 999), false, 'cannot afford it');
  st().cash = 1e6; G.buy('sv08', 999);
  assert.equal(st().stock.sv08, G.WAREHOUSE, 'buy clamps to the warehouse');
  assert.equal(G.buy('sv08', 1), false, 'full warehouse');
  T += 3600e3; G.tick();
  assert.equal(st().earned.sealed, 0, 'unshelved packs never sell');
  assert.equal(st().stock.sv08, G.WAREHOUSE);
  // 统一货架: RACK_BASE shelves of DEPTH_BASE packs, one set per shelf. A set with no shelf takes the first empty one and fills only that.
  assert.equal(G.shelves().length, G.RACK_BASE);
  G.shelve('sv08', 999); assert.equal(G.shelfQty('sv08'), G.DEPTH_BASE, 'one shelf deep');
  assert.deepEqual(G.shelves().map(s => s.id), ['sv08', ...Array(G.RACK_BASE - 1).fill(null)], 'a set only takes one empty shelf by itself');
  assert.equal(st().stock.sv08, G.WAREHOUSE - G.DEPTH_BASE);
  G.unshelve('sv08', 5); assert.equal(G.shelfQty('sv08'), G.DEPTH_BASE - 5); assert.equal(G.shelves()[0].id, 'sv08', 'a shelf keeps its set when emptied');
  assert.ok(G.place(1, 'sv08')); assert.equal(G.facings('sv08'), 2, 'the same set can take a second shelf');
  G.shelve('sv08', 999); assert.equal(G.shelfQty('sv08'), 2 * G.DEPTH_BASE, 'shelve fills every shelf of the set');
  assert.equal(G.place(1, 'sv08.5'), false, 'locked set cannot be placed');
  const back = st().stock.sv08; st().stock.sv08 = G.WAREHOUSE;
  assert.equal(G.place(1, null), false, 'a shelf is not cleared into a full back room'); assert.equal(G.shelfQty('sv08'), 2 * G.DEPTH_BASE);
  st().stock.sv08 = back; G.buy('sv10', 3); assert.ok(G.place(1, 'sv10'));
  assert.deepEqual([G.shelfQty('sv08'), st().stock.sv08, G.shelfQty('sv10'), st().stock.sv10], [G.DEPTH_BASE, back + G.DEPTH_BASE, 3, 0], 'switching a shelf sends its packs back and fills it with the new set');
  G.setPrice('sv08', 9); assert.equal(G.pctOf('sv08'), G.MAX_PCT, 'price clamps'); G.setPrice('sv08', 0); assert.equal(G.pctOf('sv08'), G.MIN_PCT);
  G.setPrice('sv08', 1.02); assert.ok(Math.abs(G.pctOf('sv08') - 1) < 1e-9 && Math.abs(G.ask('sv08') - G.sealedPrice('sv08')) < 1e-9, 'price snaps to steps');
  assert.ok(G.upgrade('depth')); assert.equal(G.depth(), G.DEPTH_BASE + G.DEPTH_STEP); // 加层 first: 货架 and 进货渠道 are its branches
  const cash0 = st().cash; assert.ok(G.upgrade('racks')); assert.equal(st().cash, cash0 - G.UPGRADES.racks.costs[0]); assert.equal(G.shelves().length, G.RACK_BASE + 1);
  st().earned.sealed = G.unlockAt('sv08.5'); assert.ok(G.unlocked('sv08.5'));

  // 3. Customers respond to price. Same shop, same hour, three asking prices: cheap sells the most units, dear the fewest.
  const soldAt = pct => {
    G.reset(); st().cash = 1e6; st().earned.sealed = 1e6; T += 1; G.buy('sv08', 200); G.shelve('sv08', 20); G.setPrice('sv08', pct);
    let units = 0; for (let i = 0; i < 400; i++) { if (G.shelfQty('sv08') < 20) { st().stock.sv08 = 200; G.shelve('sv08', 20); } const b = G.shelfQty('sv08'); T += 5e3; G.tick(); units += b - G.shelfQty('sv08') + (G.shelfQty('sv08') > b ? 0 : 0); }
    return { units, sold: st().cust.sold, pricey: st().cust.pricey };
  };
  const lo = soldAt(0.8), mid = soldAt(1.0), hi = soldAt(1.4);
  assert.ok(lo.sold >= mid.sold && mid.sold > hi.sold, `sales fall as price rises: ${lo.sold}/${mid.sold}/${hi.sold}`);
  assert.ok(hi.pricey > mid.pricey && mid.pricey >= lo.pricey, 'more customers call it too dear as price rises');
  assert.ok(hi.sold < mid.sold * 0.5, 'at 140% of market most customers walk away');

  // 4. Card buyers: seekers/collectors only see the case; flippers take cheap packs in bulk; empty shop turns everyone away and never crashes.
  G.reset(); T += 1; st().earned.sealed = 1e6;
  for (let i = 0; i < 200; i++) { T += 5e3; G.tick(); }
  assert.equal(st().cust.sold, 0); assert.ok(st().cust.none > 0, 'nothing to buy means nobody buys');
  const hit = { set: 'sv08', n: '1', kind: 'SIR', r: 'SIR', name: 'test', price: 100, count: 3 };
  st().singles.a = hit;
  for (let i = 0; i < 10; i++) G.list('a');
  assert.equal(st().shown.length, G.CASE_BASE, 'case slots cap listings');
  G.setCardPrice(0, 1.25); assert.equal(G.cardAsk(st().shown[0]), 125);
  G.unlist(1); assert.equal(st().shown.length, G.CASE_BASE - 1); assert.ok(!G.list('nope'));
  const cash1 = st().cash; for (let i = 0; i < 400 && st().shown.length; i++) { T += 5e3; G.tick(); }
  assert.ok(st().shown.length < G.CASE_BASE - 1 && st().cash > cash1, 'someone eventually buys a fairly priced card from the case');
  st().singles.c = { ...hit, count: 1 }; G.list('c'); G.setCardPrice(st().shown.length - 1, 5);
  assert.equal(G.cardPct(st().shown.at(-1)), G.MAX_PCT, 'card price clamps');

  // 5. 镇店台: bounded and returned to stock. It changes who comes, not how many.
  st().singles.b = { ...hit, price: 1e7, count: 1 }; G.toPedestal('b');
  assert.ok(G.trophyBonus() < 0.5, 'the pedestal bonus is bounded');
  const rate0 = G.rate(); G.uncollect(G.PEDESTAL); assert.equal(G.rate(), rate0, 'the pedestal does not change walk-in rate'); assert.equal(st().singles.b.count, 1);

  // 5b. Every walk-in is kept for the 顾客 panel and 店内动态: what they came for, the asking price, the most they would pay, how it
  //     ended. The records have to agree with the till and with the rule that decided the sale.
  {
    G.reset(); st().cash = 1e6; st().earned.sealed = 1e6; T += 1; G.buy('sv08', 200); G.shelve('sv08', 20); G.setPrice('sv08', 1.05);
    assert.equal(st().log[0].amt, -G.wholesale('sv08') * 200, 'the till roll keeps money out of the text, in its own field');
    const took0 = st().earned.sealed + st().earned.singles;
    for (let i = 0; i < 60; i++) { if (G.shelfQty('sv08') < 5) G.shelve('sv08', 20); T += 5e3; G.tick(); }
    const vs = st().recent, took = st().earned.sealed + st().earned.singles - took0;
    assert.ok(vs.length > 20 && vs.every(v => v.at <= T && v.at > T - G.MISS_WINDOW * 1000), 'walk-ins are stamped and kept for the window');
    assert.ok(Math.abs(vs.reduce((a, v) => a + (v.gain || 0), 0) - took) < 1e-6, 'what the visits paid adds up to the takings');
    const op = vs.filter(v => v.t === 'opener' && v.set === 'sv08');
    assert.ok(op.some(v => v.r === 'sold') && op.some(v => v.r === 'pricey'), 'at 105% some buy and some balk');
    for (const v of op) {
      if (v.r === 'sold') assert.ok(v.pct <= v.max && v.n >= 1 && Math.abs(v.gain - Math.round(v.price * v.pct * 100) / 100 * v.n) < 1e-6, 'a buyer paid the tag at the market price of the moment, and could afford it');
      if (v.r === 'pricey') assert.ok(v.why === 'budget' ? v.pct <= v.max : v.pct > v.max, 'who calls it too dear had a ceiling under the tag');
    }
    for (let i = 0; i < 20; i++) { T += 60e3; G.tick(); }
    assert.ok(st().recent.every(v => v.at > T - G.MISS_WINDOW * 1000 - 60e3), 'older walk-ins drop out of the window');
  }

  // 6. Old saves. Pre-storefront: packs that used to be "on sale" land on a shelf. Walk-ins saved as text lines are dropped.
  store['ptcg-shop-v1'] = JSON.stringify({ cash: 10, stock: { sv08: 7 }, singles: {}, recent: [{ t: 'opener', r: 'sold', text: '拆包玩家买走 1 包…' }] });
  const G2 = createGame(env); // a page reload: a second game over the same storage
  assert.equal(G2.shelfQty('sv08'), 7); assert.equal(G2.state.stock.sv08 || 0, 0); assert.deepEqual(G2.state.recent, []);
  // Pre-统一货架: one shelf per set and a 货架 level that deepened them all. Every set that was on sale gets a shelf of its own,
  // the old level becomes 加层 (same depth as the old per-set shelf), prices carry over, and every pack survives: sv10 is over
  // its old cap on purpose, the extra goes to the back room even past the back room's cap.
  {
    const old = { cash: 10, earned: { sealed: 1e4, singles: 0 }, up: { shelf: 2, signage: 1 }, stock: { sv08: 3, sv10: G.WAREHOUSE },
      shelf: { sv08: { qty: 60, pct: 0.9 }, sv10: { qty: 170, pct: 1.1 }, 'sv08.5': { qty: 0, pct: 1.3 }, 'sv03.5': { qty: 5, pct: 1 } } };
    store['ptcg-shop-v1'] = JSON.stringify(old);
    const G3 = createGame(env), s3 = G3.state;
    for (const [id, o] of Object.entries(old.shelf)) {
      assert.equal(G3.shelfQty(id) + (s3.stock[id] || 0), o.qty + (old.stock[id] || 0), `${id}: no pack lost`);
      assert.equal(G3.pctOf(id), o.pct, `${id}: price kept`); assert.equal(G3.facings(id), o.qty ? 1 : 0, `${id}: one shelf if it was on sale`);
    }
    assert.equal(s3.up.shelf, undefined); assert.equal(G3.lvl('signage'), 1); assert.equal(G3.lvl('depth'), 2); assert.equal(G3.racks(), 3);
    assert.equal(G3.shelves().length, G3.racks()); assert.equal(G3.shelfQty('sv08'), 60); assert.equal(G3.depth(), G3.DEPTH_BASE + 2 * G3.DEPTH_STEP, 'old 货架 Lv2 becomes 加层 Lv2 (at least the 60 per set it held)'); assert.ok(G3.depth() >= 60);
    assert.ok(s3.stock.sv10 > G.WAREHOUSE); assert.equal(G3.buy('sv10', 1), false, 'over-full back room just refuses more');
    G3.setPrice('sv10', 1.1); const G4 = createGame(env); // saved in the new format: loads unchanged
    assert.deepEqual([G4.state.shelves, G4.state.stock, G4.state.price, G4.state.up], [s3.shelves, s3.stock, s3.price, s3.up]);
  }
  delete store['ptcg-shop-v1'];

  // 7. Soft-lock guard, 图鉴 and the clerk.
  G.reset(); st().cash = 0; T += 1e3; G.tick();
  assert.equal(st().cash, G.BAILOUT, 'broke shop with nothing to sell is lent stock money'); assert.equal(st().loan, G.BAILOUT, '…as a loan from 九姐'); T += 1e3; G.tick(); assert.equal(st().cash, G.BAILOUT);
  G.reset(); st().cash = 1e6; G.buy('sv08', 1); const [pack] = G.open('sv08', 1);
  assert.equal(G.dexCount('sv08'), new Set(pack.filter(c => c.r !== 'E').map(c => c.n)).size, 'opening records new card numbers');
  const r0 = G.rate(); for (let i = 0; i < 400; i++) { G.buy('sv08', 10); G.open('sv08', 10); }
  assert.ok(G.dexBonus() > 0 && G.rate() > r0, 'collecting raises word-of-mouth'); assert.ok(G.dexCount('sv08') > G.dexTotal('sv08') * 0.75);
  G.reset(); st().cash = 1e6; st().earned.sealed = 1e6; G.buy('sv08', 1); G.shelve('sv08', 1); G.upgrade('clerk');
  assert.ok(st().auto.sv08, 'first clerk level turns auto-restock on for sets already in use');
  G.buy('sv10', 1); G.place(1, 'sv10'); assert.ok(st().auto.sv10, 'a set put on a shelf later is restocked too');
  G.setAuto('sv10', false); G.place(1, null); G.place(1, 'sv10'); assert.equal(st().auto.sv10, false, 'unless the player turned it off');
  T += 3 * 3600e3; G.tick(); assert.ok(G.shelfQty('sv08') > 0 || st().earned.sealed > 1e6, 'clerk keeps the shelf stocked while the shop is closed');
  assert.ok(st().offline.sales > 20, `a clerk lets a closed shop keep selling past one shelf (${st().offline.sales} sales)`);
  // 货柜 page: pack buyers who came for a set that was on no shelf are counted per set, for the last MISS_WINDOW seconds.
  G.reset(); st().cash = 1e6; T += 1; G.buy('sv08', 200); G.shelve('sv08', 999);
  for (let i = 0; i < 60; i++) { T += 5e3; G.tick(); if (G.shelfQty('sv08') < 10) { G.buy('sv08', 100); G.shelve('sv08', 999); } } // the back room is topped up too: 200 packs can sell out inside the 5 minutes
  assert.ok(G.missed('sv10') > 0 && G.missed('sv08') === 0, `the set left off the shelves is the one missed (${G.missed('sv10')} / ${G.missed('sv08')})`);
  T += (G.MISS_WINDOW + 60) * 1e3; assert.equal(G.missed('sv10'), 0, 'old misses drop out of the window'); G.tick(); // catch up here, not in the next block
  // The clerk works in rounds: half full at level 1, and a shelf emptied between rounds stays empty until the next one.
  G.reset(); st().cash = 1e6; st().earned.sealed = 1e6; T += 1; G.buy('sv08', 1); G.shelve('sv08', 1); G.setPrice('sv08', G.MAX_PCT); G.upgrade('clerk'); // at 160% nobody buys
  const half = Math.ceil(G.depth() / 2); T += 1e3; G.tick(); assert.equal(G.shelfQty('sv08'), half, 'level 1 tops a shelf up to half');
  G.shelves()[0].qty = 0; T += 60e3; G.tick(); assert.equal(G.shelfQty('sv08'), 0, 'no restock between rounds');
  T += G.CLERK_ROUND * 1e3; G.tick(); assert.equal(G.shelfQty('sv08'), half, 'next round restocks');
  G.upgrade('clerk'); G.shelves()[0].qty = 0; T += G.CLERK_ROUND * 1e3; G.tick(); assert.equal(G.shelfQty('sv08'), G.depth(), 'level 2 fills it');
  st().singles.z = { set: 'sv08', n: '1', kind: 'C', r: 'C', name: 'bulk', price: 0.1, count: 5 }; T += 1e3; G.tick();
  assert.equal(st().singles.z, undefined, 'rounds are for restocking only: level 2 still sells the bulk at once');

  // 8. Luck baseline: value is re-priced with today's data, so a price refresh cannot skew the percentile.
  {
    G.reset(); st().cash = 1e6; G.buy('sv08', 40); G.open('sv08', 40);
    const v0 = G.luck().value; assert.ok(G.luck().live && Math.abs(v0 - st().pulled) < 1e-6, 'fresh save: repriced value equals snapshot');
    for (const c of PTCG_DATA.sv08.cards) for (const k in c.p) c.p[k] *= 2; // prices double after a data refresh
    G.buy('sv08', 1); G.open('sv08', 1); // clears the luck cache
    const L = G.luck(); assert.ok(L.value > (v0 + 0) * 1.5, 'value follows current prices');
    st().dexPacks = 0; // pre-dex save: falls back to the snapshot
    G.open('sv08', 0); G.buy('sv08', 1); G.open('sv08', 1);
    assert.equal(G.luck().live, false, 'old saves are flagged');
    // The vm contexts used to give this block its own copy of data/; with one module graph, undo the refresh before autoplay below (×2 ÷2 is exact).
    for (const c of PTCG_DATA.sv08.cards) for (const k in c.p) c.p[k] /= 2;
  }

  // 9. No single right price: undercutting into flipper range stops paying (flippers flip a set once per FLIP_COOLDOWN),
  //    and sets have their own buyers, so the best price differs per set. Profit of one set over 2 sim-hours, shelves kept full.
  {
    seed = 12345; // its own random stream: the margins are narrow, so how many rolls earlier blocks used must not decide it
    const PCTS = [0.85, 0.9, 1, 1.1];
    const profitAt = (id, pct) => {
      G.reset(); st().cash = 1e9; st().earned.sealed = 1e6; st().up.racks = G.UPGRADES.racks.costs.length; st().up.depth = G.UPGRADES.depth.costs.length; T += 1;
      for (const x of PTCG_SETS) G.setPrice(x.id, x.id === id ? pct : 1);
      let p = 0;
      for (let i = 0; i < 720; i++) {
        for (const x of PTCG_SETS) { G.buy(x.id, 200); G.shelve(x.id, 999); }
        const q = G.shelfQty(id), margin = G.ask(id) - G.wholesale(id); T += 10e3; G.tick(); p += (q - G.shelfQty(id)) * margin;
      }
      return p;
    };
    const a = PCTS.map(x => profitAt('sv08', x)), b = PCTS.map(x => profitAt('sv08.5', x)), at = (v, x) => v[PCTS.indexOf(x)], best = v => PCTS[v.indexOf(Math.max(...v))];
    assert.ok(at(b, 1) > at(b, 0.85) && at(b, 1.1) > at(b, 0.85), `棱镜进化 buyers pay over market: 85% must not beat 100%/110% (${b.map(Math.round)})`);
    assert.ok(at(a, 0.85) > at(a, 1.1), `超电突围 buyers shop around: 85% beats 110% (${a.map(Math.round)})`);
    assert.ok(best(b) > best(a), `best price differs per set: 超电 ${best(a)}, 棱镜 ${best(b)}`);
  }

  // 10. 图鉴补卡: missing hits can be bought at market into the binder only; C/U/R still have to be pulled; 大师套 pays.
  {
    G.reset(); st().cash = 1e6; T += 1;
    assert.equal(G.collect('sv08.5'), false, 'locked set cannot be collected');
    G.buy('sv08', 5); G.open('sv08', 5);
    const miss = G.missing('sv08'), first = miss[0], n0 = G.dexCount('sv08'), cash0 = st().cash;
    const before = JSON.stringify([st().singles, st().shown, st().gallery, st().dex, st().pulled]);
    assert.ok(miss.every((c, i) => G.BUY_R.includes(c.r) && (!i || c.price >= miss[i - 1].price)), 'only hits are for sale, cheapest first');
    assert.ok(G.collect('sv08'));
    assert.equal(first.price, S.cardPrice('sv08', first.n, first.r)); assert.ok(Math.abs(cash0 - st().cash - first.price) < 1e-9, 'a card costs its market price');
    assert.equal(G.dexCount('sv08'), n0 + 1);
    assert.ok(G.collect('sv08', true)); assert.equal(G.missing('sv08').length, 0); assert.equal(G.collect('sv08'), false, 'nothing left to buy');
    assert.equal(JSON.stringify([st().singles, st().shown, st().gallery, st().dex, st().pulled]), before, 'bought cards never become sellable (no buy-at-market, list-at-160% pump) and are not pulls');
    assert.ok(G.luck().live, 'luck baseline untouched');
    assert.ok(!G.master('sv08'), 'C/U/R only come from packs');
    st().cash = 0; assert.equal(G.collect('sv10'), false, 'cannot afford it'); st().cash = 1e6;
    const tol0 = G.demand('sv08').tol, w0 = G.demand('sv08').w, rate0 = G.rate();
    for (let i = 0; i < 300 && !G.master('sv08'); i++) { G.buy('sv08', 10); G.open('sv08', 10); }
    assert.ok(G.master('sv08'), 'opening packs finishes the C/U/R');
    assert.ok(Math.abs(G.demand('sv08').tol - tol0 - G.MASTER.tol) < 1e-9 && G.demand('sv08').w > w0, '大师套: that set\'s pack buyers pay more and come more');
    assert.ok(G.rate() > rate0 && Math.abs(G.dexBonusOf('sv08') - G.DEX_TIERS.reduce((x, t) => x + t[1], 0)) < 1e-9, '大师套 collects every dex tier of that set');
  }
  // 11. 手气 in the shop: each pack is recorded with the odds it was opened at, expected value and tallies follow those odds,
  //     and the luck percentile is judged against players with the same bonus (a boosted pull is not "you got lucky").
  {
    G.reset(); st().cash = 1e9; T += 1;
    assert.equal(G.luckMult(), 1); G.buy('sv08', 4); G.open('sv08', 4);
    for (let i = 0; i < G.SKILLS.luck.max; i++) assert.ok(G.learn('luck'));
    assert.equal(G.learn('luck'), false, 'maxed'); const m = G.luckMult(), key = S.rateKey('sv08', m);
    G.buy('sv08', 6); G.open('sv08', 6);
    assert.deepEqual(st().packsBy, { sv08: 4, [key]: 6 }); assert.equal(st().opened.sv08, 10);
    const L = G.luck(); assert.equal(L.boosted, 6);
    assert.ok(Math.abs(L.expected - 4 * S.packEV('sv08') - 6 * S.packEV(key)) < 1e-9, 'expected value uses the odds each pack was opened at');
    assert.ok(Math.abs(G.expectedTally().SIR - (4 * 1 + 6 * m) * PTCG_SETS[0].rates.SIR / 100) < 1e-9);
    assert.equal(G.learn('apprentice'), false, '带徒弟 needs a clerk first');
    // Unbiased: 60 maxed-手气 players of 40 packs average the 50th percentile against boosted peers, but would read as lucky against official odds.
    let fair = 0, naive = 0;
    for (let i = 0; i < 60; i++) {
      G.reset(); st().cash = 1e9; st().skills.luck = G.SKILLS.luck.max; G.buy('sv08', 40); G.open('sv08', 40);
      fair += G.luck().pct / 60; naive += S.luckPercentile({ sv08: 40 }, G.luck().value, 1000) / 60;
    }
    assert.ok(Math.abs(fair - 0.5) < 0.1 && naive > fair + 0.06, `手气 players sit mid-pack among boosted peers (${fair.toFixed(2)}), not above official ones (${naive.toFixed(2)})`);
    store['ptcg-shop-v1'] = JSON.stringify({ cash: 10, opened: { sv08: 7 } }); assert.deepEqual(createGame(env).state.packsBy, { sv08: 7 }, 'old saves: all packs at official odds'); delete store['ptcg-shop-v1'];
  }
  // 12. Later sets: each has its buyers, unlocks after the first four in release order, and once unlocked brings its own walk-ins
  //     (their packs are cheaper than the first four's average, so without them unlocking a set would cut a shop's income).
  //     Their Mega Hyper Rares can be bought for the 图鉴 like any other hit.
  {
    G.reset(); T += 1; const r0 = G.rate();
    assert.equal(G.lineup(), 0, 'no new-set crowd before anything unlocks');
    const late = PTCG_SETS.filter(s => G.DEMAND[s.id]?.crowd).sort((a, b) => a.released.localeCompare(b.released));
    assert.ok(PTCG_SETS.every(s => G.DEMAND[s.id]) && late.length === PTCG_SETS.length - 4, 'every set has buyers, every set after the first four brings walk-ins');
    assert.ok(late.every((s, i) => G.unlockAt(s.id) > G.unlockAt('sv03.5') && (!i || G.unlockAt(s.id) > G.unlockAt(late[i - 1].id))), 'later releases unlock later');
    st().earned.sealed = G.unlockAt(late[0].id); assert.ok(Math.abs(G.rate() / r0 - 1 - G.DEMAND[late[0].id].crowd) < 1e-9, 'one new set, its crowd');
    st().earned.sealed = 1e9; assert.ok(Math.abs(G.rate() / r0 - G.crowdMult(1 + late.reduce((a, s) => a + G.DEMAND[s.id].crowd, 0))) < 1e-9, 'all of them (together past the knee, so through the 客流上限)');
    assert.deepEqual(G.missing('me02').filter(c => c.r === 'MHR').map(c => c.n), ['130'], 'MHR is collectable');
  }
  console.log('ok economy');
}

// ---------- 成就 (src/achievements.ts) ----------
{
  let T = new Date(2026, 8, 29, 14, 0).getTime(), seed = 777; // 2pm local: 夜猫子 stays out of the way until asked for
  const store = {}, env = { now: () => T, random: () => S.rng(seed++)(), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const attach = G => { G.on(ev => { if (ev?.open) A.note(G, ev.open); }); return G; };
  const G = attach(createGame(env)), st = () => G.state, ids = got => got.map(a => a.id).sort();
  assert.equal(new Set(A.ACH.map(a => a.id)).size, A.ACH.length, 'achievement ids are unique');
  assert.ok(A.ACH.every(a => a.cash >= 0 && a.seal.length <= 4 && A.GROUPS.some(([g]) => g === a.group) && (a.group !== 'hidden' || a.hint)), 'every achievement has a reward ≥ 0, a short seal, a group, and a hint if hidden');
  assert.ok(A.TIERS.every(([k]) => A.ACH.some(a => A.tier(a) === k)) && A.ACH.filter(a => A.tier(a) === 'black').every(a => !a.cash), 'every medal tier has achievements; 荣誉 are the honour-only ones');
  assert.deepEqual(A.check(G), [], 'a fresh shop has earned nothing');
  // Rounded display percentages must not unlock a collection milestone one card early.
  for (const percent of [25, 50]) for (const offset of [-1, 0]) {
    const R = createGame({ now: () => T, random: S.rng(1234), storage: null }), cards = PTCG_DATA.sv08.cards;
    const count = Math.ceil(cards.length * percent / 100) + offset;
    for (const c of cards.slice(0, count)) R.state.dexSeen[`sv08|${c.n}`] = 1; // seed before the first cached dex count
    assert.equal(ids(A.check(R)).includes(`dex-${percent}`), offset === 0, `${count}/${cards.length}: ${percent}% needs the actual share`);
  }

  // One pack: 开张 is earned once, its reward paid once, and it is not revenue (set unlocks stay put).
  G.buy('sv08', 1); const cash0 = st().cash, rev0 = G.revenue(); G.open('sv08', 1);
  const got = A.check(G); assert.ok(ids(got).includes('open-1'), 'first pack earns 开张');
  const paid = got.reduce((a, x) => a + x.cash, 0);
  assert.ok(Math.abs(st().cash - cash0 - paid) < 1e-9, 'rewards are paid'); assert.equal(G.revenue(), rev0, 'a reward is not revenue');
  assert.equal(st().ach['open-1'], T);
  assert.deepEqual(A.check(G), [], 'checked again: nothing new'); assert.ok(Math.abs(st().cash - cash0 - paid) < 1e-9, 'never paid twice');
  // A listener that re-checks from inside the bonus's own emit (what ui/ach.ts does) finds nothing and pays nothing.
  { const R = createGame({ ...env, storage: { getItem: () => null, setItem() {} } }); let inner = []; R.on(() => { inner = inner.concat(A.check(R)); });
    R.state.earned.sealed = 1e4; const c0 = R.state.cash;
    const outer = A.check(R); assert.deepEqual(ids(outer), ['rev-1k']); assert.deepEqual(inner, [], 're-entrant check is empty');
    assert.ok(Math.abs(R.state.cash - c0 - 30) < 1e-9, 'paid once through a re-entrant emit'); }

  // Per-pack counters from open events, with synthetic packs: double hit, 10-pack with 3 gold stars, 10-pack blank, dry streaks.
  const card = kind => ({ set: 'sv08', n: '1', name: 'x', r: kind, kind, price: 1 });
  const pack = (...kinds) => [...Array(11 - kinds.length).fill(0).map(() => card('C')), ...kinds.map(card)];
  A.note(G, [pack('RR', 'IR')]); assert.equal(st().feat.dbl, 2); assert.ok(ids(A.check(G)).includes('double'), '一包双闪');
  A.note(G, Array.from({ length: 10 }, (_, i) => i < 3 ? pack('IR') : pack())); assert.equal(st().feat.tenGold, 3);
  assert.equal(st().feat.dry, 7, 'dry streak counts packs since the last gold star'); assert.ok(ids(A.check(G)).includes('ten-gold'), '十连三金');
  A.note(G, Array.from({ length: 10 }, () => pack())); assert.equal(st().feat.tenBlank, 1); assert.equal(st().feat.dry, 17);
  A.note(G, Array.from({ length: 9 }, () => pack('UR'))); assert.equal(st().feat.tenBlank, 1, 'not a ten');
  let g2 = A.check(G); assert.ok(ids(g2).includes('ten-blank') && !ids(g2).includes('dry-30'));
  A.note(G, Array.from({ length: 4 }, () => pack())); assert.ok(ids(A.check(G)).includes('dry-30'), '30 packs without a gold star');
  A.note(G, [pack('SIR')]); assert.equal(st().feat.dry, 0); assert.equal(st().feat.dryMax, 30, 'the longest streak is kept');
  T = new Date(2026, 8, 30, 3, 0).getTime(); A.note(G, [pack()]); assert.ok(ids(A.check(G)).includes('night'), '夜猫子: a pack opened at 3am');

  // State-derived: revenue, dex, a named card, and customers per calendar day (the count starts over at midnight).
  st().earned.sealed = 1e5; assert.ok(ids(A.check(G)).includes('rev-10k'));
  const zard = PTCG_DATA['sv03.5'].cards.find(c => c.en.startsWith('Charizard')); assert.ok(!st().ach.charizard);
  st().dex[`sv03.5|${zard.n}|${zard.r}`] = { c: 1, p: 1 }; assert.ok(ids(A.check(G)).includes('charizard'), 'a pulled Charizard');
  st().customers += 99; A.check(G); assert.ok(!st().ach['day-100'], '99 today');
  T += 24 * 3600e3; st().customers += 5; A.check(G); assert.equal(st().feat.dayBest, 99, 'a new day starts from zero');
  st().customers += 100; assert.ok(ids(A.check(G)).includes('day-100'));
  // Luck titles only count from 30 packs, and follow 欧气检测.
  G.reset(); st().cash = 1e6; G.buy('sv08', 29); G.open('sv08', 29); A.check(G);
  assert.ok(!['euro', 'emperor', 'unlucky'].some(k => st().ach[k]), 'no luck title before 30 packs');
  G.buy('sv08', 1); G.open('sv08', 1); A.check(G); const pct = G.luck().pct;
  assert.equal(!!st().ach.euro, pct >= 0.9); assert.equal(!!st().ach.unlucky, pct < 0.1);
  assert.equal(G.luckMult(), 1, 'achievements never touch the odds');

  // Old saves: no ach/feat keys. They load, earn what they already did (paid once), and a reload pays nothing again.
  store['ptcg-shop-v1'] = JSON.stringify({ cash: 10, opened: { sv08: 150 }, tally: { RR: 20, SIR: 1 }, customers: 40, earned: { sealed: 30000, singles: 0 } });
  const O = createGame(env); assert.deepEqual([O.state.ach, O.state.feat], [{}, {}], 'old save gets empty achievements');
  const old = ids(A.check(O)); assert.ok(['open-1', 'hit-1', 'sir-1', 'packs-100', 'sale-1', 'rev-1k'].every(k => old.includes(k)), `retro achievements (${old})`);
  const oc = O.state.cash; assert.equal(oc, 10 + A.ACH.filter(a => old.includes(a.id)).reduce((x, a) => x + a.cash, 0));
  const O2 = createGame(env); assert.deepEqual(A.check(O2), [], 'reloaded: nothing re-earned'); assert.equal(O2.state.cash, oc);
  delete store['ptcg-shop-v1'];
  G.reset(); assert.deepEqual(st().ach, {}, 'reset clears achievements');
  console.log(`ok achievements (${A.ACH.length})`);
}
// 开分店 (prestige): gated on this shop's debt being paid; the new shop starts over but the binder, 图鉴, achievements and the whole
// 欧气 record come along untouched; 名气 is paid once per shop; every perk is capped; old saves load with no branch history.
{
  let T = 1_700_000_000_000; const store = {};
  const env = { now: () => T, random: S.rng(11), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const G = createGame(env), st = () => G.state;
  assert.deepEqual(st().branch, { n: 0, fame: 0, got: 0, life: 0, perks: {} });
  const REV = 5e5; st().earned.sealed = REV; assert.ok(!G.canBranch() && !G.branch(), 'no branch while 九姐 is still owed');
  st().cash = 1e6; G.repay(1e9); assert.equal(st().debt, 0); assert.ok(G.canBranch(), 'paid off: the branch opens'); st().up = { signage: 3, racks: 2 }; st().skills = { luck: 3, talk: 2 };
  G.buy('sv08', 60); G.open('sv08', 60); A.check(G);
  const hits = Object.keys(st().singles).filter(k => S.HITS.includes(st().singles[k].kind));
  G.list(hits[0]); G.toPedestal(hits[1] ?? hits[0]); A.check(G); // the pedestal stays through the branch, so its 镇店 achievement is earned before it, not paid after
  const cards = () => Object.values(st().singles).reduce((a, c) => a + c.count, 0) + st().shown.length + st().gallery.filter(Boolean).length;
  const n0 = cards(), L0 = G.luck(), ach0 = { ...st().ach }, fame = G.fameFor();
  assert.ok(G.branch());
  const L1 = G.luck();
  assert.deepEqual([L1.packs, L1.value, L1.live, L1.expected, L1.pct], [L0.packs, L0.value, L0.live, L0.expected, L0.pct], '欧气 record unchanged by a branch');
  assert.equal(cards(), n0, 'every card comes along'); assert.equal(st().shown.length, 0, 'the case is emptied into the binder'); assert.ok(st().gallery[G.PEDESTAL] && G.trophyBonus() > 0, 'the pedestal stays in the room');
  assert.deepEqual(st().ach, ach0); assert.deepEqual(A.check(G), [], 'achievements are not paid twice');
  assert.deepEqual([st().cash, G.revenue(), st().up, st().skills, G.unlocked('sv08.5')], [G.START_CASH, 0, {}, {}, false], 'the new shop starts from zero, later sets lock again');
  assert.deepEqual([st().branch.n, st().branch.fame, st().branch.life], [1, fame, REV]); assert.equal(fame, Math.floor(Math.sqrt(REV / G.FAME_UNIT)));
  assert.deepEqual([st().debt, st().week, G.debt0()], [G.DEBT0 * (1 + G.DEBT_STEP), 1, G.DEBT0 * (1 + G.DEBT_STEP)], 'the new shop owes 九姐 more');
  T += 3600e3; G.tick(); assert.ok((st().offline?.secs ?? 0) <= 3600, 'the first tick credits only the time since the branch');
  assert.ok(!G.branch(), 'the new shop owes its own debt: branching again right away is refused');
  // Perks: capped, finite in total, never bought past max or without fame.
  let total = 0; for (const [k, p] of Object.entries(G.PERKS)) { assert.ok(p.max >= 1 && p.max <= 5, k); for (let l = 0; l < p.max; l++) total += p.base + l; }
  assert.ok(total < 60, `maxing every perk takes ${total} 名气`);
  st().branch.fame = 1e3; for (const k of Object.keys(G.PERKS)) { while (G.learnPerk(k)); assert.equal(G.perk(k), G.PERKS[k].max, `${k} stops at max`); }
  assert.equal(st().branch.fame, 1e3 - total);
  assert.equal(G.skillMax('luck'), G.SKILLS.luck.max + G.PERKS.luck.max);
  assert.ok(G.rate() <= G.ARRIVAL * (1 + G.REG_STEP * G.PERKS.regulars.max) * (1 + G.SKILLS.crowd.step * G.SKILLS.crowd.max) * G.crowdCap(), 'traffic stays under the capped ceiling');
  assert.equal(st().branch.fame, 1e3 - total);
  assert.ok(G.unlockAt('me05') > 0 && G.unlockAt('me05') < 1e6, '门路 lowers the thresholds, never to zero');
  st().cash = 1e7; G.repay(1e9); G.branch();
  assert.deepEqual([st().cash, G.lvl('racks'), G.lvl('depth'), G.lvl('clerk')], [G.START_CASH + G.SEED_STEP * G.PERKS.seed.max, G.PERKS.fit.max, G.PERKS.fit.max, 1], 'perks shape the new shop');
  // Old saves (no branch key) load with an empty history and keep everything else.
  store['ptcg-shop-v1'] = JSON.stringify({ cash: 10, opened: { sv08: 5 }, earned: { sealed: 500, singles: 0 } });
  const O = createGame(env); assert.deepEqual(O.state.branch, { n: 0, fame: 0, got: 0, life: 0, perks: {} }); assert.equal(O.revenue(), 500);
  console.log(`ok 开分店: paid off at $${REV.toLocaleString('en-US')} → ${fame} 名气, perks cap at ${total} 名气, 欧气 record and ${n0} cards carried`);
}
// ---------- growth curve (scripts/autoplay.mjs plays the real game.ts on a fake clock) ----------
{
  const { play } = await import('../scripts/autoplay.mjs'), G_START = 1000;
  const pay = { reserve: 1, repay: true }; // every curve below is a player who keeps the week's bill back and repays loans (GAMEPLAY.md)
  const shop = play({ hours: 3, openShare: 0, pct: 0.92, log: 3600, ...pay }), opener = play({ hours: 3, openShare: 0.05, pct: 0.92, cardPct: 1.2, log: 3600, ...pay });
  assert.ok(shop[1].net > 5 * G_START, `an hour of trading should grow the $1,000 start five-fold (net ${shop[1].net})`);
  assert.ok(shop[3].net > shop[1].net * 2, 'income keeps growing, upgrades pay off');
  assert.ok(shop[3].up >= 5, `several upgrades bought within 3h (${shop[3].up})`);
  // Seed 1's 3 h path is noisy (per-seed nets spread ±10%; over 24 seeds the opener trails the shop by ~3% before and after 开张期), so a
  // single seed only says "no money machine": within 5% of the shop. The 10 h check below is the real one.
  assert.ok(opener[3].net < shop[3].net * 1.05, 'opening packs is a fun expense, not a money machine, even when hits are sold at +20%');
  // 10 h, was 3 h: with the counter binder (GAMEPLAY §14) pulls ≥ $25 sell at 110% instead of waiting for a case slot, and at 3 h the
  // 图鉴 walk-ins that early opening buys are front-loaded, so a luck-maxed opener draws level with the shop there (±3%; main already
  // lost this on seed 4). Per pack it is a loss (the 单卡生意 block: 56% of market < 60%), and over 10 h it earns under half.
  const lucky = play({ hours: 10, openShare: 0.05, pct: 0.92, cardPct: 1.2, luck: 'max', log: 3600, ...pay }), shop10 = play({ hours: 10, openShare: 0, pct: 0.92, log: 3600, ...pay });
  assert.ok(lucky[10].net < shop10[10].net / 2, `still a fun expense with 手气 maxed from the start ($${lucky[10].net} vs $${shop10[10].net} at 10 h)`);
  console.log(`ok growth: net after 1h/3h = $${shop[1].net}/$${shop[3].net}; the same shop that opens 5% of its packs: $${opener[3].net}`);
  // Long game: a player who puts 2% of revenue into master sets has a next goal for hours, and it pays for itself.
  const ach = [], plain = play({ hours: 20, openShare: 0, pct: 1, log: 3600, ...pay }), chase = play({ hours: 20, openShare: 0, pct: 1, masterShare: 0.02, log: 3600, ...pay }); // 2% of the scaled revenue ≈ the dollars 10% was before the ×6 volume: card prices are market data and were not scaled
  const masters = h => chase[h].dex.split('/').filter(x => x === '★').length;
  assert.ok(masters(3) >= 1, `first master set within 3h (${chase[3].dex})`);
  // < 6 (was < 4): 收卡 (GAMEPLAY §14) adds ~8% revenue, so the 2% pot is bigger; on main the 4th set landed just after 6h at 99%
  assert.ok(masters(6) < 6 && masters(10) > masters(3), `still chasing after 6h, and progress keeps coming (${chase[6].dex} → ${chase[10].dex})`);
  assert.ok(chase[10].net > plain[10].net, `the binder pays for itself by hour 10 (net $${chase[10].net} vs $${plain[10].net} for a shop that never collects)`);
  // Achievements: some in the first 10 minutes, more by the hour, still more to earn at 10 hours. Its own run, so the rewards stay out of the curves above.
  play({ hours: 10, openShare: 0, pct: 1, masterShare: 0.02, log: 36000, ...pay, hook: G => { // ui/ach.ts's wiring
    G.on(ev => { if (ev?.open) A.note(G, ev.open); });
    return t => { if (t % 600 === 0) for (const a of A.check(G)) ach.push([t, a.cash]); }; } }); // every 10 game minutes: 欧气检测 is slow to recompute per pack
  const by = h => ach.filter(([t]) => t <= h * 3600), paid = h => by(h).reduce((a, [, c]) => a + c, 0);
  assert.ok(by(1 / 6).length >= 3 && by(1).length >= by(1 / 6).length + 5 && by(10).length >= by(1).length + 5 && by(10).length < A.ACH.length,
    `achievement pacing ${by(1 / 6).length} / ${by(1).length} / ${by(10).length}`);
  console.log(`ok achievement pacing: ${by(1 / 6).length} / ${by(1).length} / ${by(10).length} of ${A.ACH.length} by 10 min / 1 h / 10 h, rewards $${paid(1 / 6)} / $${paid(1)} / $${paid(10)}`);
  // 客流上限: every master set and all sets out would be ×8 word of mouth, times 人气 (up to ×2, outside the cap); late traffic stays
  // under the capped ceiling (with however many 店面扩建 levels were bought) yet keeps rising, and income keeps growing without running away.
  // (Was < 125 walk-ins/min before 人气 moved outside the cap; a collector at 20 h now has about 180.)
  const G0 = createGame({ storage: { getItem: () => null, setItem() {} } }), cap = lv => G0.ARRIVAL * 60 * (1 + G0.SKILLS.crowd.step * G0.SKILLS.crowd.max) * (G0.CROWD_KNEE + G0.CROWD_ROOM + G0.ROOM_STEP * lv);
  assert.ok(chase[20].rate <= cap(G0.UPGRADES.expand.costs.length) && chase[20].rate < 400 * G0.ARRIVAL, `late walk-ins are capped (${chase[20].rate}/min)`);
  assert.ok(chase[20].rate > chase[10].rate && chase[20].rate > plain[20].rate * 1.5, `still growing late (${chase[10].rate} → ${chase[20].rate}/min)`);
  assert.ok(chase[20].perMin > chase[10].perMin && chase[20].perMin < chase[10].perMin * 2.5, `income grows, not a money machine ($${chase[10].perMin} → $${chase[20].perMin}/min)`);
  // 开分店: a player who branches as soon as the debt is paid pays off the second shop's bigger debt in about the same time (名气 perks
  // make up for the extra 50%): the prestige loop keeps its pace instead of speeding up into a grind without pressure.
  const br = play({ hours: 18, openShare: 0, pct: 0.95, log: 1800, branch: 'paid', ...pay }), at = n => br.findIndex(r => r.shop === n) * 0.5;
  assert.ok(at(2) > 6 && at(2) < 11 && at(3) > 0, `first shop paid off in ${at(2)}h`);
  assert.ok(Math.abs((at(3) - at(2)) - at(2)) < at(2) * 0.25 && br.at(-1).broke === 0, `second shop (${G0.DEBT0 * (1 + G0.DEBT_STEP)} owed) paid off in about the same time (${at(2)}h, then ${at(3) - at(2)}h)`);
  console.log(`ok 开分店 curve: first shop paid off in ${at(2)}h, the second (owing 50% more) in ${at(3) - at(2)}h`);
  console.log(`ok long game: master sets at 3h/6h/10h = ${masters(3)}/${masters(6)}/${masters(10)}; walk-ins ${plain[10].rate} → ${chase[10].rate}/min (${chase[20].rate} at 20h); net at 10h $${chase[10].net} vs $${plain[10].net}`);
}

// 客流上限 and 店面扩建: below the knee nothing changes; above it the multiplier bends toward knee + room and never passes the
// raw product; each 扩建 level pays back slower than the one before (cost ×1.55, fewer extra walk-ins), so it is a sink, not a printer.
{
  const G = createGame({ storage: { getItem: () => null, setItem() {} } }), K = G.CROWD_KNEE, n = G.UPGRADES.expand.costs.length;
  for (const raw of [1, 1.3, K]) assert.equal(G.crowdMult(raw), raw, `under ×${K} the bonus counts in full`);
  let prev = K;
  for (const raw of [2.5, 4, 7.14, 100]) { const m = G.crowdMult(raw); assert.ok(m < raw && m < G.crowdCap() && m > prev, `×${raw} → ×${m}`); prev = m; }
  assert.ok(!G.canUpgrade('expand') && !G.upgrade('expand'), 'nothing to expand while the bonus is under the knee');
  const G2 = createGame({ storage: { getItem: () => null, setItem() {} } }), st = G2.state; st.cash = 1e9; st.skills.crowd = G2.SKILLS.crowd.max; st.earned.sealed = 1e9; // a fresh game: dex counts are cached on first read
  for (const s of PTCG_SETS) for (const c of PTCG_DATA[s.id].cards) st.dexSeen[`${s.id}|${c.n}`] = 1;
  assert.ok(G2.crowdRaw() > 7 && G2.canUpgrade('expand'), `everything maxed: ×${G2.crowdRaw().toFixed(2)} raw`);
  let pay = 0;
  for (let lv = 0; lv < n; lv++) {
    const before = G2.rate(), cost = G2.upgradeCost('expand'); assert.ok(G2.upgrade('expand'));
    const p = cost / (G2.rate() - before); assert.ok(G2.rate() > before && p > pay, `扩建 Lv${lv + 1}: $${cost} per extra walk-in/s, slower than the last`); pay = p;
    const pop = G2.ARRIVAL * (1 + G2.SKILLS.crowd.step * G2.skill('crowd')); // 人气, outside the cap
    assert.ok(G2.rate() < pop * G2.crowdCap() && G2.rate() < pop * G2.crowdRaw());
  }
  console.log(`ok 客流上限: all collected ×${G2.crowdRaw().toFixed(2)} raw → ×${G2.crowdMult(G2.crowdRaw()).toFixed(2)} with ${n} 扩建 levels, ×${(G2.rate() / G2.ARRIVAL).toFixed(2)} walk-ins with 人气 maxed`);
}
// The 顾客 panel and the shelf wall count the same 10 minutes: with more misses than the old cap (60 a set),
// every opener who found their set missing is both in G.missed and in state.recent, and nothing older than the window is kept.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(7), storage: { getItem: () => null, setItem() {} } }), st = G.state;
  st.skills.crowd = G.SKILLS.crowd.max; for (const s of PTCG_SETS) for (const c of PTCG_DATA[s.id].cards) st.dexSeen[`${s.id}|${c.n}`] = 1; // traffic at the cap, only the first two sets unlocked, nothing on sale
  for (let i = 0; i < 90; i++) { T += 20_000; G.tick(); }
  const since = T - G.MISS_WINDOW * 1000, rec = st.recent;
  assert.ok(rec.at(-1).at >= since - 20_000 && rec.at(-1).at < since + 10_000, `recent spans the window by time (${rec.length} walk-ins)`);
  for (const id of ['sv08', 'sv10']) {
    const want = rec.filter(v => v.t === 'opener' && v.at > since && (v.miss === id || (v.set === id && v.r === 'none'))).length;
    assert.ok(want > 60 && G.missed(id) === want, `${id}: 没买到 ${G.missed(id)} = ${want} openers in 顾客`);
    assert.ok(st.miss[id].every(t => t >= since - 20_000), 'old misses are dropped');
  }
  console.log(`ok 顾客 window: ${rec.length} walk-ins, 没买到 ${G.missed('sv08')}/${G.missed('sv10')} over the same ${G.MISS_WINDOW / 60} minutes`);
}

// 债务 (GAMEPLAY.md): the bill curve, auto-pay, loan interest, grace → forced loan → bankruptcy, the closed-shop rule, old saves,
// and a short survival check per kind of player (the full table is `node scripts/autoplay.mjs survive`).
{
  let T = 1_700_000_000_000; const store = {};
  const env = { now: () => T, random: S.rng(21), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const G = createGame(env), st = () => G.state, evs = []; G.on(ev => { if (ev?.type) evs.push(ev); });
  const run = secs => { for (let i = 0; i < secs; i += 20) { T += 20e3; G.tick(); } }, week = () => run(G.WEEK); // page open: a tick every 20 s (a gap over G.AWAY is an absence)
  // Bills: week 1's bill exists from the start (the opening scene prints it), each week's is ×BILL_G the last, and they add up to the debt.
  assert.deepEqual([st().debt, st().owe, st().loan, st().week], [G.DEBT0, G.DEBT0, 0, 1]);
  assert.deepEqual([G.nextBill().week, G.nextBill().amount], [1, G.BILL0], 'week 1 bill at start');
  let sum = 0, w = 1; for (; sum < G.DEBT0; w++) { const b = Math.min(G.DEBT0 - sum, Math.round(G.BILL0 * G.BILL_G ** (w - 1))); if (w > 1 && sum + b < G.DEBT0) assert.ok(b > Math.round(G.BILL0 * G.BILL_G ** (w - 2)), 'bills grow'); sum += b; }
  assert.ok(w - 1 >= 20 && w - 1 <= 30, `the first debt takes ${w - 1} weekly installments`);
  // Auto-pay: cash covers it, so the bill is paid the moment it falls due, and the story hears due then paid, once, for that week.
  st().cash = 1e5; st().earned.sealed = 1; week();
  assert.deepEqual(evs.map(e => [e.type, e.week, e.amount]), [['bill_due', 1, G.BILL0], ['bill_paid', 1, G.BILL0]]);
  assert.deepEqual([st().week, st().owe, st().billsPaid, st().cash], [2, G.DEBT0 - G.BILL0, 1, 1e5 - G.BILL0]);
  // Loan interest: 10% a week, compounded; a till with money beyond the float pays it down after each bill (顺手还). This used to
  // assert $1,000 → $1,210 in two weeks with $100k in the till; since R32 that till pays it back ($1,100 → $100 → 0), and the
  // $1,210 case (a till with nothing to spare) is in the 顺手还 test at the end of this file. Repaying takes the loan first.
  assert.ok(G.takeLoan(1000)); assert.equal(evs.at(-1).type, 'loan_taken'); assert.equal(G.loanWeeks(), 2); week();
  assert.equal(st().loan, 100, 'grown to 1,100, then 顺手还 takes the minimum back'); assert.equal(st().debt, st().owe + st().loan); week(); assert.equal(st().loan, 0);
  G.takeLoan(1000); const owe0 = st().owe; G.repay(1300); assert.deepEqual([st().loan, st().owe], [0, owe0 - 300], 'repay: loan first, then the installments');
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
  assert.equal(D.debtBeat({ type: 'bill_due', week: 1 }, G).key, 'due:0.1:1', 'after a bankruptcy week 1 is a new run for the story');
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
  console.log(`ok 债务: ${w - 1} installments, a $1,000 loan paid back in 2 weeks from a full till, grace → loan → bankruptcy, 8h closed = 1 week; manager ${mgr.paid} bills in 4h, idler ${idle.paid} in 48h, newbie ${noob.paid} in 2h`);
}
// 剧情: every scene has lines, every line renders to text (debt lines with and without a bill; milestones always get their card/set); debt beats degrade to nothing
// on a game without the economy, map each event to its scene once per week, and a paid week after the first plays the short line.
{
  for (const [id, scenes] of Object.entries(ST.SCENES)) for (const sc of scenes) {
    assert.ok(sc.lines.length, `story ${id}: empty scene`);
    for (const l of sc.lines) for (const c of [...(['bigpull', 'unlock'].includes(id) ? [] : [{}]), { bill: '$12.00', short: '$3.00', rate: '10%', week: 2, card: 'X', price: '$1', set: 'Y', bills: 25, fame: 6, debt: '$60,000', shop: 2 }]) {
      const t = typeof l.t === 'string' ? l.t : l.t(c); assert.ok(t && !t.includes('undefined'), `story ${id}: "${t}"`);
    }
  }
  const g = createGame({ now: () => 0, random: S.rng(1), storage: { getItem: () => null, setItem() {} } });
  if (!g.nextBill) assert.equal(D.bill(g), null); // no economy yet: nothing to read
  assert.equal(D.debtBeat(undefined, g), null); assert.equal(D.debtBeat({ open: [] }, g), null);
  const fake = Object.assign(Object.create(g), { nextBill: () => ({ week: 3, amount: 120, dueAt: 9 }) });
  const due = D.debtBeat({ type: 'bill_due' }, fake);
  assert.deepEqual([due.kind, due.key, due.week, due.amount], ['due', 'due:0.0:3', 3, 120]);
  assert.equal(ST.sceneFor(due, {}), null, 'a bill falling due is no scene: covered → a slip, short → missed');
  const paid = w => D.debtBeat({ type: 'bill_paid', week: w }, fake);
  assert.equal(ST.sceneFor(paid(1), {}), 'paid1'); assert.ok(!ST.slipFor(paid(1), {}), 'the first paid bill is 九姐 in person');
  assert.equal(ST.sceneFor(paid(2), { paid1: 1 }), null); assert.ok(ST.slipFor(paid(2), { paid1: 1 }), 'every later one a receipt');
  assert.ok(!ST.slipFor(paid(2), { paid1: 1, [paid(2).key]: 1 }) && !ST.slipFor(due, { paid1: 1 }));
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'bankrupt' }, fake), { bankrupt: 1 }), 'bankrupt'); // a bankruptcy always plays
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'nope' }, fake), {}), null);
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'loan' }, fake), {}), 'loan');
  for (const k of ['paid1', 'last', 'missed', 'loan', 'bankrupt', 'debt_cleared', 'branch']) assert.ok(ST.SCENES[k], `no scene ${k}`);
  // The end of a run, played as the ui plays it (a beat's key marks it seen): the bill before the last says so; the bill that
  // clears the debt emits due → paid → 还清 in one tick, and only 还清 speaks; the next shop starts at week 1 again and still
  // gets its weekly beats and, later, its own 还清.
  let T = 1_700_000_000_000; const E = createGame({ now: () => T, random: S.rng(3), storage: { getItem: () => null, setItem() {} } }), seen = {}, played = [];
  E.on(ev => { const b = D.debtBeat(ev, E), id = ST.sceneFor(b, seen); if (id) { played.push(id); seen[id] = 1; if (b.key) seen[b.key] = 1; } else if (ST.slipFor(b, seen)) played.push('slip'); });
  const week = () => { for (let i = 0; i < E.WEEK; i += 20) { T += 20e3; E.tick(); } };
  const owe = n => { E.state.owe = E.state.debt = [0, 1].reduce((a, i) => a + Math.round(E.BILL0 * (1 + E.DEBT_STEP * E.state.branch.n) * E.BILL_G ** (E.state.week - 1 + i)), 0) - n; };
  E.state.cash = 1e6; E.state.earned.sealed = 1; owe(0);
  week(); assert.deepEqual(played, ['last'], 'the bill before the last one (the till covered it: no 「这周的账」 before it)');
  week(); assert.deepEqual(played, ['last', 'debt_cleared'], 'the clearing bill: no 「下周见」 before 还清');
  assert.ok(E.branch()); assert.equal(played.at(-1), 'branch'); E.state.cash = 1e6;
  played.length = 0; week(); assert.deepEqual(played, ['paid1'], "shop 2's week 1 is not shop 1's week 1 (and 九姐 still comes in for the first bill ever)");
  E.state.cash = 1e6; week(); assert.deepEqual(played, ['paid1', 'slip'], 'then a covered week is a receipt, no scene');
  E.state.cash = 1e6; owe(0); week(); week(); assert.deepEqual(played.slice(-2), ['last', 'debt_cleared'], 'shop 2 gets its own 还清');
  console.log('ok story beats, and the end of a run: last → 还清 → 开张, per shop');
}
// 店员搬货: between rounds the clerk carries back-room stock of auto sets onto their shelves, leaving CLERK_KEEP to open; a set with
// auto off, or with no more than CLERK_KEEP in the back room, is left alone; no clerk, no carrying.
{
  let T = 1_700_000_000_000; const K = createGame({ now: () => T, random: () => 0.99, storage: { getItem: () => null, setItem() {} } }); // 0.99: nobody walks in
  const s = K.state, id = 'sv10'; s.cash = 1e6; K.upgrade('depth'); K.buy(id, 40); K.place(0, id); K.buy(id, 60); // an 80-pack shelf, 40 on it, 60 in the back room
  assert.equal(K.shelfQty(id), 40); T += 1000; K.tick(); assert.equal(K.shelfQty(id), 40, 'no clerk: the back room stays put');
  K.upgrade('clerk'); s.clerkT = T + 1e9; // no round due: only the carrying
  T += 1000; K.tick(); assert.deepEqual([K.shelfQty(id), s.stock[id]], [80, 20], 'clerk carries up to the shelf\'s depth');
  K.shelves()[0].qty = 0; T += 1000; K.tick(); assert.deepEqual([K.shelfQty(id), s.stock[id]], [10, K.CLERK_KEEP], 'all but CLERK_KEEP');
  K.shelves()[0].qty = 0; T += 1000; K.tick(); assert.equal(K.shelfQty(id), 0, 'at CLERK_KEEP the rest is the player\'s');
  K.buy(id, 50); K.setAuto(id, false); T += 1000; K.tick(); assert.equal(K.shelfQty(id), 0, 'auto off: not carried');
  console.log('ok 店员搬货: back room → shelf between rounds, CLERK_KEEP left to open');
}
// 亲手开出: the 图鉴 counted only from packs. Every card of every set can be pulled (so the line can be finished at the measured
// odds), cardOdds matches the simulator, the count is distinct numbers pulled, and a set pulled whole pays 名气 exactly once.
{
  const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const H = createGame({ now: () => 1_700_000_000_000, random: S.rng(5), storage: store });
  for (const set of PTCG_SETS) for (const c of PTCG_DATA[set.id].cards) assert.ok(H.cardOdds(set.id, c.n, 1) > 0, `${set.id} ${c.n} can never be pulled`);
  { // one SIR and one common of sv09, 100k simulated packs: within 4 standard errors of cardOdds
    const r = S.rng(11), n = 100000, sir = PTCG_DATA.sv09.cards.find(c => c.r === 'SIR').n, com = PTCG_DATA.sv09.cards.find(c => c.r === 'C').n, got = { [sir]: 0, [com]: 0 };
    for (let i = 0; i < n; i++) { const p = new Set(S.openPack('sv09', r).map(c => c.n)); for (const k in got) if (p.has(k)) got[k]++; }
    for (const k in got) { const p = H.cardOdds('sv09', k, 1), se = Math.sqrt(p * (1 - p) / n); assert.ok(Math.abs(got[k] / n - p) < 4 * se, `sv09 ${k}: simulated ${got[k] / n}, cardOdds ${p}`); }
  }
  H.state.cash = 1e6; H.state.stock.me02 = 10; const packs = H.open('me02', 10);
  assert.equal(H.handCount('me02'), new Set(packs.flat().filter(c => c.r !== 'E').map(c => c.n)).size, 'hand count = distinct numbers pulled');
  assert.equal(H.handCount('me02') + H.handMissing('me02').length, H.dexTotal('me02'));
  assert.equal(H.handCount('sv08'), 0);
  H.collect('me02', true); assert.equal(H.handCount('me02') + H.handMissing('me02').length, H.dexTotal('me02'), 'bought cards do not count by hand');
  // every me02 card pulled by hand but the C/U/R ones still missing: opening more finishes the set, 名气 +HAND_FAME once, one story beat
  const com = new Set(H.handMissing('me02').filter(c => ['C', 'U', 'R'].includes(c.r)).map(c => c.n)); assert.ok(com.size, 'some plain card still missing after 10 packs');
  for (const c of PTCG_DATA.me02.cards) if (!com.has(c.n)) H.state.dex[`me02|${c.n}|${c.r}`] ||= { c: 1, p: 1 };
  H.setAuto('me02', true); // saves; a fresh game on the same storage reads the dex from scratch
  const J = createGame({ now: () => 1_700_000_000_000, random: S.rng(6), storage: store }), evs = [], fame0 = J.state.branch.fame;
  J.on(ev => ev?.type === 'story' && evs.push(ev));
  assert.ok(!J.handDone('me02'));
  for (let i = 0; i < 100 && !J.handDone('me02'); i++) { J.state.stock.me02 = 10; J.open('me02', 10); }
  assert.ok(J.handDone('me02'), 'the plain cards come within 1,000 packs');
  assert.equal(J.state.branch.fame, fame0, 'no 名气 mid-shop: spent on perks at once, heavy opening would pay for itself');
  assert.equal(J.handFame(), J.HAND_FAME); assert.deepEqual(evs.map(e => [e.id, e.set]), [['hand', 'me02']]);
  J.state.stock.me02 = 10; J.open('me02', 10); assert.equal(J.handFame(), J.HAND_FAME, 'once per set');
  J.bankrupt(); assert.ok(J.handDone('me02'), 'a bankruptcy keeps the record');
  assert.equal(J.handFame(), J.HAND_FAME, '...and the 名气 still waits');
  J.state.owe = J.state.loan = J.state.debt = 0; const f1 = J.fameFor() + J.HAND_FAME; assert.ok(J.branch());
  assert.equal(J.state.branch.fame, fame0 + f1, 'paid at the next 开分店'); assert.equal(J.handFame(), 0, 'and only once');
  assert.equal(D.debtBeat(evs[0], J).key, 'story:hand:me02', 'its beat plays once per set');
  assert.ok(A.ACH.find(a => a.id === 'hand-1').prog(J)[0] === 100);
  // 大师套 by 补卡: the last hit bought fills the set → one 'master' beat (the binder closes, silver stamp); the hand finish above,
  // which also completed the set, played only 'hand' (the deepEqual above)
  {
    const K = createGame({ now: () => 1_700_000_000_000, random: S.rng(9), storage: { getItem: () => null, setItem() {} } }), kev = [];
    const id = PTCG_SETS.find(s => K.unlocked(s.id)).id; K.on(ev => ev?.type === 'story' && kev.push([ev.id, ev.set]));
    const last = K.missing(id)[0]; for (const c of PTCG_DATA[id].cards) if (c.n !== last.n) K.state.dexSeen[`${id}|${c.n}`] = 1;
    K.state.cash = 1e6; assert.ok(!K.master(id)); assert.ok(K.collect(id)); assert.ok(K.master(id));
    assert.deepEqual(kev, [['master', id]], '补 the last card: one 大师套 beat');
    assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'master', set: id }, K), {}), 'master');
    assert.equal(ST.SCENES.master[0].seal, 'silver'); assert.equal(ST.SCENES.hand[0].seal, 'gold');
  }
  console.log(`ok 亲手开出: every card pullable, odds match the simulator, 名气 +${J.HAND_FAME} once per set at the next 开分店, kept through bankruptcy`);
}

// 每二十分钟的那一下: a week the till covers is one receipt and no scene; a short week is ONE scene (missed, not due + missed);
// when the grace runs out the forced loan speaks and the bill that it settled is a receipt again.
{
  let T = 1_700_000_000_000; const W = createGame({ now: () => T, random: S.rng(8), storage: { getItem: () => null, setItem() {} } }), kinds = [], shown = [], seen = { paid1: 1 };
  W.on(ev => { const b = D.debtBeat(ev, W); if (!b) return; kinds.push(b.kind); const id = ST.sceneFor(b, seen); if (id) { shown.push(id); if (b.key) seen[b.key] = 1; } else if (ST.slipFor(b, seen)) shown.push('slip'); if (b.kind === 'loan' && b.forced) shown.push('forced'); });
  const week = () => { for (let i = 0; i < W.WEEK; i += 20) { T += 20e3; W.tick(); } };
  W.state.cash = 1e5; week(); assert.ok(kinds.includes('paid') && !kinds.includes('due'), `covered week: ${kinds}`);
  assert.deepEqual(shown, ['slip'], `covered week: a receipt, no scene (${shown})`);
  kinds.length = shown.length = 0; W.state.cash = 0; W.state.shelves.length = 0; W.state.stock = { sv08: 5 }; week(); // stock in the back room: no 进货钱 bailout
  assert.deepEqual(kinds.filter(k => k === 'due' || k === 'missed'), ['due', 'missed'], `a short week still says so: ${kinds}`);
  for (let i = 0; i <= W.GRACE; i += 20) { T += 20e3; W.tick(); } // the grace runs out with the till still empty
  assert.deepEqual(shown.slice(0, 3), ['missed', 'loan', 'forced'], `short week: one scene, then the grace runs out into a forced loan (${shown})`);
  assert.equal(shown[3], 'slip', `...and the bill it settled prints a receipt (${shown})`);
  // a fresh save whose first bill is short: after the hammer, 九姐 never says 「准时」 — a late receipt, and paid1 waits for an on-time week
  T += 1e9; const F = createGame({ now: () => T, random: S.rng(8), storage: { getItem: () => null, setItem() {} } }), fs = {}, fShown = []; let missedW = 0;
  F.on(ev => { const b = D.debtBeat(ev, F); if (!b) return; if (b.kind === 'missed') missedW = b.week; const late = b.kind === 'paid' && b.week === missedW, id = ST.sceneFor(b, fs, late);
    if (id) { fShown.push(id); fs[id] = 1; if (b.key) fs[b.key] = 1; } else if (ST.slipFor(b, fs, late)) fShown.push('slip'); });
  const fTicks = s => { for (let i = 0; i < s; i += 20) { T += 20e3; F.tick(); } };
  F.state.cash = 0; F.state.shelves.length = 0; F.state.stock = { sv08: 5 }; fTicks(F.WEEK + F.GRACE + 20);
  assert.ok(fShown.includes('missed') && fShown.includes('slip') && !fShown.includes('paid1'), `a late first bill: ${fShown}`);
  F.state.cash = 1e5; fShown.length = 0; fTicks(F.WEEK); assert.deepEqual(fShown, ['paid1'], 'the first on-time bill still gets 九姐 in person');
  console.log('ok 每二十分钟: a covered bill is a receipt, a short one one scene, the lapse a forced loan + receipt');
}

// 成长: G.peek shows what one more level does and leaves the save exactly as it was (货架 must not pad a shelf in).
// 人气 sits outside the 客流上限: on a save with every set collected (word of mouth far past the cap) a level still adds what it
// says (+10 points of base, +6% at Lv6), and 扩建 moves that capped shop too.
{
  const P = createGame({ now: () => 1_700_000_000_000, random: S.rng(9), storage: { getItem: () => null, setItem() {} } });
  P.state.skills.crowd = 6; P.state.dexSeen = Object.fromEntries(PTCG_SETS.flatMap(s => PTCG_DATA[s.id].cards.map(c => [`${s.id}|${c.n}`, 1])));
  const before = JSON.stringify(P.state);
  for (const k of [...Object.keys(P.UPGRADES), ...Object.keys(P.SKILLS)]) P.peek(k, () => [P.rate(), P.racks(), P.depth(), P.slots(), P.wholesaleRate(), P.luckMult()]);
  assert.equal(JSON.stringify(P.state), before, 'peek leaves no trace');
  assert.equal(P.peek('racks', P.racks), P.racks() + 1); assert.ok(P.peek('supplier', P.wholesaleRate) < P.wholesaleRate());
  const gain = P.peek('crowd', P.rate) / P.rate() - 1;
  assert.ok(P.crowdRaw() > P.crowdCap() && Math.abs(gain - 0.1 / 1.6) < 1e-9, `人气 past the cap: +${(gain * 100).toFixed(1)}% walk-ins, its full step`);
  const wide = P.peek('expand', P.rate) / P.rate() - 1; assert.ok(wide > 0.03, `扩建 moves a capped shop (+${(wide * 100).toFixed(1)}%)`);
  console.log(`ok 成长 peek: no trace in the save; past the cap 人气 Lv7 = +${(gain * 100).toFixed(1)}% walk-ins, 扩建 Lv1 = +${(wide * 100).toFixed(1)}%`);
}

// 展示柜标价 + 补满柜位: one tag for the case (listings, 补满, 带徒弟 all use it), 补满 fills the free slots from singles hits only.
{
  let T = 1_700_000_000_000; const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const C = createGame({ now: () => T, random: S.rng(12), storage: store });
  assert.equal(C.casePct(), C.CASE_PCT, 'a new shop (and an old save without the field) lists at CASE_PCT');
  C.state.cash = 1e6; C.state.stock.sv10 = 60; C.open('sv10', 60);
  const hitsOf = () => Object.values(C.state.singles).reduce((a, c) => a + (S.HITS.includes(c.kind) ? c.count : 0), 0), h0 = hitsOf();
  assert.ok(h0 > C.slots(), `60 packs pull more hits (${h0}) than the case holds`);
  const top = Object.values(C.state.singles).filter(c => S.HITS.includes(c.kind)).sort((a, b) => b.price - a.price)[0];
  assert.equal(C.fillCase(), C.slots()); assert.equal(C.state.shown.length, C.slots()); assert.equal(hitsOf(), h0 - C.slots());
  assert.ok(C.state.shown.every(c => S.HITS.includes(c.kind) && c.pct === C.CASE_PCT), 'hits only, at the case tag');
  assert.equal(C.state.shown[0].name, top.name, 'priciest first'); assert.equal(C.fillCase(), 0, 'a full case takes nothing');
  C.setCasePct(1.33); assert.equal(C.casePct(), 1.35, 'snapped to the 5% grid');
  assert.ok(C.state.shown.every(c => c.pct === 1.35), 'the tag reprices the whole case'); assert.equal(C.cardAsk(C.state.shown[0]), Math.round(top.price * 135) / 100);
  C.unlist(0); C.list(Object.keys(C.state.singles).find(k => S.HITS.includes(C.state.singles[k].kind))); assert.equal(C.state.shown.at(-1).pct, 1.35, '上柜 lists at the tag');
  assert.equal(createGame({ now: () => T, random: S.rng(1), storage: store }).casePct(), 1.35, 'the tag is saved');
  // 带徒弟 refills every tick at the tag
  C.state.up.clerk = 1; C.state.skills.apprentice = 1; C.state.shown.length = 0; T += 1000; C.tick();
  assert.equal(C.state.shown.length, C.slots()); assert.ok(C.state.shown.every(c => c.pct === 1.35), '带徒弟 lists at the case tag');
  console.log(`ok 展示柜: one tag (default ${Math.round(C.CASE_PCT * 100)}%) for 上柜 / 补满柜位 / 带徒弟, 补满 fills free slots with hits, priciest first`);
}
// 成长节奏 (GAMEPLAY.md §12.1): the pure manager always has something to buy soon — the longest wait between two buys stays
// under 45 minutes through the first 8 h (it was 52 at the heaviest weeks) and about an hour at most after (was 61–111; the
// 8–10 h stretch includes paying back the one loan of the last weeks before buying again);
// 店面扩建 is within reach of a shop that never opens a pack (it was never bought: $24k, and 人气 inside the cap never lifted
// the word of mouth past the knee), and every 人气 level adds at least +5% walk-ins, capped shop or not.
{
  const { pace } = await import('../scripts/autoplay.mjs');
  const p = pace({ openShare: 0, pct: 0.95, reserve: 1, repay: true }, { hours: 16 }), wait = r => r['longest wait (min)'];
  assert.ok(p.slice(0, 4).every(r => wait(r) <= 45) && p.slice(4).every(r => wait(r) <= 65), `longest waits ${p.map(wait).join(' / ')} min`);
  assert.ok(p.slice(0, 6).some(r => /expand1/.test(r.bought)), '扩建 bought by 12 h');
  const G = createGame({ storage: null }); G.state.dexSeen = Object.fromEntries(PTCG_SETS.flatMap(s => PTCG_DATA[s.id].cards.map(c => [`${s.id}|${c.n}`, 1])));
  for (let lv = 0; lv < G.SKILLS.crowd.max; lv++, G.state.skills.crowd = lv) assert.ok(G.peek('crowd', G.rate) / G.rate() > 1.05, `人气 Lv${lv + 1}`);
  console.log(`ok 成长节奏: longest wait between buys per 2 h ${p.map(wait).join(' / ')} min over 16 h; 人气 ≥ +5% walk-ins every level`);
}
// hitTail convolves one binomial per odds instead of stepping pack by pack: it must match the per-pack DP (the old code, kept
// here as the reference) over several sets and 手气 levels, on both sides of the mean, and a 20-hour save (~90k packs, 14k RR)
// must take milliseconds, not the seconds per row that froze the late game's every tick.
{
  const ref = (counts, kind, k) => {
    const probs = []; let mean = 0;
    for (const key in counts) { const { id, m } = S.parseKey(key), p = (S.ratesFor(PTCG_SETS.find(s => s.id === id), m)[kind] || 0) / 100; for (let i = 0; i < counts[key]; i++) probs.push(p); mean += p * counts[key]; }
    const pmf = new Float64Array(k + 1); pmf[0] = 1;
    for (const p of probs) for (let j = k; j >= 0; j--) pmf[j] = pmf[j] * (1 - p) + (j ? pmf[j - 1] * p : 0);
    const le = pmf.reduce((a, b) => a + b, 0), lt = le - pmf[k];
    return k >= mean ? 1 - lt : le;
  };
  const counts = { sv08: 700, 'sv08@1.05': 900, 'sv08.5': 400, 'me01@1.1': 600, sv10: 300 };
  let worst = 0;
  for (const kind of ['RR', 'UR', 'IR', 'SIR', 'REV', 'MHR']) {
    const mean = Object.entries(counts).reduce((a, [key, n]) => { const { id, m } = S.parseKey(key); return a + n * (S.ratesFor(PTCG_SETS.find(s => s.id === id), m)[kind] || 0) / 100; }, 0);
    for (const f of [0, 0.5, 0.9, 1, 1.1, 1.5]) { const k = Math.round(mean * f); worst = Math.max(worst, Math.abs(S.hitTail(counts, kind, k) - ref(counts, kind, k))); }
  }
  assert.ok(worst < 1e-9, `hitTail vs per-pack DP: worst ${worst}`);
  const big = Object.fromEntries(PTCG_SETS.flatMap(s => [[s.id, 3000], [S.rateKey(s.id, 1.05), 6000]])), t0 = performance.now();
  for (const kind of S.HITS) S.hitTail(big, kind, Math.round(Object.values(big).reduce((a, b) => a + b, 0) * 0.15));
  const ms = performance.now() - t0;
  assert.ok(ms < 500, `hitTail on ${Object.values(big).reduce((a, b) => a + b, 0)} packs took ${ms.toFixed(0)} ms`);
  console.log(`ok hitTail: matches the per-pack DP (worst ${worst.toExponential(1)}); 9 rows over 90k packs in ${ms.toFixed(0)} ms`);
}
// luckPercentile at any pack count. (Replaces a test that checked block draws against resampling a 60k-pack pool: the pool itself was
// the bug. Its mean was off by ~1/245 SD per pack, n packs multiplied that by n while the spread only grew as √n, and a 77k-pack save
// read 66% where the true answer is 83%.) One pack's exact mean and variance are computed here from the card lists, independently of
// sim.ts's sampler; the mean must equal packEV.
{
  const Phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
  const moments = key => {
    const { id, m } = S.parseKey(key), set = PTCG_SETS.find(s => s.id === id), P = S.poolsFor(id), t = S.slotTables(set, m);
    const list = k => { const ps = P[k].map(c => S.cardPrice(id, c.n, k)); return [ps.reduce((a, b) => a + b, 0) / ps.length, ps.reduce((a, b) => a + b * b, 0) / ps.length]; };
    let mean = 0, v = 0;
    const slot = pairs => { let m1 = 0, m2 = 0; for (const [p, k] of pairs) { const [a, b] = list(k); m1 += p * a; m2 += p * b; } mean += m1; v += m2 - m1 * m1; };
    for (let i = 0; i < 4; i++) slot([[1, 'C']]); for (let i = 0; i < 3; i++) slot([[1, 'U']]);
    for (const [tb, base] of [[t.rev1, 'REV'], [t.rev2, 'REV'], [t.rare, 'R']]) slot([...Object.entries(tb).map(([k, p]) => [p / 100, k]), [1 - Object.values(tb).reduce((a, b) => a + b, 0) / 100, base]]);
    const fe = (set.rates.FE || 0) / 100, e = S.cardPrice(id, 'E', 'E'), f = S.cardPrice(id, 'E', 'FE');
    mean += e + fe * (f - e); v += fe * (1 - fe) * (f - e) ** 2;
    return { mean, v };
  };
  for (const set of PTCG_SETS) for (const key of [set.id, S.rateKey(set.id, 1.25)]) assert.ok(Math.abs(moments(key).mean - S.packEV(key)) < 1e-9, `packEV ${key} (the cosmos-foil Energy counts)`);
  // The player's side counts the same cards (151 stocked directly, it unlocks later in the game): every pulled card (Energy and cosmos foil included) repriced from state.dex.
  {
    const mem = {}, Gv = createGame({ now: () => 1_700_000_000_000, random: S.rng(3), storage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } });
    Gv.state.stock['sv03.5'] = 60; const got = Gv.open('sv03.5', 60).flat();
    assert.ok(got.some(c => c.kind === 'FE') && Math.abs(Gv.luck().value - S.packValue(got)) < 1e-6, 'luck value is every pulled card at the price openPack gave it');
  }
  // Large: 88k packs over three keys is a sum of 88k independent packs, so it is normal to within its skew (≈ 0.1 SD here).
  const big = { sv08: 30000, 'sv08@1.05': 30000, 'sv08.5': 28000 };
  let M = 0, V = 0; for (const k in big) { const x = moments(k); M += big[k] * x.mean; V += big[k] * x.v; }
  for (const z of [-1.5, -1, 0, 1, 1.5]) { const got = S.luckPercentile(big, M + z * Math.sqrt(V)); assert.ok(Math.abs(got - Phi(z)) < 0.025, `88k packs at ${z} SD: ${got} vs normal ${Phi(z).toFixed(3)}`); }
  // Medium: 1,000 packs (old bias ≈ 0.13 SD, invisible at 30 packs) against 800 players opening real packs with openPack.
  const r = S.rng(4242), vs = Array.from({ length: 800 }, () => { let v = 0; for (let i = 0; i < 1000; i++) v += S.packValue(S.openPack('sv08.5', r)); return v; }).sort((x, y) => x - y);
  for (const q of [0.1, 0.5, 0.9]) { const got = S.luckPercentile({ 'sv08.5': 1000 }, vs[Math.floor(q * vs.length)]); assert.ok(Math.abs(got - q) < 0.05, `1000 packs at true q=${q} came out ${got}`); }
  // Cost doesn't grow with packs: 90k packs, and the slow middle (20 keys of ~1,500 packs: counts land in inversion and card-by-card picks).
  // reordered keys: luckSamples keeps the last draw, so `big` itself would come back instantly
  const cold = Object.fromEntries(Object.entries(big).reverse()), t0 = performance.now(); S.luckPercentile(cold, M); const ms = performance.now() - t0;
  const mid = Object.fromEntries(PTCG_SETS.flatMap(s => [[s.id, 1500], [S.rateKey(s.id, 1.25), 1500]])), t1 = performance.now(); S.luckPercentile(mid, 1e5); const ms2 = performance.now() - t1;
  assert.ok(ms < 100 && ms2 < 400, `luckPercentile took ${ms.toFixed(0)} ms on 88k packs, ${ms2.toFixed(0)} ms on 20 keys × 1500`);
  { const c = { sv08: 40, 'sv08@1.25': 5 }, xs = S.luckSamples(c, 500); assert.ok(xs.every((v, i) => !i || xs[i - 1] <= v), 'luckSamples sorted');
    const v = xs[300]; assert.equal(S.luckPercentile(c, v, 500), (xs.filter(y => y < v - 1e-9).length + xs.filter(y => Math.abs(y - v) <= 1e-9).length / 2) / 500, 'the share image\'s spread and the printed percentile are the same draws'); }
  // luckBins (the 欧气 page's chart and the share image's): every player lands in a bin, and the bins drawn as beaten hold no more
  // players than the printed percentile counts, the rest (you and above) no fewer: the picture can't disagree with the number.
  for (const c of [{ sv08: 1 }, { sv08: 40, 'sv08@1.25': 5 }, { sv08: 300, 'sv08.5': 200, sv09: 50 }]) {
    const xs = S.luckSamples(c), v = xs[Math.floor(xs.length * .37)], B = S.luckBins(xs, v, 1), p = S.luckPercentile(c, v) * xs.length;
    assert.equal(B.bins.reduce((a, b) => a + b, 0), xs.length, 'luckBins drops no player');
    const beat = B.bins.reduce((a, b, i) => a + (B.beat(i) ? b : 0), 0), upTo = beat + (B.bins[B.bins.findIndex((_, i) => !B.beat(i))] || 0);
    assert.ok(beat <= p && p <= upTo, `bins beaten ${beat}..${upTo} vs percentile ${p}`);
  }
  { const c = { sv08: 7 }; assert.equal(S.luckSamples(c), S.luckSamples({ sv08: 7 }), 'luckSamples keeps the last draw'); }
  console.log(`ok luckPercentile: normal to ±2.5pp at 88k packs, matches openPack players at 1000; ${ms.toFixed(0)} ms / ${ms2.toFixed(0)} ms`);
}

// 街口 (GAMEPLAY.md §6.2): shop n stands on STREETS[n % 4]. The first shop (老街) is the old numbers exactly; later streets tilt
// pack demand, and a bankruptcy keeps the street. The pure manager who branches as soon as the debt is paid still clears every
// shop in 6–11 h (「每家店用时大致不变」) and takes 名气 from each.
{
  const Z = createGame({ now: () => 1_700_000_000_000, random: S.rng(3), storage: null });
  assert.equal(Z.street().name, '老街');
  for (const s of PTCG_SETS) assert.deepEqual(Z.demand(s.id), Z.DEMAND[s.id], `老街 leaves ${s.id} as it was`);
  const r0 = Z.rate(); Z.state.branch.n = 2; assert.ok(Math.abs(Z.rate() / r0 - Z.STREETS[2].crowd) < 1e-9, '夜市 walk-ins');
  Z.state.branch.n = 1; assert.equal(Z.demand('sv09').w, Z.DEMAND.sv09.w * Z.STREETS[1].sets.sv09.w, '学校旁 sv09 demand');
  Z.state.branch.n = 4; assert.equal(Z.street().name, '老街', 'the fifth shop is back on 老街');
  const { play } = await import('../scripts/autoplay.mjs'), shops = []; let t0 = 0, got = 0;
  play({ hours: 34, openShare: 0, pct: 0.95, reserve: 1, repay: true, branch: 'paid', log: 3600, hook: G => { let n = 0; return t => { if (G.state.branch.n !== n) { shops.push({ h: (t - t0) / 3600, fame: G.state.branch.got - got }); t0 = t; got = G.state.branch.got; n = G.state.branch.n; } }; } });
  assert.ok(shops.length >= 4 && shops.every(s => s.h >= 6 && s.h <= 11 && s.fame >= 5), `shops: ${JSON.stringify(shops)}`);
  console.log(`ok 街口: 老街 unchanged, streets tilt demand; branching at once clears ${shops.map(s => `${s.h.toFixed(1)} h (+${s.fame} 名气)`).join(' / ')}`);
}

// 店员留账款: the clerk's buying (a round or 现在补货) leaves the bill in the till in its last BILL_KEEP seconds; further out he spends the till.
{
  const mk = (due, round = false) => { const Z = createGame({ now: () => 1_700_000_000_000, random: S.rng(5), storage: null });
    Z.state.up.depth = 1; Z.state.up.clerk = 1; Z.state.shelves = [{ id: 'sv08', qty: 0 }]; Z.state.auto = { sv08: true };
    if (round) Z.state.clerkRound = { at: 0, need: 0, spent: 0 }; Z.state.shopT = Z.state.week * Z.WEEK - due; Z.state.cash = Z.nextBill().amount + 40; Z.clerkNow(); return Z; };
  const late = mk(60 * 4), early = mk(60 * 6), last = mk(60 * 4, true);
  assert.ok(late.state.cash >= late.nextBill().amount, `in the last minutes the clerk keeps the bill: cash ${late.state.cash} vs bill ${late.nextBill().amount}`);
  assert.ok(early.state.cash < early.nextBill().amount, `six minutes out he spends past it: cash ${early.state.cash}`);
  assert.ok(last.state.cash >= last.nextBill().amount, 'any round in the last 5 minutes keeps it');
  console.log('ok 店员留账款: any round keeps the bill in its last 5 minutes and spends it before them');
}

// 店员分货: a round short of cash gives every shelf the same share of what it lacks before any shelf is topped up, so no set is
// left at 0 while another is filled (shelf order used to decide it).
{
  const Z = createGame({ now: () => 1_700_000_000_000, random: S.rng(9), storage: null });
  Z.state.up.clerk = 1; Z.state.up.racks = 1; for (const [i, id] of ['sv08', 'sv10', 'sv08.5'].entries()) { Z.place(i, id); Z.state.auto[id] = true; }
  for (const sh of Z.shelves()) sh.qty = 0;
  Z.state.cash = Z.clerkNeed() / 2; Z.clerkNow();
  const qs = Z.shelves().filter(sh => sh.id).map(sh => sh.qty);
  assert.ok(qs.every(q => q > 0), `half the money: every shelf gets some (${qs.join('/')})`);
  assert.ok(Math.max(...qs) - Math.min(...qs) <= 2, `and about the same (${qs.join('/')})`);
  console.log(`ok 店员分货: half the cash a round needs puts ${qs.join('/')} packs on ${qs.length} empty shelves`);
}

// 店员没本钱 (GAMEPLAY.md §12.2): the clerk buys with the cash in the till at his round. A round that cannot fill the shelves is
// recorded (clerkRound, clerkShort) and logged; 现在补货 (clerkNow) is his buying now and does not move his next round. The
// 普通 player on seed 1 falls into it on the third shop (夜市, 2 级店员 bought with the last $10.4k before a round) and borrows
// twice what the same player heeding the two notes does (no upgrade that leaves less than a round needs; 现在补货 when a round
// came up short). (Before 离开 was one absence per hidden stretch, this 90-s player's every tick counted as closed and its short
// bills were borrowed with no grace, which left it stuck on that shop's loan.)
{
  let T = 1_700_000_000_000; const Z = createGame({ now: () => T, random: S.rng(5), storage: null });
  Z.state.up.clerk = 2; Z.state.cash = 50; Z.place(0, 'sv10'); Z.state.clerkT = T;
  T += 1000; Z.tick();
  const short = Z.clerkShort(), need = Z.clerkNeed();
  assert.ok(short > 0 && Math.abs(short - need) < 0.01 && Z.state.clerkRound.spent > 0 && Z.state.clerkRound.spent <= 50, `a round with $50 is short: ${short}`);
  assert.match(Z.state.log.find(l => l.text.startsWith('店员进货')).text, /钱不够/);
  assert.ok(Z.clerkBudget() >= need, 'the 成长 page warns against what a round takes');
  const next = Z.state.clerkT; Z.state.cash = need + 1; assert.ok(Z.clerkNow() > 0);
  assert.equal(Z.clerkShort(), 0, '现在补货 with enough cash fills the shelves'); assert.equal(Z.state.clerkT, next, 'and leaves his round where it was');
  const { play } = await import('../scripts/autoplay.mjs'), run = (heed, seed) => play({ hours: 30, seed, step: 90, openShare: 0.02, pct: 1, reserve: 1, repay: true, branch: 'paid', heed, log: 3600 });
  // was seed 1 alone and `< blind / 2`: with 收卡 (GAMEPLAY §14) the blind player borrows far less ($21k → $7k on seed 1) and the
  // gap is within seed noise per seed (seed 1 now borrows more heeding), so the claim is on the total over seeds 1–3
  const runs = [1, 2, 3].map(seed => [run(false, seed), run(true, seed)]), sum = i => runs.reduce((a, r) => a + r[i].debt.borrowed, 0);
  const [blind, heeds] = [sum(0), sum(1)];
  assert.ok(runs.every(r => r.every(x => x.G.state.branch.n >= 3)) && heeds < blind, `heeding them borrows less: $${heeds | 0} vs $${blind | 0} over seeds 1–3`);
  console.log(`ok 店员没本钱: a short round is recorded and 现在补货 fills it; 普通 seeds 1–3, 30 h: borrowed $${Math.round(blind / 1000)}k → $${Math.round(heeds / 1000)}k heeding the notes`);
}

// 离开 (GAMEPLAY.md §3.1): a hidden page is one absence from the moment it was hidden, however the browser spaces the ticks (a
// background tab ticks once a minute). It trades for offlineCap() and moves the bill clock one week, both from when the player left;
// a bill short of cash is never borrowed while away, and its grace waits for them; short absences leave no receipt.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(8), storage: null }), st = () => G.state, evs = []; G.on(ev => { if (ev?.type) evs.push(ev); });
  const live = secs => { for (let i = 0; i < secs; i += 20) { T += 20e3; G.tick(); } }, bg = secs => { for (let i = 0; i < secs; i += 60) { T += 60e3; G.tick(); } };
  st().cash = 1e6; st().earned.sealed = 1; G.buy('sv08', 40); G.shelve('sv08', 40); // no clerk: an hour at most
  G.leave(); bg(3 * 3600); assert.equal(st().week, 2, 'three hours in a background tab = one visit from 九姐');
  assert.equal(st().away.secs, G.NOCLERK_CAP, 'and no sales after the first hour'); assert.equal(st().offline, null, 'the receipt waits for the return');
  G.back(); assert.equal(st().offline.secs, G.NOCLERK_CAP); assert.match(st().log[0].text, /^离开 3\.0 小时，店开了 1\.0 小时（没雇店员/);
  G.ackOffline(); G.leave(); T += 90e3; G.tick(); G.back(); assert.equal(st().offline, null, 'a minute and a half away: no receipt');
  // Short of cash when the bill falls due while away: no loan, and the full grace is there on return, however long that took.
  live(G.dueIn() - 30); st().cash = 10; st().stock.sv08 = 50; evs.length = 0;
  G.leave(); bg(5 * 3600);
  assert.ok(st().overdue && !evs.some(e => e.type === 'loan_taken'), 'overdue, not borrowed'); G.back();
  assert.ok(Math.abs(st().overdue.until - st().shopT - G.GRACE) < 60, `grace on return: ${st().overdue.until - st().shopT} s`);
  // Leaving (or watching a 连开, tick(busy)) pauses a grace that is running; it does not restart it. Back and still short, it runs out.
  st().cash = 1e6; live(20); assert.equal(st().overdue, null, 'paid as soon as cash is there'); st().shelves.forEach(s => { s.qty = 0; });
  live(G.dueIn() - 30); st().cash = 10; live(60); assert.ok(st().overdue); const left = st().overdue.until - st().shopT, w0 = st().week;
  G.leave(); bg(600); G.back(); assert.ok(Math.abs(st().overdue.until - st().shopT - left) < 1e-6, 'leaving pauses the grace');
  for (let i = 0; i < 120; i++) { T += 1e3; G.tick(true); } assert.ok(Math.abs(st().overdue.until - st().shopT - left) < 1e-6 && st().week === w0, 'so does a reveal in progress');
  evs.length = 0; live(left + 20); assert.ok(!st().overdue && evs.some(e => e.type === 'loan_taken' && e.forced), 'grace runs out while here: borrowed');
  // A page ticking every 90 s while visible (autoplay's 普通) is live: grace runs, a lapse borrows.
  st().cash = 10; st().shelves.forEach(s => { s.qty = 0; }); evs.length = 0; for (let i = 0; i < G.WEEK + G.GRACE + 180; i += 90) { T += 90e3; G.tick(); }
  assert.ok(evs.some(e => e.type === 'bill_missed') && evs.some(e => e.type === 'loan_taken' && e.forced), '90-s ticks are not an absence');
  console.log('ok 离开: a background tab is one absence (1 week, offlineCap of sales), grace waits for the return and for a reveal, short absences print nothing');
}

// 打烊小票的明细 (Receipt.detail): an absence is taken apart as the shop trades, visit by visit, by customer type (packs / seeker /
// collector), with the counter's and the clerk's money beside it (intake, restock, bulk). The parts add up to the totals, and the
// till's change over the absence is what the till really did, bills included. A receipt from an old save has no breakdown, and nothing
// merged with it gets one: a breakdown that misses part of the absence is never passed off as all of it. cardSales counts paying
// seeker / collector visits for the 新手引导, from the load on for a save that has none.
{
  let T = 1_700_000_000_000; const store = {}, KEY = 'ptcg-shop-v1', KINDS = ['packs', 'seeker', 'collector'];
  const env = { now: () => T, random: S.rng(61), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const G = createGame(env), st = () => G.state;
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`), earned = g => g.state.earned.sealed + g.state.earned.singles;
  const books = g => ({ cash: g.state.cash, earned: earned(g), intake: g.state.intake?.cost ?? 0, seeker: g.state.cardSales?.seeker ?? 0, collector: g.state.cardSales?.collector ?? 0, sold: g.state.cust.sold });
  // What the receipt claims against what the shop's own books say, since `b` (a snapshot of the books before the absence(s) it covers).
  const audit = (g, o, b, m) => {
    const d = o.detail, now = books(g);
    for (const f of ['sales', 'revenue', 'lost']) near(KINDS.reduce((s, k) => s + d[k][f], 0), o[f], `${m}: ${f} by type adds up to the total`);
    assert.equal(o.sales, now.sold - b.sold, `${m}: sales are the shop's paying visits`);
    assert.equal(d.seeker.sales, now.seeker - b.seeker, `${m}: seeker visits are what cardSales counted`); assert.equal(d.collector.sales, now.collector - b.collector, `${m}: collector visits too`);
    near(d.cash, now.cash - b.cash, `${m}: cash is the till's real change`);
    near(now.earned - b.earned, o.revenue + d.bulk, `${m}: takings plus bulk are what the books earned`); near(now.intake - b.intake, d.intake, `${m}: intake is what 收卡 paid`);
    assert.ok(o.bills > 0 && !o.borrowed && g.state.loan === 0, `${m}: a bill was paid from the till, nothing borrowed or repaid`);
    near(d.cash, o.revenue - d.intake - d.restock + d.bulk - o.bills + (o.tickets ?? 0) + (o.bonus ?? 0), `${m}: cash = takings − intake − restock + bulk − bills + gallery tickets + 看店 bonus`);
  };
  // A shop with every channel: a level-2 clerk (buys stock, sells bulk), 收卡 at the top price, packs bought and opened for real (bulk
  // and hits for the binder), 3 big cards in the case; the shelves hold 40 packs of two sets and the back room none, so the clerk has to buy.
  st().cash = 1e6; st().earned.sealed = 1e6; G.upgrade('clerk'); G.upgrade('clerk'); G.setBuyPct(G.BUY_MAX);
  G.buy('sv08', 15); G.open('sv08', 15);
  for (const [id, i] of [['sv08', 0], ['sv10', 1]]) { G.buy(id, G.depth()); G.place(i, id); }
  for (let i = 0; i < 3; i++) st().shown.push({ key: `sv08|big${i}|SIR`, set: 'sv08', n: `big${i}`, name: `big${i}`, r: 'SIR', kind: 'SIR', price: 40, pct: 1.1 });
  const b0 = books(G);
  // 1. Half an hour with nobody saying the player left: one tick finds the gap (an absence of its own) and prints one receipt.
  T += 1800e3; G.tick();
  const o1 = st().offline, d1 = JSON.parse(JSON.stringify(o1.detail)), b1 = books(G); assert.equal(st().away, null);
  assert.ok(o1.secs === 1800 && o1.sales > 100 && d1.restock > 0 && d1.intake > 0 && d1.bulk > 0 && KINDS.every(k => d1[k].sales > 0 && d1[k].lost > 0), `every channel is in it: ${JSON.stringify(o1)}`);
  audit(G, o1, b0, 'gap');
  // 2. A second absence the player never put away the receipt for: leave / back adds to it, parts and totals alike.
  const t1 = { sales: o1.sales, revenue: o1.revenue };
  G.leave(); T += 1800e3; G.tick(); G.back();
  const o2 = st().offline, dm = o2.detail; assert.equal(o2.secs, 3600); assert.ok(o2.sales > t1.sales && o2.revenue > t1.revenue && KINDS.every(k => dm[k].sales >= d1[k].sales));
  audit(G, o2, b0, 'merged'); near(dm.cash - d1.cash, st().cash - b1.cash, 'the second absence added its own till change, not a rewrite of the first');
  assert.equal(o2.sales - t1.sales, st().cust.sold - b1.sold, 'and its own paying visits');
  // 3. The save keeps both, as they were.
  assert.deepEqual(createGame({ ...env, random: S.rng(5) }).state.offline, o2); assert.deepEqual(createGame({ ...env, random: S.rng(5) }).state.cardSales, st().cardSales);
  // The first sale survives the ten-minute visit window and a reload, until the player acknowledges it.
  const first = structuredClone(st().cardFirst);
  for (const buyer of ['seeker', 'collector']) {
    assert.equal(first[buyer].t, buyer);
    assert.equal(first[buyer].r, 'sold');
    assert.ok(first[buyer].card && first[buyer].gain > 0);
    assert.ok(first[buyer].at < T - 600e3 && !st().recent.some(v => v.at === first[buyer].at));
  }
  const restored = createGame({ ...env, random: S.rng(5) });
  assert.deepEqual(restored.state.cardFirst, first);
  restored.ackCardSale('seeker');
  const acknowledged = createGame({ ...env, random: S.rng(5) });
  assert.equal(acknowledged.state.cardFirst.seeker, undefined);
  assert.deepEqual(acknowledged.state.cardFirst.collector, first.collector);
  // 4. An old save: the receipt on screen has no breakdown (and its counters are absent: nothing about the past is guessed). A new
  //    absence adds its totals to it and still no breakdown; once the receipt is put away the next absence is a whole one again.
  const raw = JSON.parse(store[KEY]); delete raw.offline.detail; delete raw.cardSales; store[KEY] = JSON.stringify(raw);
  const H = createGame({ ...env, random: S.rng(62) }), L = { ...H.state.offline }, hb = books(H);
  assert.ok(!('detail' in L) && H.state.cardSales === undefined && L.sales === o2.sales && L.revenue === o2.revenue, 'totals load as they were, with no breakdown made up');
  H.leave(); T += 1800e3; H.tick(); H.back();
  const o3 = H.state.offline; assert.ok(!('detail' in o3), 'old receipt + new absence: totals only'); assert.equal(o3.sales - L.sales, H.state.cust.sold - hb.sold); assert.ok(o3.revenue > L.revenue && o3.secs === L.secs + 1800);
  H.ackOffline(); const h4 = books(H); T += 1800e3; H.tick();
  audit(H, H.state.offline, h4, 'after an old receipt');
  // 5. A damaged breakdown (a NaN saved as null) is no breakdown, but the totals stay.
  const bad = JSON.parse(store[KEY]); bad.offline.detail.cash = null; store[KEY] = JSON.stringify(bad);
  const M = createGame({ ...env, random: S.rng(9) }); assert.ok(!('detail' in M.state.offline)); near(M.state.offline.revenue, H.state.offline.revenue, 'damaged breakdown: totals kept');
  // 6. An old save closed mid-absence: it has no breakdown, gets none as the rest of the absence trades (a part is not the whole),
  //    and the whole receipt it is added to loses its breakdown, with every total still adding up.
  store[KEY] = JSON.stringify(H.state); H.leave();
  const mid = JSON.parse(store[KEY]); assert.ok(mid.away.detail, 'a new leave starts with a breakdown'); delete mid.away.detail; store[KEY] = JSON.stringify(mid);
  const J = createGame({ ...env, random: S.rng(63) }), on = { ...J.state.offline }; assert.ok(J.state.offline.detail && !('detail' in J.state.away));
  T += 1800e3; J.tick(); const aw = { ...J.state.away }; assert.ok(!('detail' in aw) && aw.secs === 1800 && aw.sales > 0, 'the old absence still trades and still counts its totals');
  J.back(); const o5 = J.state.offline; assert.ok(!('detail' in o5));
  near(o5.sales, on.sales + aw.sales, 'sales'); near(o5.revenue, on.revenue + aw.revenue, 'revenue'); near(o5.lost, on.lost + aw.lost, 'lost'); near(o5.secs, on.secs + aw.secs, 'secs');
  console.log(`ok 打烊小票明细: gap and leave/back absences split by type with intake/restock/bulk (${o2.sales} sales, till +$${dm.cash.toFixed(0)} after $${o2.bills.toFixed(0)} of bills), old receipts never get a made-up breakdown`);
}

// 凑钱 (ui/ledger.ts): the cards sold to cover an overdue bill are the cheapest ones, just enough of them; selling them in the game
// brings in what the plan says, and the bill is then payable on the spot.
{
  const cards = [{ key: 'a', price: 100, count: 1 }, { key: 'b', price: 2, count: 5 }, { key: 'c', price: 10, count: 2 }, { key: 'z', price: 0, count: 9 }];
  let p = D.sellPlan(cards, 15, 0.7); // 5 × 1.40 = 7, then 2 × 7 = 14 → 21 ≥ 15; the $100 card stays
  assert.deepEqual(p.pick.map(x => [x.c.key, x.n]), [['b', 5], ['c', 2]]); assert.ok(Math.abs(p.got - 21) < 1e-9);
  p = D.sellPlan(cards, 8, 0.7); assert.deepEqual(p.pick.map(x => [x.c.key, x.n]), [['b', 5], ['c', 1]], 'only as many of the last card as needed');
  p = D.sellPlan(cards, 1e4, 0.7); assert.ok(Math.abs(p.got - 0.7 * 130) < 1e-9 && p.pick.length === 3, 'not enough: everything with a price, and got says so');
  assert.deepEqual(D.sellPlan(cards, 0, 0.7).pick, [], 'nothing short: nothing sold');
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(11), storage: null }), st = () => G.state;
  st().cash = 1e5; st().earned.sealed = 1; G.buy('sv08', 80); G.open('sv08', 60); G.shelve('sv08', 20); // sv08.5 is locked in a new game
  G.setCasePct(G.MAX_PCT); // the counter binder would sell these hits to seekers over the two weeks (GAMEPLAY §14)
  st().shelves.forEach(s => { s.qty = 0; }); for (let i = 0; i < G.WEEK; i += 20) { T += 20e3; G.tick(); } // week 1 paid out of the big till
  st().shelves.forEach(s => { s.qty = 0; }); st().cash = 0; st().stock.sv08 = 5; for (let i = 0; T < 1_700_000_000_000 + 2 * G.WEEK * 1e3 + 5e3; i++) { T += 20e3; G.tick(); }
  const o = st().overdue; assert.ok(o, 'week 2 is overdue with an empty till');
  const hits = Object.entries(st().singles).filter(([, c]) => S.HITS.includes(c.kind)).map(([key, c]) => ({ key, price: c.price, count: c.count }));
  assert.ok(hits.length > 5, 'sixty packs left hits to sell'); st().cash = o.amount - 5; const plan = D.sellPlan(hits, o.amount - st().cash, G.BUYLIST), before = st().cash;
  for (const x of plan.pick) G.sell(x.c.key, x.n);
  assert.ok(Math.abs(st().cash - before - plan.got) < 1e-6, `selling the plan brings what it said (${plan.got.toFixed(2)})`);
  assert.ok(plan.got >= 5 && G.payBill() && !st().overdue, 'and the bill is paid on the spot');
  console.log(`ok 凑钱: cheapest cards first, just enough; ${plan.pick.length} kinds sold for $${plan.got.toFixed(2)} against a $${o.amount} bill`);
}
// 单卡生意 (GAMEPLAY §14): half the pack buyers tear their packs open at the counter and offer every hit at your 收卡价 if it clears
// their floor; the hits you hold sit in the counter binder, where seekers take up to SEEK_N at the 单卡标价. 收卡 stops while a bill is
// overdue or the binder is full. Opening stays a loss even if every hit you pull sells at the case tag.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(21), storage: null }), st = () => G.state;
  for (const k in G.TYPES) if (k !== 'opener') G.TYPES[k].w = 0; // only pack buyers walk in
  st().cash = 1e6; st().earned.sealed = 1; st().price.sv08 = 0.8;
  const go = secs => { for (let i = 0; i < secs; i++) { T += 1000; if (!G.shelfQty('sv08')) { G.buy('sv08', 200); G.shelve('sv08', 999); } G.tick(); } };
  G.buy('sv08', 200); G.shelve('sv08', 999); go(590);
  const sold = st().recent.filter(v => v.r === 'sold'), torn = sold.filter(v => v.floor != null), offered = torn.filter(v => v.offer > 0);
  const share = torn.length / sold.length;
  assert.ok(Math.abs(share - G.COUNTER_OPEN) < 0.1, `about COUNTER_OPEN of pack buyers tear at the counter (${share.toFixed(2)})`);
  assert.ok(offered.every(v => (v.floor <= G.buyPct() + 1e-9) === !!v.took || v.sell === 'full'), 'a seller takes your 收卡价 exactly when it clears their floor');
  const took = offered.reduce((a, v) => a + (v.took || 0), 0), paid = offered.reduce((a, v) => a + (v.paid || 0), 0);
  assert.ok(took > 0 && took === st().intake.n && Math.abs(paid - st().intake.cost) < 0.01 && G.binderN() <= G.BINDER, `bought ${took} hits for $${paid.toFixed(2)}, binder ${G.binderN()}/${G.BINDER}`);
  const accept = offered.filter(v => v.took).length / offered.length;
  G.setBuyPct(G.BUY_MIN); const n0 = st().intake.n; go(300);
  assert.ok(st().intake.n - n0 <= 2, `at ${G.BUY_MIN * 100}% hardly anyone sells (${st().intake.n - n0})`);
  G.setBuyPct(1); st().overdue = { week: 1, amount: 1e9, inst: 0, until: Infinity }; const n1 = st().intake.n; go(120);
  assert.ok(st().intake.n === n1 && st().recent.some(v => v.sell === 'owe'), 'nothing is bought while a bill is overdue');
  st().overdue = null; go(600);
  assert.ok(G.binderN() === G.BINDER && st().recent.some(v => v.sell === 'full'), 'the binder fills and 收卡 stops there');
  // seekers: take up to SEEK_N cards from the binder at the 单卡标价, cheapest first
  for (const k in G.TYPES) G.TYPES[k].w = k === 'seeker' ? 1 : 0;
  const before = G.binderN(), e0 = st().earned.singles; go(60);
  const seek = st().recent.filter(v => v.t === 'seeker' && v.r === 'sold' && v.at > T - 60e3);
  assert.ok(seek.length && seek.every(v => v.n >= 1 && v.n <= G.SEEK_N) && seek.some(v => v.n > 1), `seekers buy 1–${G.SEEK_N} cards (${seek.map(v => v.n).join(',')})`);
  const took2 = seek.reduce((a, v) => a + v.n, 0), got = seek.reduce((a, v) => a + v.gain, 0);
  assert.ok(before - G.binderN() === took2 && Math.abs(st().earned.singles - e0 - got) < 0.01, 'out of the binder, into singles revenue');
  // 开包仍是负期望: at 手气 maxed, even every hit sold at the case tag (bulk to peers) is worth less than the lowest wholesale
  const m = 1 + G.SKILLS.luck.step * (G.SKILLS.luck.max + G.PERKS.luck.max), low = G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length;
  const worst = PTCG_SETS.map(set => {
    const P = S.poolsFor(set.id), rates = S.ratesFor(set, m);
    const hitEV = S.HITS.filter(k => rates[k] && P[k]?.length).reduce((a, k) => a + rates[k] / 100 * P[k].reduce((b, c) => b + S.cardPrice(set.id, c.n, k), 0) / P[k].length, 0);
    const real = G.BUYLIST * S.packEV(S.rateKey(set.id, m)) + (G.CASE_PCT - G.BUYLIST) * hitEV;
    return [set.id, real / set.packPrice];
  }).sort((a, b) => b[1] - a[1])[0];
  assert.ok(worst[1] < low, `opening at 手气 max, hits sold at ${G.CASE_PCT * 100}%: ${worst[0]} ${(worst[1] * 100).toFixed(0)}% of market < ${low * 100}% wholesale`);
  console.log(`ok 单卡生意: ${(share * 100).toFixed(0)}% tear at the counter, ${(accept * 100).toFixed(0)}% take ${G.BUY_PCT * 100}%; binder caps at ${G.BINDER}; seekers take ≤${G.SEEK_N}; best set realizes ${(worst[1] * 100).toFixed(0)}% (${worst[0]}) < ${low * 100}%`);
}
// 补满柜位 with a full case: binder cards pricier than the cheapest in the case swap in (the case is for collectors' big cards);
// caseMoves() says how many before the button is pressed.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(4), storage: null }), st = () => G.state;
  const card = (n, price) => ({ set: 'sv08', n, name: `c${n}`, r: 'RR', kind: 'RR', price });
  for (let i = 0; i < G.slots(); i++) st().shown.push({ ...card(`${i}`, 1 + i), key: `sv08|${i}|RR`, pct: 1.1 });
  st().singles['sv08|a|RR'] = { ...card('a', 50), count: 2 }; st().singles['sv08|b|RR'] = { ...card('b', 1.5), count: 1 };
  assert.equal(G.caseMoves(), 2, 'two $50s beat the $1 and $2 in the case; the $1.50 beats nothing left');
  assert.equal(G.fillCase(), 2); const p = st().shown.map(c => c.price).sort((a, b) => a - b);
  assert.deepEqual([p[0], p.at(-1), p.at(-2)], [3, 50, 50], 'the two cheapest went back to the binder');
  assert.equal(G.binderN(), 3, 'binder: the $1.50 and the two returned'); assert.equal(G.caseMoves(), 0);
  console.log('ok 换上大卡: a full case swaps in pricier binder cards, cheapest out first');
}
// The binder is shut while packs are being revealed (tick(busy)): their cards are in singles before they are flipped, and a seeker
// must not buy one the player has not seen yet.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(8), storage: null }), st = () => G.state;
  for (const k in G.TYPES) G.TYPES[k].w = k === 'seeker' ? 1 : 0;
  for (const [k, n, r] of [['RR', 1.2, 'RR'], ['IR', 8, 'IR'], ['SIR', 30, 'SIR']]) st().singles[`sv08|${k}|${k}`] = { set: 'sv08', n: k, name: k, r, kind: k, price: n, count: 20 };
  const n0 = G.binderN(); for (let i = 0; i < 120; i++) { T += 1000; G.tick(true); }
  assert.equal(G.binderN(), n0, 'mid-reveal no seeker takes a card from the binder');
  for (let i = 0; i < 120; i++) { T += 1000; G.tick(); }
  assert.ok(G.binderN() < n0, 'and after it they do');
  console.log(`ok 卡本 mid-reveal: shut for 2 min of ticks, then ${n0 - G.binderN()} cards sold`);
}

// 闲钱 and 退回 (the first weeks): the 成长 badge counts only what cash beyond the next bill buys (G.spare); a level bought in the week
// whose bill the till can't cover goes back at REFUND of its price (never full: a buy-after-the-bill, return-before-the-next loop
// would be a free rental). And the lesson itself, measured: a player who buys growth whenever the till covers it borrows every
// week; the same player buying only out of 闲钱 borrows nothing.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(5), storage: null }), st = () => G.state, bill = () => G.nextBill().amount;
  assert.equal(G.spare(), Math.max(0, st().cash - bill()), '闲钱 = cash − the next bill');
  assert.equal(G.REFUND, 1 - G.LOAN_RATE);
  st().cash = bill() + 1000; assert.ok(G.upgrade('signage') && G.upgrade('depth') && G.refundable().length === 0, 'cash still covers the bill: nothing to return');
  st().stock.sv08 = 2 * G.DEPTH_BASE; G.shelve('sv08', 2 * G.DEPTH_BASE); const onShelf = G.shelfQty('sv08');
  assert.ok(onShelf > G.DEPTH_BASE, 'the new layer is in use');
  st().cash = 10; assert.deepEqual(G.refundable().map(x => x.k).sort(), ['depth', 'signage'], 'short of the bill: this week\'s buys can go back');
  const c0 = st().cash, cost = G.UPGRADES.depth.costs[0]; assert.ok(G.refund('depth') && G.lvl('depth') === 0);
  assert.ok(Math.abs(st().cash - c0 - cost * G.REFUND) < 1e-6, 'back at 90% of the price');
  assert.ok(G.shelfQty('sv08') === G.depth() && st().stock.sv08 === onShelf - G.depth(), 'the packs over the lost layer go to the back room');
  assert.ok(!G.refund('depth'), 'one level, once');
  st().cash = 0; st().shelves.forEach(s => { s.qty = 0; }); for (let i = 0; i < G.WEEK + 20; i += 20) { T += 20e3; G.tick(); }
  assert.ok(st().overdue && G.spare() === 0, 'overdue: no 闲钱');
  assert.deepEqual(G.refundable().map(x => x.k), ['signage'], 'the overdue week\'s buy can still go back');
  G.refund('signage'); assert.ok(G.lvl('signage') === 0);
  st().cash = st().overdue ? st().overdue.amount + 5 : st().cash; G.payBill(); assert.ok(!st().overdue);
  st().cash = 0; assert.equal(G.refundable().length, 0, 'last week\'s buys are yours to keep');
  const { KINDS } = await import('../scripts/autoplay.mjs'), runs = k => [1, 2, 3].map(seed => KINDS[k]({ hours: 3, seed }).debt);
  const rash = runs('冲动新手'), calm = runs('冲动新手·看闲钱'), loans = r => r.reduce((a, d) => a + d.loans, 0);
  assert.ok(loans(rash) >= 3 && loans(calm) === 0, `growth bought with the bill's money borrows (${loans(rash)} loans in 3 × 3 h), out of 闲钱 none`);
  console.log(`ok 闲钱/退回: badge counts cash beyond the bill, this week's buys go back at ${G.REFUND * 100}% while short; 冲动新手 ${loans(rash)} loans, 看闲钱 0`);
}

// 成长树 (src/growth.ts): a branch opens with Lv 1 of its parent and only its first level asks, 柜台 grows from a card the shop really has,
// and 退回 never takes a parent's last level out from under a level of its child.
{
  const NOW = 1_700_000_000_000, card = { set: 'sv08', n: '9', name: '卡9', r: 'SIR', kind: 'SIR', price: 30 }, key = `${card.set}|${card.n}|${card.kind}`;
  const shop = (seed = 3, storage = { getItem: () => null, setItem() {} }) => { const G = createGame({ now: () => NOW, random: S.rng(seed), storage }); G.state.cash = 1e9; return G; };
  const buy = (G, k) => k in G.UPGRADES ? G.upgrade(k) : G.learn(k), at = (G, k) => k in G.UPGRADES ? G.lvl(k) : G.skill(k);
  const G0 = shop(), nameOf = k => (G0.UPGRADES[k] || G0.SKILLS[k]).name;
  const fullDex = G => { for (const s of PTCG_SETS) for (const c of PTCG_DATA[s.id].cards) G.state.dexSeen[`${s.id}|${c.n}`] = 1; }; // before the game reads a dex count: they are cached

  // A locked first purchase is refused whole: no cash, no level, no log line, no save, no event.
  const refused = (k, why) => {
    let heard = 0, saves = 0; const G = shop(4, { getItem: () => null, setItem() { saves++; } }), saves0 = saves; G.on(() => heard++); const before = JSON.stringify(G.state);
    assert.ok(!G.canUpgrade(k) && !G.canLearn(k) && G.growthLock(k).includes(why), `${k} is locked, and says what opens it (${G.growthLock(k)})`);
    assert.equal(buy(G, k), false, `${k}: first purchase refused`);
    assert.deepEqual([JSON.stringify(G.state), heard, saves - saves0], [before, 0, 0], `${k}: the refusal changes nothing`);
  };
  for (const [k, p] of Object.entries({ racks: 'depth', supplier: 'depth', talk: 'signage', crowd: 'signage', expand: 'crowd', apprentice: 'clerk', watch: 'clerk' })) refused(k, `「${nameOf(p)}」`);
  for (const k of ['case', 'luck']) refused(k, '开一包');

  // Lv 1 of the parent opens both branches, and neither branch locks the other.
  for (const [p, kids] of [['depth', ['racks', 'supplier']], ['signage', ['talk', 'crowd']], ['clerk', ['apprentice', 'watch']]]) {
    const G = shop(); assert.ok(kids.every(k => G.growthLock(k)), `${p}: both branches start shut`);
    assert.ok(buy(G, p) && at(G, p) === 1, `${p} Lv 1`);
    assert.ok(kids.every(k => G.growthLock(k) === '' && G.canUpgrade(k)), `${p} Lv 1 opens both branches`);
    assert.ok(kids.every(k => buy(G, k)), `${kids.join(' and ')} both buy`);
  }
  // 扩建 hangs on 人气 and keeps its own 客流上限 condition on every level.
  { const G = shop(); assert.ok(buy(G, 'signage') && buy(G, 'crowd'));
    assert.ok(G.growthLock('expand').includes(`×${G.CROWD_KNEE}`) && !G.upgrade('expand'), 'parent in hand, the cap condition still holds it');
    const F = shop(); fullDex(F); assert.ok(buy(F, 'signage') && buy(F, 'crowd') && F.growthLock('expand') === '' && F.upgrade('expand') && F.upgrade('expand') && F.lvl('expand') === 2, 'both met: 扩建 buys'); }

  // 柜台: neither a 图鉴 entry, a 战利品 record nor an empty slot is a card; every real source of one opens 展示柜 and 手气 alike, in either order.
  { const G = shop(); assert.equal(G.cardBranchReady(), false);
    assert.ok(G.collect('sv08'), 'a 图鉴补卡 went through'); G.state.hits.push({ ...card, t: 0 }); G.state.singles[key] = { ...card, count: 0 };
    assert.equal(G.cardBranchReady(), false, 'a dex entry, a record and an empty slot are not cards'); assert.ok(!G.learn('luck') && !G.upgrade('case')); }
  for (const [what, give] of [
    ['a pack opened', G => { G.buy('sv08', 1); G.open('sv08', 1); }],
    ['a card taken at the counter', G => { G.state.intake = { n: 1, cost: 4 }; }],
    ['a card in the binder', G => { G.state.singles[key] = { ...card, count: 1 }; }],
    ['a card in the case', G => { G.state.shown.push({ ...card, key, pct: 1.1 }); }],
    ['a card on the pedestal', G => { G.state.gallery[0] = { ...card, key }; }],
    ['a card in a slot', G => { G.state.gallery[1] = { ...card, key }; }],
  ]) {
    const G = shop(), H = shop(); give(G); give(H);
    assert.ok(G.cardBranchReady() && G.growthLock('case') === '' && G.growthLock('luck') === '', `${what} opens both 柜台 roots`);
    assert.ok(G.learn('luck') && G.upgrade('case'), `${what}: 手气 without 展示柜`); assert.ok(H.upgrade('case') && H.learn('luck'), `${what}: 展示柜 without 手气`);
  }

  // A save from before the tree: levels held without their parent stay effective, keep upgrading and survive a reload; nothing else comes free with them.
  { const w = { store: {} }, env = { now: () => NOW, random: S.rng(6), storage: { getItem: k => w.store[k] ?? null, setItem: (k, v) => { w.store[k] = v; } } };
    const L = createGame(env); L.state.cash = 1e9; Object.assign(L.state.up, { racks: 2, case: 1 }); Object.assign(L.state.skills, { watch: 1, crowd: 2 }); L.setPrice('sv08', 1); // any action saves
    const R = createGame(env);
    assert.deepEqual(['racks', 'case', 'depth', 'signage', 'clerk'].map(k => R.lvl(k)).concat(R.skill('watch'), R.skill('crowd')), [2, 1, 0, 0, 0, 1, 2], 'levels survive the reload with no parent');
    assert.equal(R.racks(), R.RACK_BASE + 2); assert.ok(R.cardBranchReady() && R.growthLock('luck') === '', 'owning 展示柜 keeps 手气 open with no card');
    assert.ok(['racks', 'case'].every(k => R.canUpgrade(k)) && ['watch', 'crowd'].every(k => R.canLearn(k)), 'the owned children are open');
    assert.ok(R.upgrade('racks') && R.upgrade('case') && R.learn('watch') && R.learn('crowd'), 'and keep upgrading');
    assert.deepEqual([R.lvl('racks'), R.lvl('case'), R.skill('watch'), R.skill('crowd')], [3, 2, 2, 3]); assert.equal(R.racks(), R.RACK_BASE + 3);
    assert.ok(['supplier', 'talk', 'apprentice'].every(k => R.growthLock(k) && !buy(R, k)), 'a sibling or child of a legacy level still asks for its own parent');
    const E1 = shop(); E1.state.up.expand = 1; assert.ok(E1.growthLock('expand') && !E1.upgrade('expand'), 'a legacy 扩建 still waits for the 客流上限 condition');
    const E2 = shop(); fullDex(E2); E2.state.up.expand = 1; assert.ok(E2.growthLock('expand') === '' && E2.upgrade('expand') && E2.lvl('expand') === 2, 'and goes on without 人气 once it is met'); }

  // A restart: the levels 名气 hands out (旧货架, 老店员) satisfy the parents they sit under, and a pack ever opened keeps 柜台 open with the binder gone.
  { const G = shop(); G.buy('sv08', 1); G.open('sv08', 1); G.state.branch.fame = 20; assert.ok(G.learnPerk('fit') && G.learnPerk('hire')); assert.ok(G.bankrupt());
    assert.deepEqual([G.lvl('racks'), G.lvl('depth'), G.lvl('clerk'), G.lvl('signage')], [1, 1, 1, 0]); assert.deepEqual(G.state.singles, {});
    assert.ok(['racks', 'supplier', 'apprentice', 'watch'].every(k => G.growthLock(k) === ''), 'the perks open the branches under them');
    assert.ok(G.growthLock('talk') && G.growthLock('crowd'), 'but not the ones under 招牌');
    assert.ok(G.cardBranchReady() && G.growthLock('case') === '' && G.growthLock('luck') === '', 'the pack opened in the old shop still counts'); }

  // 退回: the child goes back first. A parent with more levels still gives one back; its last level waits for every child.
  { let T = NOW; const G = createGame({ now: () => T, random: S.rng(8), storage: null }), st = () => G.state, short = () => { st().cash = 10; }, rows = () => G.refundable().map(x => x.k).sort();
    st().cash = 1e6; for (const k of ['depth', 'depth', 'racks', 'supplier', 'signage', 'talk']) assert.ok(buy(G, k), k);
    short(); assert.deepEqual(rows(), ['depth', 'racks', 'supplier', 'talk'], 'short of the bill: 招牌 holds its last level while 口才 stands on it');
    assert.ok(G.refundBlock('signage').includes(nameOf('talk')) && G.refundBlock('racks') === '' && G.refundBlock('depth') === '', 'the block names the child and only the blocked row has one');
    const before = JSON.stringify(st()); assert.equal(G.refund('signage'), false); assert.equal(JSON.stringify(st()), before, 'a blocked refund changes nothing');
    assert.ok(G.refund('depth') && G.lvl('depth') === 1, 'Lv 2 of the parent goes back, Lv 1 is still there for the children');
    short(); assert.ok(G.refundBlock('depth') && !rows().includes('depth') && !G.refund('depth'), 'its last level waits for both children');
    short(); assert.ok(G.refund('racks')); short(); assert.ok(G.refundBlock('depth').includes(nameOf('supplier')) && !G.refund('depth'), 'one child back is not enough');
    short(); assert.ok(G.refund('supplier')); short(); assert.ok(G.refund('depth') && G.lvl('depth') === 0, 'both children out: the parent goes');
    assert.equal(G.upgrade('racks'), false, 'and the branch is shut again');
    short(); assert.ok(G.refund('talk')); short(); assert.ok(G.refund('signage') && G.lvl('signage') === 0, 'a skill child holds an upgrade parent the same way');
    const O = createGame({ now: () => T, random: S.rng(8), storage: null }); O.state.cash = 1e6; O.state.up.racks = 2; // a legacy shop: 货架 with no 加层
    assert.ok(O.upgrade('depth')); O.state.cash = 10; const o0 = JSON.stringify(O.state);
    assert.ok(O.refundBlock('depth') && !O.refund('depth') && JSON.stringify(O.state) === o0, 'a level the save already had holds the parent just the same');
    O.state.cash = 1e6; assert.equal(O.refundBlock('depth'), '', 'cash covers the bill: nothing to return, nothing to explain'); }
  // A paid level a 名气 perk later covers is the perk's: 退回 returns the money once and leaves the level, and the branches under it, standing.
  { const G = createGame({ now: () => NOW, random: S.rng(8), storage: null }), st = () => G.state, short = () => { st().cash = 10; };
    st().cash = 1e6; for (const k of ['depth', 'depth', 'depth', 'racks', 'clerk', 'watch']) assert.ok(buy(G, k), k);
    st().branch.fame = 20; assert.ok(G.learnPerk('fit') && G.learnPerk('fit') && G.learnPerk('hire')); // floors: 加层 and 货架 Lv 2, 店员 Lv 1
    assert.deepEqual([G.lvl('depth'), G.lvl('racks'), G.lvl('clerk')], [3, 2, 1]);
    const back = k => { short(); const row = G.refundable().find(x => x.k === k), c0 = st().cash; assert.ok(row && G.refund(k), `${k}: refunded`); assert.ok(Math.abs(st().cash - c0 - row.cost * G.REFUND) < 0.01, `${k}: back at 90%`); };
    back('depth'); assert.equal(G.lvl('depth'), 2, 'the paid level above the floor goes back: Lv 3 → 2');
    back('depth'); back('depth'); assert.equal(G.lvl('depth'), 2, 'the two payments 旧货架 covers return their money and the level stays');
    short(); assert.ok(!G.refund('depth') && !G.refundable().some(x => x.k === 'depth'), 'every payment is used up once');
    back('racks'); assert.equal(G.lvl('racks'), 2, 'a 货架 payment the perk covers: money back, Lv 2 stays');
    back('clerk'); assert.equal(G.lvl('clerk'), 1, '老店员 holds 店员 Lv 1 although 看店 stands on it');
    assert.ok(G.skill('watch') === 1 && G.growthLock('apprentice') === '' && G.refundTo('clerk') === 1, 'its branches are still open');
    assert.ok(!/Lv\d/.test(st().log[0].text), 'a covered payment is not logged as a level lost'); }
  console.log('ok 成长树: locked first buys refused without a trace, both branches open from Lv 1, 柜台 opens from a real card, legacy levels survive reload/perks/restarts, parents refund last');
}

// 顺手还 (GAMEPLAY §4.5): after a week's bill is paid, 九姐 takes a third of the loan (at least LOAN_MIN) back from cash above the
// float. It never makes a bill late, is never borrowed for and never bankrupts; a till with nothing beyond the float just compounds.
// And the point of it: the player who spends every dollar on growth and never repays (冲动新手) used to end with the loan stuck at the
// credit line for good (~$50k at 16 h, 0/20 seeds cleared); now the loan shrinks whenever the till has room.
{
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(8), storage: null }), st = () => G.state, evs = []; G.on(ev => { if (ev?.type) evs.push(ev); });
  const week = () => { for (let i = 0; i < G.WEEK; i += 20) { T += 20e3; G.tick(); } };
  // a shop that sells nothing (packs in the back room only, so no soft-lock loan either) and a till just over the bills
  st().shelves.forEach(x => { x.qty = 0; }); st().stock.sv08 = 50; st().loan = 1000; st().debt = st().owe + 1000;
  st().cash = G.installment(1) + G.installment(2) + 500;
  assert.equal(G.nextBill().loanPay, G.LOAN_MIN, 'scheduled: the minimum (a third of $1,100 is less)');
  assert.equal(G.spare(), Math.max(0, st().cash - G.nextBill().amount - G.LOAN_MIN), '闲钱 sets the 顺手还 aside too');
  week(); week();
  assert.deepEqual(evs.map(e => e.type), ['bill_due', 'bill_paid', 'bill_due', 'bill_paid'], 'both bills paid, nothing borrowed');
  assert.equal(st().loan, 1210, 'nothing above the float: it compounds, $1,000 → $1,210 in two weeks');
  // money above the float: the scheduled third comes back, and the float stays in the till
  st().best = 1e5; st().loan = 30000; st().debt = st().owe + st().loan; st().cash = G.installment(3) + G.loanFloat() + 50000; // under a $100k credit line
  assert.equal(G.nextBill().loanPay, 11000); week(); assert.ok(Math.abs(st().loan - 22000) < 1, 'grown to $33,000, a third back');
  st().cash = G.installment(4) + G.loanFloat() + 700; const L2 = st().loan; week();
  assert.ok(Math.abs(st().loan - (L2 * (1 + G.loanRate()) - 700)) < 1 && Math.abs(st().cash - G.loanFloat(st().week)) < 1, 'only what is above the float (restock money + next installment)');
  // a bill the till can't cover: no 顺手还 on top, and the forced loan is still exactly the shortfall
  evs.length = 0; st().cash = 10; const L3 = st().loan; week(); for (let i = 0; i < G.GRACE + 40; i += 20) { T += 20e3; G.tick(); }
  const forced = evs.find(e => e.type === 'loan_taken'); assert.ok(forced?.forced && Math.abs(st().loan - (L3 * (1 + G.loanRate()) + forced.amount - (evs.find(e => e.type === 'bill_paid').amount - G.installment(5)))) < 1, 'overdue: borrowed the short, nothing else taken');
  // the loan is the last of the debt: 顺手还 clears it and the shop is yours
  st().owe = 0; st().loan = 500; st().debt = 500; st().cash = G.loanFloat() + 1e4; evs.length = 0; week();
  assert.ok(st().debt === 0 && evs.some(e => e.type === 'story' && e.id === 'debt_cleared'), '顺手还 can clear the debt');
  const { KINDS } = await import('../scripts/autoplay.mjs'), r = KINDS['冲动新手']({ hours: 16, seed: 1 });
  assert.ok(r.debt.broke.length === 0 && (r.debt.cleared || r.G.state.loan < 20000), `冲动新手 seed 1 in 16 h: cleared at ${r.debt.cleared?.h} h or loan $${Math.round(r.G.state.loan)} (before 顺手还 it was $53k)`);
  console.log(`ok 顺手还: poor till compounds to $1,210, a rich one pays a third back above the float; 冲动新手 16 h: cleared ${r.debt.cleared?.h ?? 'no'}, loan $${Math.round(r.G.state.loan)}`);
}

// ---------- 开张期 and 暂停 (src/game.ts OPENING, pause) ----------
{
  // 开张期: a fresh shop's shelf priced at 60% of market (every flipper's bargain) and topped up to 10 packs every second, so a flipper would
  // sweep it whole if one came. Until OPENING seconds of shop time none comes; until OPENING_CAP one takes at most half the shelf; then as before.
  const sweeps = { early: 0, cap: [], after: [] };
  for (let seed = 1; seed <= 8; seed++) {
    let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(seed), storage: null }), st = () => G.state;
    const ids = PTCG_SETS.filter(s => G.unlocked(s.id)).map(s => s.id); st().cash = 1e6;
    ids.forEach((id, i) => { G.place(i, id); G.setPrice(id, G.MIN_PCT); });
    let seen = 0;
    for (let t = 1; t <= 2 * G.WEEK; t++) {
      for (const id of ids) { const n = 10 - G.shelfQty(id); if (n > 0) { G.buy(id, n); G.shelve(id, n); } }
      T += 1000; G.tick();
      for (const v of st().recent) { if (v.at <= seen) break; if (v.t !== 'flipper') continue; // recent is newest first
        if (t <= G.OPENING) sweeps.early++; else if (t <= G.OPENING_CAP) { if (v.r === 'sold') sweeps.cap.push(v.n); } else if (v.r === 'sold') sweeps.after.push(v.n); }
      seen = st().recent[0]?.at ?? seen;
    }
  }
  const G0 = createGame({ storage: null }), half = Math.ceil(10 * G0.FLIP_SHARE);
  assert.ok(G0.OPENING >= 5 * 60 && G0.OPENING_CAP > G0.OPENING && G0.FLIP_SHARE <= 0.5, `a real 开张期: ${G0.OPENING} s with no flippers, then ≤ ${G0.FLIP_SHARE} of a shelf until ${G0.OPENING_CAP} s`);
  assert.equal(sweeps.early, 0, 'no 倒爷 visits in the first OPENING seconds of a shop');
  assert.ok(sweeps.cap.length >= 4 && Math.max(...sweeps.cap) <= half, `week 1 after 开张期: flippers come, each takes at most half of a 10-pack shelf (${sweeps.cap})`);
  assert.ok(sweeps.after.length >= 4 && Math.max(...sweeps.after) > half, `after the first bill flippers take what they did before, up to ${4 + 11} packs (${sweeps.after})`);

  // 暂停: a story scene stands the shop still: no walk-ins, no sales, no bill clock, no bill, nothing credited as an absence; on
  // resume the clock goes on exactly where it stopped.
  let T = 1_700_000_000_000; const G = createGame({ now: () => T, random: S.rng(5), storage: null }), st = () => G.state, evs = []; G.on(ev => { if (ev?.type) evs.push(ev.type); });
  const id = PTCG_SETS.find(s => G.unlocked(s.id)).id; G.buy(id, 30); G.place(0, id); G.shelve(id, 30);
  const run = secs => { for (let s = 0; s < secs; s += 10) { T += 10e3; G.tick(); } };
  run(20);
  const snap = () => JSON.stringify([st().shopT, G.dueIn(), st().cust, st().cash, G.shelfQty(id), G.missed(id), st().recent.length, st().lost, st().away, st().offline, st().log.length]);
  const before = snap(), visits = st().cust.visits; assert.ok(visits > 0 && G.shelfQty(id) < 30, 'the shop was trading before the pause');
  G.pause(true); assert.equal(G.paused(), true);
  T += 2 * G.WEEK * 1000; G.tick(); T += 5e3; G.tick(); G.leave(); T += 30e3; G.tick(); G.back(); G.pause(true); // a scene that outlasts two weeks, a tab hidden mid-scene, a second pause queued behind
  assert.equal(snap(), before, 'paused: shop time, walk-ins, cash, shelf, bill clock and the ledger all stand still');
  assert.ok(!evs.includes('bill_due'), 'no bill falls due while paused');
  G.pause(false); assert.equal(G.paused(), false); G.pause(false);
  const shopT0 = st().shopT; run(60);
  assert.equal(st().shopT, shopT0 + 60, 'resumed: exactly the 60 s since, not the paused stretch');
  assert.ok(st().cust.visits > visits && st().away === null && st().offline === null, 'walk-ins are back and the paused time is no absence');
  const dueAt = G.dueIn(); run(G.WEEK); assert.equal(G.dueIn() > dueAt - G.WEEK - 1 && evs.includes('bill_due'), true, 'and the bill comes a week of shop time after, not before');
  console.log(`ok 开张期: no 倒爷 in the first ${G.OPENING / 60} min, ≤ half a shelf until ${G.OPENING_CAP / 60} min (${sweeps.cap.length} sweeps, max ${Math.max(...sweeps.cap)}), then up to ${Math.max(...sweeps.after)}; 暂停 freezes the shop and hands the gap back`);
}

// ---------- 收藏室 (state.gallery: the 镇店台 at 0, the 展位 at 1–5), its tickets and the 挂机 / 离线 bonus (src/game.ts) ----------
// The gallery holds physical copies the player shows: no sale, no customer and no auto-fill ever touches it, and no move, branch or
// bankruptcy makes or loses a copy. Ticket money and both bonuses go into the till and state.extra, never into earned, so they unlock no
// set, earn no 名气 and lift no credit line; no random draw is added anywhere (same seed ⇒ same customers, with or without them).
{
  const KEY = 'ptcg-shop-v1', near = (a, b, m, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${m}: ${a} vs ${b}`);
  const pull = (n, price, kind = 'SIR') => ({ set: 'sv08', n: String(n), name: `卡${n}`, r: kind, kind, price }), keyOf = c => `${c.set}|${c.n}|${c.kind}`;
  // A shop on a fake clock with its own seeded dice and storage (a reload is a second createGame over the same store).
  const shop = seed => {
    const w = { T: 1_700_000_000_000, store: {} };
    w.env = { now: () => w.T, random: S.rng(seed), storage: { getItem: k => w.store[k] ?? null, setItem: (k, v) => { w.store[k] = v; } } };
    w.G = createGame(w.env); w.st = () => w.G.state;
    w.run = (secs, step = 1) => { for (let s = 0; s < secs; s += step) { w.T += step * 1e3; w.G.tick(); } };
    w.give = (card, count = 1) => { w.st().singles[keyOf(card)] = { ...card, count }; return keyOf(card); };
    w.noDebt = () => { w.st().owe = 0; w.st().debt = 0; return w; };
    return w;
  };
  const copies = g => { const m = {}, add = (k, n = 1) => { m[k] = (m[k] || 0) + n; }; for (const [k, c] of Object.entries(g.state.singles)) add(k, c.count); for (const c of g.state.shown) add(c.key); for (const c of g.state.gallery) if (c) add(c.key); return m; };
  const earned = g => g.state.earned.sealed + g.state.earned.singles;
  // A trading shop: level-2 clerk, 10 packs opened (bulk for the clerk to sell), a stocked shelf and 3 big cards in the case; the cash never runs short.
  const busy = (seed, skills = {}) => {
    const w = shop(seed), G = w.G, st = w.st; st().cash = 1e6; Object.assign(st().skills, skills);
    G.upgrade('clerk'); G.upgrade('clerk'); G.buy('sv08', 210); G.open('sv08', 10); G.place(0, 'sv08');
    for (let i = 0; i < 3; i++) st().shown.push({ key: `sv08|big${i}|SIR`, set: 'sv08', n: `big${i}`, name: `big${i}`, r: 'SIR', kind: 'SIR', price: 40, pct: 1.1 });
    return w;
  };
  const withRoom = w => { assert.ok(w.G.collectToGallery(w.give(pull('room', 100)), 1)); return w; }; // a $100 card in a slot (not on the pedestal: no collectors): ticket $2, one visitor per 30 s

  // 1. Moves. Every copy stays accounted for through any sequence of moves, valid or not, in or out of a reveal.
  {
    const w = shop(1), G = w.G, st = w.st, A1 = pull('a', 100), B1 = pull('b', 50), C1 = pull('c', 0.1, 'C');
    const kA = w.give(A1, 2), kB = w.give(B1), kC = w.give(C1, 3), total = copies(G);
    assert.deepEqual(st().gallery, Array(6).fill(null)); assert.deepEqual([G.GALLERY_SLOTS, G.ROOM_SLOTS, G.PEDESTAL, st().v, 'trophy' in st()], [5, 6, 0, 2, false], 'one pedestal and five slots, no separate trophy');
    assert.ok(G.collectToGallery(kA, 1)); assert.equal(st().singles[kA].count, 1); assert.equal(st().gallery[1].key, kA);
    assert.equal(G.collectToGallery(kA, 1), false, 'an occupied slot takes nothing');
    assert.ok(G.collectToGallery(kA, 2)); assert.equal(st().singles[kA], undefined, 'the last copy leaves its pocket, not a pocket of 0');
    assert.equal(G.collectToGallery(kA, 3), false, 'no copy left to place');
    assert.ok(G.collectToGallery(kC, 5), 'any card the player owns can be shown, not only hits'); assert.equal(G.trophyBonus(), 0, 'the slots draw no collectors');
    assert.ok(G.toPedestal(kB)); assert.ok(G.trophyBonus() > 0); assert.equal(st().gallery[0].key, kB); assert.equal(G.toPedestal(kB), false, 'no copy of it left in the binder');
    assert.ok(G.moveCollect(0, 4)); assert.equal(G.trophyBonus(), 0, 'the card moved off the pedestal: its collectors stop coming'); assert.equal(st().gallery[4].key, kB);
    assert.deepEqual(copies(G), total);
    assert.ok(G.moveCollect(2, 3)); assert.deepEqual(st().gallery.map(c => c?.key ?? null), [null, kA, null, kA, kB, kC], 'an occupied slot moves into an empty one');
    assert.ok(G.moveCollect(1, 4)); assert.deepEqual(st().gallery.map(c => c?.key ?? null), [null, kB, null, kA, kA, kC], 'two cards swap');
    assert.ok(G.moveCollect(1, 0)); assert.ok(G.trophyBonus() > 0, 'a card moves onto the empty pedestal'); assert.deepEqual(st().gallery.map(c => c?.key ?? null), [kB, null, null, kA, kA, kC]);
    assert.ok(G.uncollect(3)); assert.equal(st().singles[kA].count, 1); assert.equal(G.uncollect(3), false, 'the slot is empty now');
    assert.equal(G.moveCollect(1, 3), false, 'two empty slots'); assert.equal(G.moveCollect(2, 2), false, 'a slot onto itself'); assert.deepEqual(copies(G), total);
    st().singles.pile = { ...pull('pile', 5), count: G.BINDER + 5 }; const full = copies(G);
    assert.ok(G.uncollect(0), 'a full binder only stops 收卡, never a card coming home (the pedestal card too)'); assert.equal(G.trophyBonus(), 0); assert.deepEqual(copies(G), full); delete st().singles.pile;
    // a reveal: the cards just pulled are already in singles, so nothing may leave singles for the room until they are flipped
    st().cash = 1e6; G.buy('sv08', 1); const [pack] = G.open('sv08', 1), k0 = keyOf(pack[0]); G.tick(true);
    assert.equal(G.revealing(), true); const before = JSON.stringify(st());
    assert.equal(G.collectToGallery(k0, 1), false, 'refused while packs are being revealed'); assert.equal(G.toPedestal(k0), false, 'the pedestal too'); assert.equal(JSON.stringify(st()), before);
    assert.ok(G.moveCollect(4, 2), 'moves inside the room are safe mid-reveal'); assert.ok(G.uncollect(2), 'and so is taking a card out of it'); G.tick(false);
    assert.equal(G.revealing(), false); assert.ok(G.collectToGallery(k0, 1), 'and the card goes once the reveal is over');
    // any sequence: valid and invalid slots and keys, pedestal and case moves, ticks in and out of a reveal
    const v = shop(2), V = v.G, vk = [v.give(A1, 2), v.give(B1, 2), v.give(C1, 2), 'nope'], vt = copies(V), rnd = S.rng(1234), pick = n => Math.floor(rnd() * n), slot = () => pick(8) - 1;
    let put = 0;
    for (let i = 0; i < 800; i++) {
      const op = pick(9), key = vk[pick(4)];
      if (op <= 1) put += +V.collectToGallery(key, slot()); else if (op === 2) put += +V.toPedestal(key); else if (op === 3) V.uncollect(slot()); else if (op === 4) V.moveCollect(slot(), slot());
      else if (op === 5) V.moveCollect(slot(), 0); else if (op === 6) V.uncollect(0); else if (op === 7) V.list(key); else V.tick(pick(2) === 0);
      assert.deepEqual(copies(V), vt, `copy count after step ${i} (op ${op})`);
    }
    assert.ok(put > 10, `the sequence did put cards on show (${put})`); assert.deepEqual(copies(createGame({ ...v.env, random: S.rng(3) })), vt, 'and the save has the same copies');
  }

  // 2. The room is never sold, listed, filled or bought: not by 卖同行, 卖散卡, the clerk's bulk sale, 带徒弟, seekers or collectors.
  {
    const w = shop(3), G = w.G, st = w.st; st().cash = 1e6; G.upgrade('clerk'); G.upgrade('clerk'); assert.ok(G.learn('apprentice'));
    G.buy('sv08', 120); G.place(0, 'sv08');
    const K = w.give(pull('s1', 60), 2), Z = w.give(pull('s2', 2, 'C'), 40);
    assert.ok(G.collectToGallery(K, 1)); assert.ok(G.collectToGallery(Z, 2)); const room = JSON.stringify(st().gallery);
    const cash0 = st().cash; assert.ok(G.sellBulk() > 0); near(st().cash - cash0, 39 * 2 * G.BUYLIST, 'only the 39 bulk cards in the binder sold');
    assert.equal(G.sell(Z), 0, 'no copy in singles: nothing to sell, whatever is on show');
    for (let i = 0; i < 2160 && (st().singles[K] || st().shown.some(c => c.key === K)); i++) w.run(10, 10);
    assert.ok(!st().singles[K] && !st().shown.some(c => c.key === K), 'the copy in the binder sold to a customer'); assert.equal(copies(G)[K], 1);
    assert.equal(JSON.stringify(st().gallery), room, 'and the one on show is still there');
    assert.equal(G.sell(K), 0); assert.equal(G.list(K), false); assert.equal(G.toPedestal(K), false); G.fillCase(); w.run(600, 10);
    assert.equal(JSON.stringify(st().gallery), room, 'selling, listing, the pedestal, 补满柜位 and ten more minutes of trade leave it alone');
  }

  // 3. Invalid input changes nothing: not the state, not the save, not a single listener call.
  {
    const w = shop(4), G = w.G, st = w.st, kA = w.give(pull('a', 100)), kB = w.give(pull('b', 50)), kT = w.give(pull('t', 70));
    assert.ok(G.collectToGallery(kA, 1)); assert.ok(G.toPedestal(kT)); w.give(pull('z', 5), 0);
    let heard = 0; G.on(() => heard++); const snap = () => JSON.stringify([st(), w.store]), before = snap();
    for (const bad of [-1, 6, 1.5, NaN, Infinity, '1', null, undefined, {}, [1]]) {
      assert.equal(G.collectToGallery(kB, bad), false, `slot ${String(bad)}`); assert.equal(G.toPedestal(bad), false); assert.equal(G.uncollect(bad), false);
      assert.equal(G.moveCollect(bad, 1), false); assert.equal(G.moveCollect(1, bad), false);
    }
    for (const key of ['nope', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 42, null, undefined, {}, keyOf(pull('z', 5))]) { assert.equal(G.collectToGallery(key, 2), false, `key ${String(key)}`); assert.equal(G.toPedestal(key), false, `pedestal key ${String(key)}`); }
    assert.equal(G.collectToGallery(kB, 1), false, 'occupied'); assert.equal(G.collectToGallery(kB, 0), false, 'the pedestal is occupied too'); assert.equal(G.uncollect(2), false, 'empty slot');
    assert.equal(G.moveCollect(2, 3), false, 'two empty slots'); assert.equal(G.moveCollect(1, 1), false, 'same slot');
    assert.equal(snap(), before); assert.equal(heard, 0);
  }

  // 4. Ticket price: nothing for an empty room, $1 at least and $20 at most for a room with a card in it, from the prices the cards are shown at.
  {
    const w = shop(5).noDebt(), G = w.G, st = w.st, room = (...prices) => { st().gallery = [...prices.map((p, i) => ({ key: `k${i}`, ...pull(`t${i}`, p) })), ...Array(6 - prices.length).fill(null)]; return G.ticketPrice(); };
    assert.deepEqual([G.ticketPrice(), G.galleryValue(), G.TICKET_MIN, G.TICKET_MAX], [0, 0, 1, 20]);
    w.run(3600, 10); assert.deepEqual(st().extra, { tickets: 0, idle: 0, offline: 0 }); assert.equal(st().galleryAcc, 0); assert.equal(st().cash, 1000, 'an empty room earns nothing, and nobody queues for it');
    G.leave(); w.T += 3600e3; G.tick(); G.back(); assert.equal(st().cash, 1000); assert.ok(st().offline.secs > 0 && st().offline.tickets === undefined && st().offline.bonus === undefined, 'no tickets or bonus on the receipt of an empty room');
    const table = [[[0.1], 1], [[0], 1], [[24.99], 1], [[99.99], 1], [[100], 2], [[400], 4], [[2500], 10], [[1000, 1500], 10], [[9999], 19], [[10000], 20], [[1e6], 20], [[2000, 2000, 2000, 2000, 2000], 20]];
    for (const [ps, want] of table) assert.equal(room(...ps), want, `a room worth ${ps.join(' + ')}`);
    assert.equal(room(100, 0, 0, 0, 0, 0), 2, 'the pedestal counts toward the value and the ticket'); assert.equal(room(0, 0, 0, 0, 0, 100), 2, 'and so does the last slot');
    room(0.1, 0.2); near(G.galleryValue(), 0.3, 'the value is the sum of the shown prices'); st().gallery.fill(null); assert.equal(G.ticketPrice(), 0, 'emptied again: back to nothing');
  }

  // 5. The clock is credited once, to the second the shop traded: visitors come at GALLERY_RATE, whole visitors pay, the rest carries over.
  {
    const mk = seed => withRoom(shop(seed).noDebt());
    const w = mk(6), G = w.G, st = w.st, cash0 = st().cash; assert.equal(G.ticketPrice(), 2);
    w.run(3600, 1); assert.equal(st().extra.tickets, 240, 'an hour of one-second ticks: 120 visitors at $2'); near(st().cash - cash0, 240, 'the till has exactly that');
    for (let i = 0; i < 5; i++) G.tick(); assert.equal(st().extra.tickets, 240, 'ticking again at the same moment credits nothing');
    const a = mk(6), b = mk(6); a.run(100, 1); b.run(100, 100); assert.deepEqual([a.st().extra.tickets, b.st().extra.tickets], [6, 6], 'one long tick = many short ones');
    const c = mk(6); c.run(45, 45); assert.equal(c.st().extra.tickets, 2, 'a visitor every 30 s: one in 45 s'); near(c.st().galleryAcc, 0.5, 'half a visitor carried');
    const d = createGame({ ...c.env, random: S.rng(1) }); near(d.state.galleryAcc, 0.5, 'saved with the carry'); c.T += 15e3; d.tick();
    assert.equal(d.state.extra.tickets, 4, 'a reload in the middle of a visitor loses none of it');
    // nobody queues for an empty room: the half visitor waiting when the last card leaves is gone with it
    const e = mk(6), room = keyOf(pull('room', 100)); e.run(45, 45); assert.ok(e.G.uncollect(1)); e.run(600, 10); assert.equal(e.st().galleryAcc, 0); assert.ok(e.G.collectToGallery(room, 1)); e.run(20, 20);
    assert.equal(e.st().extra.tickets, 2, 'the card put back starts with an empty queue: still only the first visitor');
    // a tick that pays a ticket tells the page (the cash on screen), even when no customer came in that second
    const f = mk(6); let seen = null, stale = 0; f.G.on(() => { seen = f.st().cash; }); for (let i = 0; i < 600; i++) { f.T += 1e3; f.G.tick(); if (f.st().extra.tickets && seen !== f.st().cash) stale++; }
    assert.equal(stale, 0, 'no tick left the page behind the till');
  }

  // 6. Away: a closed shop is credited its offline cap and no more, tickets and bonus alike; a paused shop is credited nothing.
  {
    const mk = (clerk, watch = 0) => { const w = shop(7).noDebt(), K = w.give(pull('big', 2500)); w.st().cash = 1e6; w.st().skills.watch = watch; if (clerk) w.G.upgrade('clerk'); assert.ok(w.G.collectToGallery(K, 1)); return w; };
    const visitors = secs => Math.floor(secs * 2 / 60 + 1e-9);
    const w = mk(true), G = w.G, st = w.st, cash0 = st().cash; assert.equal(G.ticketPrice(), 10);
    G.leave(); w.T += 10 * 3600e3; G.tick(); G.tick(); assert.equal(st().away.secs, G.OFFLINE_CAP, 'ten hours away with a clerk: six traded'); G.back();
    assert.equal(st().offline.secs, G.OFFLINE_CAP); assert.equal(st().offline.tickets, 10 * visitors(G.OFFLINE_CAP)); assert.equal(st().extra.tickets, 7200, '720 visitors at $10, once');
    near(st().cash - cash0, 7200, 'and the till has exactly that'); G.ackOffline();
    G.leave(); w.T += 3600e3; G.tick(); G.back(); assert.equal(st().offline.tickets, 1200, 'the next absence brings its own hour'); assert.equal(st().extra.tickets, 8400);
    const g = mk(true); g.T += 10 * 3600e3; g.G.tick(); g.G.tick(); assert.equal(g.st().offline.tickets, 7200, 'nobody said they left: the gap is the same absence');
    const n = mk(false); n.G.leave(); n.T += 10 * 3600e3; n.G.tick(); n.G.back(); assert.equal(n.st().offline.tickets, 10 * visitors(n.G.NOCLERK_CAP), 'no clerk: one hour');
    const x = mk(true, 3); x.G.leave(); x.T += 20 * 3600e3; x.G.tick(); x.G.back(); assert.equal(x.G.offlineCap(), G.OFFLINE_CAP + 6 * 3600); assert.equal(x.st().offline.tickets, 10 * visitors(x.G.offlineCap()), '看店 3 stretches the cap and the tickets with it');
    const p = mk(false); p.G.pause(true); p.T += 3600e3; p.G.tick(); p.T += 3600e3; p.G.tick(); assert.equal(p.st().extra.tickets, 0, 'a paused hour earns no tickets');
    p.G.pause(false); p.T += 60e3; p.G.tick(); assert.equal(p.st().extra.tickets, 2 * 10, 'and after the pause only the minute since: 2 visitors'); assert.equal(p.st().offline, null, 'and the pause was no absence');
  }

  // 7. 挂机 and 离线 bonus. Same seed, same customers, same sales: the bonus is extra money in the till and in extra, nowhere else.
  {
    const go = (seed, { idle = false, room = false } = {}) => { const w = busy(seed); if (room) withRoom(w); if (idle) w.G.setIdle(true); w.run(1800, 1); return w; };
    const plain = go(8), idle = go(8, { idle: true }), shown = go(8, { room: true }), both = go(8, { idle: true, room: true });
    const sold = w => JSON.stringify([w.st().cust, w.st().earned, w.st().recent]);
    for (const w of [idle, shown, both]) assert.equal(sold(w), sold(plain), 'same customers, same sales');
    assert.ok(earned(plain.G) > 500, `a shop that sold (${earned(plain.G)})`); assert.deepEqual(plain.st().extra, { tickets: 0, idle: 0, offline: 0 });
    assert.ok(Math.abs(idle.st().extra.idle / (0.25 * earned(idle.G)) - 1) < 0.01, `+25% of what customers paid and the clerk's bulk sale brought: ${idle.st().extra.idle} of ${earned(idle.G)}`);
    near(idle.st().cash - plain.st().cash, idle.st().extra.idle, 'the bonus is in the till and nothing else moved'); assert.equal(idle.st().extra.offline, 0);
    assert.deepEqual([idle.G.revenue(), idle.st().best, idle.G.creditLimit(), idle.G.fameFor()], [plain.G.revenue(), plain.st().best, plain.G.creditLimit(), plain.G.fameFor()], 'not product revenue: credit line, 名气 and unlocks read the same');
    assert.ok(shown.st().extra.tickets > 0 && shown.st().extra.tickets === both.st().extra.tickets, 'idle does not multiply the tickets'); near(shown.st().cash - plain.st().cash, shown.st().extra.tickets, 'tickets are in the till');
    near(both.st().extra.idle, idle.st().extra.idle, 'and the room does not change the bonus');
    // the base is the customers' purchases and the clerk's bulk sale; hand sales, 成就奖金 and tickets get nothing
    const h = shop(9), H = h.G; h.st().cash = 1e6; H.upgrade('clerk'); H.upgrade('clerk'); H.setIdle(true);
    h.give(pull('bulk', 2, 'C'), 50); h.T += 1e3; H.tick(); near(h.st().earned.singles, 50 * 2 * H.BUYLIST, 'the clerk sold the bulk'); near(h.st().extra.idle, 0.25 * 50 * 2 * H.BUYLIST, 'and it counts', 1e-9);
    const k = h.give(pull('hand', 80), 2), i0 = h.st().extra.idle, c0 = h.st().cash; H.sell(k); near(h.st().cash - c0, 2 * 80 * H.BUYLIST, 'a sale by hand pays the buy-list price'); H.bonus(100, '奖'); near(h.st().cash - c0, 2 * 80 * H.BUYLIST + 100, '成就奖金 pays what it says');
    assert.equal(h.st().extra.idle, i0, 'no bonus on either');
    // eligibility: the flag alone is not enough
    const e = busy(10), E = e.G; assert.equal(E.idling(), false); E.setIdle(true); assert.equal(E.idling(), true); E.pause(true); assert.equal(E.idling(), false, 'paused'); E.pause(false); assert.equal(E.idling(), true);
    E.leave(); assert.equal(E.idling(), false, 'away'); E.back(); assert.equal(E.idling(), true);
    const away = (watch, told) => {
      const w = busy(11, { watch }), G = w.G; G.setIdle(true); w.run(60, 1); const idle0 = w.st().extra.idle; assert.ok(idle0 > 0);
      if (told) G.leave(); w.T += 3600e3; G.tick(); G.back(); return { w, o: w.st().offline, idle0 };
    };
    for (const told of [true, false]) {
      const none = away(0, told); assert.ok(none.o.sales > 0); assert.equal(none.w.st().extra.idle, none.idle0, 'away: no idle bonus, though the flag is still on'); assert.deepEqual([none.w.st().extra.offline, none.o.bonus], [0, undefined], 'and no 看店 bonus without 看店');
      const lv = away(3, told), base = lv.o.revenue + lv.o.detail.bulk; assert.equal(lv.w.st().extra.idle, lv.idle0, 'never both');
      assert.ok(Math.abs(lv.o.bonus / (lv.w.G.OFFLINE_BONUS * 3 * base) - 1) < 0.01, `看店 3 = +15% of the absence's sales (${lv.o.bonus} of ${base})`); near(lv.o.bonus, lv.w.st().extra.offline, 'the receipt and the ledger agree');
    }
    // a flip settles the elapsed time under the mode it was spent in, never the new one
    const run2 = how => { const w = busy(12); w.G.setIdle(true); w.T += 100e3; how(w); w.T += 100e3; w.G.tick(); return w; };
    const X = run2(w => w.G.setIdle(false)), Y = run2(w => { w.G.tick(); w.G.setIdle(false); });
    assert.ok(X.st().extra.idle > 0 && X.st().extra.idle === Y.st().extra.idle && X.st().cash === Y.st().cash, 'the 100 s before the flip were idle, the 100 s after not');
    const Z = busy(12); Z.T += 100e3; Z.G.setIdle(true); assert.equal(Z.st().extra.idle, 0, 'time spent elsewhere is not paid the new bonus'); Z.T += 100e3; Z.G.tick(); assert.ok(Z.st().extra.idle > 0);
    // a flip mid-reveal keeps the reveal: the cards still to be flipped stay out of reach
    const r = busy(13), R = r.G; R.tick(true); R.setIdle(true); assert.equal(R.revealing(), true); R.setIdle(false); assert.equal(R.revealing(), true); R.tick(false); R.setIdle(true); assert.equal(R.revealing(), false);
    const p = busy(14), P = p.G; P.pause(true); P.setIdle(true); p.T += 3600e3; P.tick(); assert.equal(p.st().extra.idle, 0); P.pause(false); p.run(30, 1); assert.ok(p.st().extra.idle > 0, 'a flag set while paused counts from the resume');
  }

  // 8. Not product revenue: six hours of $20 tickets (14,400, past the 1,600 that unlocks a set and the 12,500 of the first 名气) change none of the revenue-driven numbers.
  {
    const w = shop(15).noDebt(), G = w.G, st = w.st; for (let i = 0; i < 5; i++) assert.ok(G.collectToGallery(w.give(pull(`v${i}`, 2000)), i + 1)); assert.equal(G.ticketPrice(), 20);
    w.run(6 * 3600, 10); assert.equal(st().extra.tickets, 14400); near(st().cash, 1000 + 14400, 'the till has it');
    assert.deepEqual([G.revenue(), st().best, G.fameFor(), G.unlocked('sv08.5'), G.creditLimit()], [0, 0, 0, false, G.LOAN_FLOOR]); assert.ok(st().week > 15, 'weeks went by (the credit line is judged each one)');
  }

  // 9. Prestige and bankruptcy: the room stays, the shop's own cards go as before, and the books of that shop start again.
  {
    const mk = seed => {
      const w = shop(seed), G = w.G; w.st().cash = 1e6; w.st().extra = { tickets: 5, idle: 3, offline: 2 };
      const gal = w.give(pull('p1', 200)), troph = w.give(pull('p2', 300)), both = w.give(pull('p3', 400), 3); w.give(pull('p4', 100));
      assert.ok(G.collectToGallery(gal, 1)); assert.ok(G.toPedestal(troph)); assert.ok(G.collectToGallery(both, 2)); assert.ok(G.list(both)); return w; // room: p1 + p3 in slots, p2 on the pedestal; case: p3; binder: p3, p4
    };
    const w = mk(16), G = w.G, st = w.st, room = structuredClone(st().gallery), total = copies(G); st().owe = st().debt = 0;
    assert.ok(G.branch()); assert.deepEqual(st().gallery, room, 'the room opens in the new shop, the pedestal too'); assert.deepEqual(copies(G), total, 'and the case came back to the binder: every copy is still there'); assert.ok(G.trophyBonus() > 0, 'the pedestal still draws collectors');
    assert.deepEqual(st().extra, { tickets: 0, idle: 0, offline: 0 }); assert.equal(st().galleryAcc, 0); assert.equal(G.ticketPrice(), 6, 'a room worth 900');
    const b = mk(17), B = b.G, held = 400 + 100 + 400, rm = structuredClone(b.st().gallery), value = B.galleryValue();
    assert.ok(B.bankrupt()); assert.deepEqual(b.st().gallery, rm, '九姐 takes the shop, not the room');
    near(b.st().wreck.cards, held, 'the statement counts the shop’s cards only'); assert.deepEqual(b.st().wreck.gallery, { n: 3, value }, 'and says what she left');
    assert.deepEqual([b.st().singles, b.st().shown], [{}, []]); assert.deepEqual(b.st().extra, { tickets: 0, idle: 0, offline: 0 }); assert.equal(B.galleryValue(), 900); assert.ok(B.trophyBonus() > 0, 'the pedestal survived the bankruptcy');
    assert.deepEqual(createGame({ ...b.env, random: S.rng(1) }).state.gallery, rm, 'and it is saved so');
    const clean = shop(18); clean.st().cash = 1e6; clean.G.bankrupt(); assert.equal(clean.st().wreck.gallery, undefined, 'no room, nothing to say');
    const r = mk(19); r.G.reset(); assert.deepEqual(r.st().gallery, Array(6).fill(null), '清空存档 is the one thing that clears it');
  }

  // 10. Save, reload and damaged saves.
  {
    const w = shop(20), G = w.G, st = w.st, kA = w.give(pull('r1', 300), 2), kB = w.give(pull('r2', 20)); assert.ok(G.collectToGallery(kA, 4)); assert.ok(G.collectToGallery(kB, 0));
    st().extra = { tickets: 12, idle: 3.5, offline: 1.25 }; st().galleryAcc = 0.25; assert.ok(G.moveCollect(4, 3));
    const H = createGame({ ...w.env, random: S.rng(1) });
    assert.deepEqual([H.state.gallery, H.state.extra, H.state.galleryAcc, H.ticketPrice(), H.galleryValue(), H.state.v], [st().gallery, st().extra, 0.25, G.ticketPrice(), 320, 2], 'the room, its ledger and its carry come back as saved'); assert.equal(H.state.gallery[0].key, kB, 'the pedestal too'); assert.ok(!('trophy' in JSON.parse(w.store[KEY])), 'and no trophy field is written');
    const store = {}, env = { now: () => 1_700_000_000_000, random: S.rng(2), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    store[KEY] = JSON.stringify({ cash: 10, singles: {} }); const O = createGame(env); // a save from before the room
    assert.deepEqual([O.state.gallery, O.state.extra, O.state.galleryAcc, O.ticketPrice(), O.state.v], [Array(6).fill(null), { tickets: 0, idle: 0, offline: 0 }, 0, 0, 2]);
    const real = PTCG_DATA.sv08.cards[0], good = { key: keyOf(pull(real.n, 12, real.r)), ...pull(real.n, 12, real.r), name: 'old English name' };
    store[KEY] = JSON.stringify({ cash: 10, v: 2, gallery: [null, {}, good, { ...good, price: null }, 'x', { ...good, key: 3 }, good], extra: { tickets: 'a', idle: -1, offline: 7 }, galleryAcc: 5 });
    const D = createGame(env);
    assert.deepEqual(D.state.gallery.map(c => c?.key ?? null), [null, null, good.key, null, null, null], 'six places; a damaged card is an empty place, never half a card'); assert.equal(D.state.gallery[2].name, real.name, 'the loader refreshes names like it does for the binder');
    assert.equal(D.state.singles[good.key].count, 1, 'a whole card past the last place goes home to the binder, not into the void');
    assert.deepEqual([D.state.extra, D.state.galleryAcc], [{ tickets: 0, idle: 0, offline: 7 }, 0]);
    // a card without its kind, or under another card's key, is no card of the room: back in the binder it would read as bulk and the clerk would sell it
    const { kind: _k, ...noKind } = good, { r: _r, ...noR } = good;
    store[KEY] = JSON.stringify({ cash: 10, v: 2, gallery: [noKind, noR, { ...good, key: 'sv08|other|SIR' }, { ...good, price: -1 }, good] });
    assert.deepEqual(createGame(env).state.gallery.map(c => c?.key ?? null), [null, null, null, null, good.key, null], 'a card is whole and under its own key, or it is not there');
    // an amount on a saved receipt that is not a finite number from zero up counts as none: the sums and the 离开 line stay whole
    const rc = { secs: 600, sales: 3, revenue: 30, lost: 0 }, damaged = (x, y) => JSON.stringify({ cash: 10, offline: { ...rc, tickets: x, bonus: y }, away: { ...rc, at: 1_700_000_000_000 - 600e3, tickets: y, bonus: x } });
    store[KEY] = damaged('1', 'x'); const Q = createGame(env);
    assert.ok(['offline', 'away'].every(k => !('tickets' in Q.state[k]) && !('bonus' in Q.state[k])), 'strings are dropped from both receipts');
    store[KEY] = damaged(-5, 2.5); const U = createGame(env);
    assert.deepEqual([U.state.offline.tickets, U.state.offline.bonus, U.state.away.tickets, U.state.away.bonus], [undefined, 2.5, 2.5, undefined], 'a negative amount is none, a good one stays');
    U.back(); // ten minutes away: the away receipt joins the one on screen, sums of numbers only
    assert.deepEqual([U.state.offline.tickets, U.state.offline.bonus, U.state.offline.secs], [2.5, 2.5, 1200], 'and the merge adds numbers, never a string or a NaN');
  }

  // 11. Receipts: tickets and bonus add up across absences and match the ledger, and the till's change is accounted for to the cent.
  {
    const w = shop(21), G = w.G, st = w.st; st().cash = 1e6; st().earned.sealed = 1e6; st().skills.watch = 2;
    G.upgrade('clerk'); G.upgrade('clerk'); G.setBuyPct(G.BUY_MAX); G.buy('sv08', 15); G.open('sv08', 15);
    for (const [id, i] of [['sv08', 0], ['sv10', 1]]) { G.buy(id, G.depth()); G.place(i, id); }
    for (let i = 0; i < 3; i++) st().shown.push({ key: `sv08|big${i}|SIR`, set: 'sv08', n: `big${i}`, name: `big${i}`, r: 'SIR', kind: 'SIR', price: 40, pct: 1.1 });
    assert.ok(G.collectToGallery(w.give(pull('r', 2500)), 1)); const c0 = st().cash, e0 = earned(G);
    w.T += 1800e3; G.tick(); const o1 = structuredClone(st().offline); assert.equal(o1.tickets, 600); assert.ok(o1.bonus > 0);
    G.leave(); w.T += 1800e3; G.tick(); G.back(); const o2 = st().offline, d = o2.detail;
    assert.equal(o2.tickets, 1200); assert.ok(o2.bonus > o1.bonus, 'both absences paid 看店'); near(o2.tickets, st().extra.tickets, 'tickets: receipt = ledger'); near(o2.bonus, st().extra.offline, 'bonus: receipt = ledger'); assert.equal(st().extra.idle, 0);
    near(d.cash, st().cash - c0, 'detail.cash is the till’s real change'); near(d.cash, o2.revenue - d.intake - d.restock + d.bulk - o2.bills + o2.tickets + o2.bonus, 'cash = takings − intake − restock + bulk − bills + tickets + bonus');
    near(earned(G) - e0, o2.revenue + d.bulk, 'the books earned only the sales: tickets and bonus are not in them');
    assert.ok(Math.abs(o2.bonus / (G.OFFLINE_BONUS * 2 * (o2.revenue + d.bulk)) - 1) < 0.01, '+10% of the absence’s sales');
    assert.deepEqual(createGame({ ...w.env, random: S.rng(5) }).state.offline, o2, 'the receipt saves and loads whole');
    // an old receipt (no tickets, no bonus, no breakdown) takes a new absence: the new fields start, the old ones stay, the breakdown stays absent
    const raw = JSON.parse(w.store[KEY]); delete raw.offline.detail; delete raw.offline.tickets; delete raw.offline.bonus; w.store[KEY] = JSON.stringify(raw);
    const H = createGame({ ...w.env, random: S.rng(6) }), L = { ...H.state.offline }; assert.ok(!('tickets' in L) && !('bonus' in L));
    H.leave(); w.T += 1800e3; H.tick(); H.back(); const o3 = H.state.offline; assert.equal(o3.tickets, 600); assert.ok(o3.bonus > 0 && !('detail' in o3)); assert.ok(o3.sales > L.sales && o3.revenue > L.revenue);
    // 看店: three levels at 2,400 / 6,000 / 15,000, +5% each, the cap rule untouched
    const s = shop(22); s.st().cash = 1e6; assert.ok(s.G.upgrade('clerk')); const costs = []; for (let i = 0; i < 3; i++) { const c = s.st().cash; assert.ok(s.G.learn('watch')); costs.push(c - s.st().cash); } // 看店 is a branch of 店员: hired first
    assert.deepEqual(costs, [2400, 6000, 15000]); assert.equal(s.G.learn('watch'), false); assert.equal(s.G.skillMax('watch'), 3); near(s.G.OFFLINE_BONUS * s.G.skillMax('watch'), 0.15, 'at most 15%');
    assert.equal(s.G.offlineCap(), s.G.OFFLINE_CAP + 3 * 2 * 3600);
    const legacy = shop(23); legacy.st().cash = 1e6; legacy.st().skills.watch = 3; // a save from before the tree: 看店 with no clerk keeps the no-clerk cap until one is hired
    assert.equal(legacy.G.offlineCap(), legacy.G.NOCLERK_CAP); legacy.G.upgrade('clerk'); assert.equal(legacy.G.offlineCap(), legacy.G.OFFLINE_CAP + 3 * 2 * 3600);
  }

  // 12. The save format (state.v = 2): the old two-part room (a `trophy` beside five slots, no version) loads as the 镇店台 and five 展位, every card kept.
  {
    const store = {}, env = { now: () => 1_700_000_000_000, random: S.rng(2), storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const ex = (n, price) => { const c = pull(n, price); return { key: keyOf(c), ...c }; };
    const T = ex('t', 300), a = ex('a', 200), b = ex('b', 100), c = ex('c', 50), d = ex('d', 40), e = ex('e', 30);
    const keys = g => g.state.gallery.map(x => x?.key ?? null);
    const held = raw => { const m = {}, add = (k, n = 1) => { m[k] = (m[k] || 0) + n; }; for (const [k, x] of Object.entries(raw.singles || {})) add(k, x.count); for (const x of raw.shown || []) add(x.key); if (raw.trophy) add(raw.trophy.key); for (const x of raw.gallery || []) if (x) add(x.key); return m; }; // the copies a raw save holds, however it is laid out
    // a. a trophy and a partial gallery
    const old = { cash: 10, singles: { [c.key]: { ...pull('c', 50), count: 2 } }, trophy: T, gallery: [a, null, b] };
    store[KEY] = JSON.stringify(old); const P = createGame(env);
    assert.deepEqual(keys(P), [T.key, a.key, null, b.key, null, null], 'the trophy is the pedestal, the slots follow it as 第 1–5 格');
    assert.deepEqual([P.state.v, 'trophy' in P.state, P.state.gallery.length], [2, false, 6]); assert.deepEqual(copies(P), held(old), 'every copy is accounted for');
    near(P.trophyBonus(), 300 / 450 * 0.5, 'the bonus reads the pedestal'); assert.equal(P.galleryValue(), 600); assert.equal(P.ticketPrice(), 4, 'the pedestal counts toward the ticket');
    assert.ok(P.moveCollect(1, 2)); const raw = JSON.parse(store[KEY]); assert.deepEqual([raw.v, 'trophy' in raw, raw.gallery.length], [2, false, 6], 'it is saved in the new shape');
    assert.deepEqual(keys(createGame(env)), keys(P), 'a new-format save round-trips');
    // b. a trophy and all five slots
    const full = { cash: 10, trophy: T, gallery: [a, b, c, d, e] }; store[KEY] = JSON.stringify(full); const F = createGame(env);
    assert.deepEqual(keys(F), [T.key, a.key, b.key, c.key, d.key, e.key], 'trophy on the pedestal, all five kept in order'); assert.deepEqual(copies(F), held(full)); assert.deepEqual(F.state.singles, {});
    // c. one of the two missing
    store[KEY] = JSON.stringify({ cash: 10, gallery: [a] }); assert.deepEqual(keys(createGame(env)), [null, a.key, null, null, null, null], 'no trophy: the pedestal is empty and the slots still follow it');
    store[KEY] = JSON.stringify({ cash: 10, trophy: T }); assert.deepEqual(keys(createGame(env)), [T.key, null, null, null, null, null], 'a trophy and no room');
    // d. damage: each place is checked alone, a gallery that is no list is an empty room, a whole card past the end goes home
    const { kind: _k, ...noKind } = T;
    store[KEY] = JSON.stringify({ cash: 10, trophy: noKind, gallery: [a, b] }); assert.deepEqual(keys(createGame(env)), [null, a.key, b.key, null, null, null], 'a damaged trophy is an empty pedestal, the room is kept');
    store[KEY] = JSON.stringify({ cash: 10, v: 2, gallery: [{ ...T, price: 'x' }, a] }); assert.deepEqual(keys(createGame(env)), [null, a.key, null, null, null, null], 'a damaged pedestal in a new save: empty');
    store[KEY] = JSON.stringify({ cash: 10, v: 2, gallery: 'x' }); assert.deepEqual(keys(createGame(env)), Array(6).fill(null), 'a gallery that is no list: an empty room');
    const over = { cash: 10, trophy: T, gallery: [a, b, c, d, e, ex('f', 20), ex('g', 10)] }; store[KEY] = JSON.stringify(over); const Ov = createGame(env);
    assert.deepEqual(keys(Ov), [T.key, a.key, b.key, c.key, d.key, e.key]); assert.deepEqual(copies(Ov), held(over), 'the two cards past the room came home to the binder: none was dropped');
    // e. the bonus is the pedestal's card; putting another on swaps the old one home; the 镇店 achievement reads the pedestal
    const w = shop(30), G = w.G, st = w.st, kA = w.give(pull('x', 150)), kB = w.give(pull('y', 450)), kC = w.give(pull('z', 150)), kS = w.give(pull('s', 90), 2), tro = A.ACH.find(x => x.id === 'trophy');
    assert.ok(G.collectToGallery(kC, 3)); assert.equal(G.trophyBonus(), 0, 'a slot is no pedestal'); assert.equal(A.done(tro, G), false);
    assert.ok(G.toPedestal(kA)); near(G.trophyBonus(), 0.25, '150 / (150 + 150) × 0.5'); assert.ok(A.done(tro, G)); const total = copies(G);
    assert.ok(G.toPedestal(kB)); near(G.trophyBonus(), 450 / 600 * 0.5, 'the new card sets the bonus'); assert.equal(st().singles[kA].count, 1, 'the card that stood there is back in the binder'); assert.deepEqual(copies(G), total);
    assert.ok(G.toPedestal(kS)); const t2 = copies(G); assert.ok(G.toPedestal(kS)); assert.deepEqual(copies(G), t2, 'swapping a card with its own copy keeps the count'); assert.equal(st().singles[kS].count, 1);
    assert.ok(G.uncollect(0)); assert.equal(A.done(tro, G), false, 'the achievement’s progress is the pedestal being occupied');
  }
  console.log('ok 收藏室: moves keep every copy, the 镇店台 is a place like the rest, the room is never sold, tickets and 挂机/离线 bonus are credited once and are not revenue, receipts add up, branch/bankruptcy keep the room, old saves load into the new layout');
}

// Follow the visible guide and shop notes through the third bill: growth must not need a loan.
{
  const { firstHour } = await import('../scripts/autoplay.mjs');
  for (let seed = 1; seed <= 12; seed++) {
    const r = firstHour({ seed, minutes: 70 }), first = r.bills[0], third = r.bills[2];
    assert.ok(r.bills.every(b => b.paid !== null && b.loan === null), `seed ${seed}: all three bills paid without borrowing`);
    assert.equal(r.loans.length, 0, `seed ${seed}: no emergency loan between bills`);
    assert.ok(third.shop.level >= first.shop.level + 1, `seed ${seed}: at least one more level by bill 3`);
    assert.ok(third.shop.racks >= first.shop.racks + 1, `seed ${seed}: another stocked-series slot by bill 3`);
    assert.ok(third.shop.rate + 1e-9 >= first.shop.rate * 1.2, `seed ${seed}: at least 20% more walk-ins by bill 3`);
  }
  console.log('ok 第一小时: guide + shop notes, seeds 1–12 pay bills 1–3 without loans and gain levels, a shelf and ≥20% walk-ins');
}

// ---------- 排行 (src/board.ts): share codes, the checksum, the board ----------
{
  const mk = (seed, { packs = 0, life = 0, sealed = 0, got = 0, ach = 0 } = {}) => {
    const G = createGame({ now: () => 1_700_000_000_000 + seed * 1000, random: S.rng(seed), storage: null }), st = G.state;
    st.cash = 1e7;
    for (let i = 0; packs && G.luck().packs < packs && i < 20; i++) { G.buy('sv08', 999); G.open('sv08', Math.min(st.stock.sv08, packs - G.luck().packs)); }
    st.branch.life = life; st.branch.got = got; st.earned.sealed = sealed; st.ach = Object.fromEntries(Array.from({ length: ach }, (_, i) => [`a${i}`, 1]));
    return G;
  };
  const ida = 'k3j2h1a9x0', idb = 'q8w7e6r5t4';

  // what a snapshot reads from the game: lifetime sales across shops, 名气 earned, cards in every holder at market, 欧气 only from 30 packs
  const young = mk(1, { life: 1000, sealed: 500.5, got: 7, ach: 3 });
  young.state.earned.singles = 10; young.state.singles.k = { key: 'k', price: 12.5, count: 2 }; young.state.shown.push({ key: 's', price: 10 }); young.state.gallery[1] = { key: 'g', price: 40 };
  const y = BD.snapshot(young, ida, '小智的店');
  assert.deepEqual([y.rev, y.fame, y.ach, y.cards, y.packs, y.luck, y.shops, y.at], [151050, 7, 3, 7500, 0, null, 0, 1_700_000_001_000], 'snapshot reads the game');
  const old = mk(2, { packs: 40, life: 5e6, sealed: 1e5, got: 90, ach: 20 }), o = BD.snapshot(old, idb, 'Brock');
  assert.ok(o.packs >= 40 && Number.isInteger(o.luck) && o.luck >= 0 && o.luck <= 1000, 'luck is a permille once 30 packs are open');
  assert.equal(o.dex, Object.keys(old.state.dexSeen).length); assert.ok(o.dex > 0);
  const few = BD.snapshot(mk(3, { packs: 10 }), ida, 'x'); assert.ok(few.packs >= 10 && few.packs < BD.LUCK_MIN_PACKS && few.luck === null, 'no 欧气 on a handful of packs');

  // round trip, whitespace and links
  for (const s of [y, o, few]) { const code = BD.encode(s), d = BD.decode(code); assert.ok(code.startsWith('P1.') && code.length < 200); assert.deepEqual(d, { ok: true, snap: s }); }
  const code = BD.encode(o), url = BD.link('file:///Users/x/dist/index.html?a=1#open', code);
  assert.equal(url, `file:///Users/x/dist/index.html?board=${code}#board`);
  for (const text of [url, ` ${code.slice(0, 20)}\n${code.slice(20)}\n`, `看 ?board=${code}&x=1`]) assert.deepEqual(BD.decode(text), { ok: true, snap: o });

  // one wrong character anywhere (and any cut) is refused; a payload typo is the checksum's catch, even in the last base64 character
  const alt = c => (c === 'A' ? 'B' : 'A'), dot = code.indexOf('.'), dot2 = code.lastIndexOf('.');
  for (const swap of [alt, c => (c === 'a' ? 'b' : 'a')]) for (let i = 0; i < code.length; i++) assert.equal(BD.decode(code.slice(0, i) + swap(code[i]) + code.slice(i + 1)).ok, false, `a change at ${i} must not pass`);
  assert.equal(BD.decode(code.slice(0, dot2 - 1) + alt(code[dot2 - 1]) + code.slice(dot2)).why, 'sum');
  assert.equal(BD.decode(code.slice(0, -1) + (code.at(-1) === 'a' ? 'b' : 'a')).why, 'sum');
  for (const n of [1, 5, dot2 - dot, 30]) assert.equal(BD.decode(code.slice(0, -n)).ok, false, `cut by ${n}`);
  assert.equal(BD.decode(code.replace(/^P1/, 'P2')).why, 'version');

  // garbage and hostile input: refused, never thrown
  for (const g of ['', '   ', 'hello', 'P1.', 'P1..', 'P1.!!!.0000000', 'P1.abc', 'P1.e30.zzzzzzz', 'a.b.c.d', 'board=', '%%%', '\u0000', '{"id":1}', 'A'.repeat(5000), 'P1.' + 'A'.repeat(500) + '.0000000', null, undefined, 42, {}, []])
    assert.equal(BD.decode(g).ok, false, `garbage ${String(g).slice(0, 20)}`);
  assert.equal(BD.decode('A'.repeat(5000)).why, 'size'); assert.equal(BD.decode(' ').why, 'empty');
  // a code whose checksum is right but whose numbers are not a player's (encode does not validate, so it signs anything)
  for (const bad of [{ ...y, rev: -5 }, { ...y, rev: 1e20 }, { ...y, fame: 1.5 }, { ...y, luck: 1001 }, { ...y, id: 'X!' }, { ...y, name: '\u202e\u200b ' }, { ...y, ach: NaN }, { ...y, at: -5000 }])
    assert.equal(BD.decode(BD.encode(bad)).why, 'data', JSON.stringify(bad));
  assert.equal(BD.decode(BD.encode({ ...y, name: '\u202eevil' + 'a'.repeat(30) })).snap.name.length, BD.NAME_MAX);
  assert.ok(!BD.decode(BD.encode({ ...y, name: '\u202eevil' })).snap.name.includes('\u202e'));

  // the board: one entry per device id + nickname, replaced on re-import; a cap; rank order
  let list = BD.upsert([], y).list; assert.equal(BD.upsert(list, o).how, 'added'); list = BD.upsert(list, o).list;
  const again = BD.upsert(list, { ...o, rev: o.rev + 100, at: o.at + 5000 }); assert.equal(again.how, 'replaced'); assert.equal(again.list.length, 2); assert.equal(again.list.find(e => e.id === idb).rev, o.rev + 100);
  assert.equal(BD.upsert(list, { ...o, name: 'Misty' }).how, 'added', 'same device, another nickname: another entry');
  assert.deepEqual(BD.rank(list, 'rev').map(e => e.name), ['Brock', '小智的店']);
  assert.deepEqual(BD.rank(list, 'luck').map(e => e.name), ['Brock', '小智的店'], 'no 欧气 ranks last');
  assert.deepEqual(BD.rank(list, 'fame').map(e => e.name), ['Brock', '小智的店']); assert.deepEqual(BD.rank([...list].reverse(), 'ach').map(e => e.name), ['Brock', '小智的店']);
  const tie = [{ ...y, id: 'bbbbbbbb', name: 'B', at: 20 }, { ...y, id: 'aaaaaaaa', name: 'A', at: 20 }, { ...y, id: 'cccccccc', name: 'C', at: 10 }];
  assert.deepEqual(BD.rank(tie, 'dex').map(e => e.name), ['C', 'A', 'B'], 'ties: older snapshot, then name');
  let full = []; for (let i = 0; i < BD.MAX_ENTRIES; i++) full = BD.upsert(full, { ...y, id: `id${String(i).padStart(6, '0')}` }).list;
  assert.equal(BD.upsert(full, { ...y, id: 'zzzzzzzz' }).how, 'full'); assert.equal(BD.upsert(full, { ...full[0], rev: 1 }).how, 'replaced', 'a full board still takes updates');

  // two saves swap codes: both end up on both boards, ranked
  const mine = BD.snapshot(young, ida, '小智的店'), theirs = BD.snapshot(old, idb, 'Brock');
  const mineBoard = BD.upsert([], BD.decode(BD.encode(theirs)).snap).list, theirsBoard = BD.upsert([], BD.decode(BD.encode(mine)).snap).list;
  assert.deepEqual(BD.rank([mine, ...mineBoard], 'rev').map(e => e.name), ['Brock', '小智的店']);
  assert.deepEqual(BD.rank([theirs, ...theirsBoard], 'rev').map(e => e.name), ['Brock', '小智的店']);

  // what comes back from localStorage is checked like a pasted code
  const blank = { id: '', name: '', metric: 'rev', entries: [] };
  for (const raw of [null, '', 'not json', '[]', '"x"', 'null']) assert.deepEqual(BD.parseStore(raw), blank, String(raw));
  const kept = BD.parseStore(JSON.stringify({ id: ida, name: ' 小智\u0007 ', metric: 'luck', entries: [y, { ...y, rev: -1, id: 'bad00000x' }, 'junk', null, { ...o, rev: 'many' }, o, o] }));
  assert.deepEqual([kept.id, kept.name, kept.metric, kept.entries.length], [ida, '小智', 'luck', 2]);
  assert.deepEqual(BD.parseStore(JSON.stringify({ id: 'BAD ID', metric: 'zzz' })), blank);
  assert.equal(BD.parseStore(JSON.stringify({ entries: Array.from({ length: 500 }, (_, i) => ({ ...y, id: `id${String(i).padStart(6, '0')}` })) })).entries.length, BD.MAX_ENTRIES);
  console.log('ok 排行: snapshot, code round trip, checksum rejects any one-character change, garbage refused, board replace/cap/rank, two saves exchange');
}

// 撕包: the drag picks how a sealed pack tears, one rule for the 3D table and the 2D mat (series.ts; pure, no game state, no random numbers)
{
  const pick = SR.tearFromGesture;
  assert.equal(pick(.5, .1, 60, 4), 'top-ltr'); assert.equal(pick(.5, .1, -60, -4), 'top-rtl'); // sideways from the top third: the crimp strip, the way the finger goes
  assert.equal(pick(.5, .6, 60, 0), 'mid-ltr'); assert.equal(pick(.5, .6, -60, 10), 'mid-rtl'); // sideways from lower down: across the waist
  assert.equal(pick(.2, .2, 4, 60), 'side-l'); assert.equal(pick(.8, .2, -4, 60), 'side-r'); // down: the strip on the edge it started nearer
  assert.equal(pick(.8, .2, 0, -60), null, 'up is not a way to tear: undecided');
  assert.equal(pick(.5, .2, 30, 35), 'top-ltr', 'a diagonal within 1.25 : 1 counts as sideways');
  assert.equal(pick(.5, .2, 30, 38), 'side-r', '…and one steeper counts as down');
  for (const u of [0, .5, 1]) for (const v of [0, .32, .34, 1]) for (let dx = -80; dx <= 80; dx += 20) for (let dy = -80; dy <= 80; dy += 20) {
    const id = pick(u, v, dx, dy);
    if (id) assert.ok(SR.isTearId(id) && SR.tearAlong(id, dx, dy) > 0 || !dx && !dy, `${id} must tear further as the finger goes on (${dx}, ${dy})`);
  }
  assert.deepEqual(SR.TEAR_IDS.map(id => SR.tearOf(id).line), ['top', 'top', 'mid', 'mid', 'side', 'side']);
  assert.deepEqual(SR.tearOf('nope'), SR.tearOf('top-ltr'), 'an unknown id (a stale localStorage value) tears the way packs always did');
  for (const bad of ['', 'toString', '__proto__', 'top', 7, null, undefined]) assert.equal(SR.isTearId(bad), false, String(bad));
  assert.equal(SR.tearAlong('top-ltr', 50, 9), 50); assert.equal(SR.tearAlong('top-rtl', 50, 9), -50); assert.equal(SR.tearAlong('side-r', 3, 40), 40);
  // the torn piece leaves by the side it tore from, with the series' own lift and spin; the top strip keeps the flight it always had
  const f = SR.tearFlight('top-ltr', SR.themeOf('sv08').strip);
  assert.deepEqual([f.lift, f.x, f.y, Math.round(f.deg)], [9, 40 + 9 * 5, -9 * 12, 1080]);
  assert.deepEqual(['top-rtl', 'side-l', 'side-r'].map(id => Math.sign(SR.tearFlight(id).x)), [-1, -1, 1]);
  assert.ok(SR.tearFlight('mid-ltr').spin < SR.tearFlight('top-ltr').spin, 'a half pack turns less than a strip');
  assert.equal(SR.tearClip('top-ltr'), SR.tearClip('top-rtl')); assert.notEqual(SR.tearClip('top-ltr'), SR.tearClip('mid-ltr')); assert.notEqual(SR.tearClip('side-l'), SR.tearClip('side-r'));
  for (const id of SR.TEAR_IDS) assert.match(SR.tearClip(id), /^polygon\((\d+(\.\d)?% \d+(\.\d)?%(, )?)+\)$/, id);
  console.log('ok 撕包: the gesture picks one of six tears, progress follows the finger, flights go out the torn side');
}

// 找卡委托 (game.ts COMM_GAP): an optional request for one hit card. It comes when the cooldown is over and the shop has a clerk or has traded COMM_OPEN seconds, only for a set
// with a shelf; serving it moves exactly one copy out of the binder and pays exactly the reward; letting it lapse or turning it down costs nothing; old and damaged saves load
// without one; a new shop starts clean; and the walk-in stream is exactly what it was without it.
{
  const NOW = 1_700_000_000_000, KEY = 'ptcg-shop-v1';
  // a world has its own clock: games never share time. ticks 10 s apart, as a page that is open ticks (under G.AWAY is no absence)
  const world = (seed = 5, extra = {}) => { const w = { T: NOW }; w.G = createGame({ now: () => w.T, random: S.rng(seed), storage: null, ...extra }); w.st = () => w.G.state;
    w.run = secs => { for (let i = 0; i < secs; i += 10) { w.T += 10e3; w.G.tick(); } }; w.until = (max = 3600) => { for (let i = 0; i < max && !w.st().comm; i += 10) w.run(10); return w.st().comm; }; return w; };
  // a shop in the middle of week 2 with money to burn and one shelf label: no bill falls inside the next ~19 minutes, the bank is never short
  const shop = (seed, extra, sets = ['sv08']) => { const w = world(seed, extra); Object.assign(w.st(), { cash: 1e6, week: 2, shopT: 1250 }); sets.forEach((id, i) => w.G.place(i, id)); return w; };
  const give = (G, c, count = 1) => { const key = G.commKey(c); G.state.singles[key] = { set: c.set, n: c.n, name: c.name, r: c.r, kind: c.kind, price: c.price, count }; return key; };

  // 1. When one is asked for.
  {
    const w = world(), G = w.G; G.place(0, 'sv08'); w.run(19 * 60);
    assert.equal(w.st().comm, null, 'no clerk, the shop has traded under COMM_OPEN: nobody asks');
    const c = w.until(); assert.ok(c, 'COMM_OPEN passed: a request'); assert.equal(w.st().shopT, G.COMM_OPEN, 'asked the moment the shop had traded COMM_OPEN seconds');
    const card = PTCG_DATA.sv08.cards.find(x => x.n === c.n);
    assert.ok(c.set === 'sv08' && G.BUY_R.includes(card.r) && c.kind === card.r && c.r === card.r && c.name === card.name, 'one hit card of the set on the shelf');
    const cap = G.commCap(); assert.ok(c.price === S.cardPrice('sv08', c.n, c.r) && c.price >= Math.max(G.COMM_MIN, cap * G.COMM_FLOOR) - 1e-9 && c.price <= cap + 1e-9, `market price $${c.price} inside $${G.COMM_MIN}…$${cap}`);
    assert.equal(c.reward, Math.round(c.price * G.COMM_PAY * 100) / 100, 'the reward is the market price × COMM_PAY');
    assert.equal(G.commLeft(), G.COMM_LEN, 'COMM_LEN of shop time to serve it');
    const keyOf = JSON.stringify(c); w.run(300); assert.equal(JSON.stringify(w.st().comm), keyOf, 'at most one, and it is the same one until it ends');

    const k = world(); k.st().up.clerk = 1; k.G.place(0, 'sv08'); k.run(k.G.COMM_GAP - 10);
    assert.equal(k.st().comm, null, 'a clerk but not yet COMM_GAP of shop time since the shop opened');
    k.run(20); assert.ok(k.st().comm, 'with a clerk the first request comes after COMM_GAP, not after COMM_OPEN');

    const n = world(); Object.assign(n.st(), { cash: 1e6, week: 2, shopT: 1250 }); n.run(60);
    assert.equal(n.st().comm, null, 'COMM_OPEN passed but no shelf holds a set: nothing to ask for'); n.G.place(2, 'sv10'); n.run(20); assert.equal(n.st().comm?.set, 'sv10', 'the set on the shelf is the one asked for');

    const off = shop(5, { commissions: false }); off.run(900); assert.equal(off.st().comm, null, 'commissions: false switches them off');
  }

  // 2. Serving it: exactly one copy out, exactly the reward in, nothing else touched.
  {
    const w = shop(7), G = w.G, st = w.st; w.until(); const c = { ...st().comm };
    assert.equal(G.deliverCommission(), false, 'no copy in the binder: nothing happens');
    assert.equal(st().comm.n, c.n);
    const key = G.commKey(c);
    st().shown.push({ key, set: c.set, n: c.n, name: c.name, r: c.r, kind: c.kind, price: c.price, pct: 1.1 }); assert.equal(G.deliverCommission(), false, 'a copy in the case is not in the binder');
    st().shown.length = 0; st().gallery[1] = { key, set: c.set, n: c.n, name: c.name, r: c.r, kind: c.kind, price: c.price }; assert.equal(G.deliverCommission(), false, 'nor is one in the 收藏室');
    st().gallery[1] = null; assert.ok(st().comm, 'refusals leave the request open');
    give(G, c, 2); const sold = st().earned.singles, customers = st().customers;
    w.T += 10e3; G.tick(true); assert.equal(G.deliverCommission(), false, 'packs are being revealed: the binder holds cards not flipped yet'); assert.equal(st().singles[key].count, 2);
    G.tick(); const after = st().cash, now = st().shopT; // the shop has no stock: the ticks sell nothing, and no bill falls inside this stretch
    assert.ok(G.deliverCommission(), 'served');
    assert.equal(st().singles[key].count, 1, 'exactly one copy left the binder');
    assert.equal(st().cash, after + c.reward, 'exactly the reward'); assert.equal(st().earned.singles - sold, c.reward, 'booked as card sales');
    assert.equal(st().customers, customers, 'not a walk-in'); assert.equal(st().comm, null); assert.equal(st().commAt, now, 'the cooldown starts when it was served'); assert.equal(st().commPaid, c.reward, 'the ledger the top bar reads 「交付」 from');
    assert.ok(st().log[0].text.includes(c.name) && st().log[0].amt === c.reward, 'one line in 店内动态');
    assert.equal(G.deliverCommission(), false, 'nothing open: nothing to serve');
    w.run(G.COMM_GAP - 20); assert.equal(st().comm, null, 'the next one waits COMM_GAP'); w.run(30);
    const d = st().comm; assert.ok(d, 'and then comes'); const dk = give(G, d, 1); assert.ok(G.deliverCommission()); assert.ok(!(dk in st().singles), 'the last copy takes the pocket with it');
    // its binder copy is put aside: seekers (cheapest card first, the set's whole binder on offer) never take the last copy while it is open
    const e = (w.run(G.COMM_GAP + 10), st().comm); assert.ok(e, 'a third request'); const ek = give(G, e, 1);
    Object.assign(st(), { casePct: 0.5 }); w.run(240); assert.equal(st().singles[ek]?.count, 1, 'the one copy waits for the request, however cheap the binder');
  }

  // 3. Lapsing and 不接 cost nothing, and each restarts the cooldown from where it ended.
  {
    const w = shop(11), G = w.G, st = w.st; w.until(); const c = st().comm, cash = st().cash, binder = JSON.stringify(st().singles);
    w.run(G.COMM_LEN - 10); assert.equal(st().comm?.n, c.n, 'still open just before its deadline'); w.run(20);
    assert.equal(st().comm, null, 'gone at the deadline'); assert.equal(st().commAt, c.due, 'the cooldown counts from the deadline, not from the tick that saw it');
    assert.equal(st().cash, cash, 'a lapsed request costs nothing'); assert.equal(JSON.stringify(st().singles), binder);
    w.run(G.COMM_GAP - 40); assert.equal(st().comm, null, 'COMM_GAP after the deadline'); w.run(40); assert.ok(st().comm, 'then the next');
    const now = st().shopT; assert.ok(G.dismissCommission(), '不接'); assert.equal(st().comm, null); assert.equal(st().commAt, now); assert.equal(st().cash, cash);
    assert.equal(G.dismissCommission(), false, 'nothing left to turn down');
    w.run(G.COMM_GAP - 20); assert.equal(st().comm, null, 'turned down: the cooldown restarts'); w.run(30); assert.ok(st().comm);
  }

  // 4. What is asked for: only the shelved sets, only hits inside the price band, and the same thing for the same shop at the same time (the draw owns its random numbers).
  {
    for (const [rev, lo, hi] of [[0, 2, 5], [1e5, 8, 40]]) {
      const w = shop(3, undefined, ['sv10']); w.st().earned.sealed = rev; const seen = new Set();
      for (let i = 0; i < 24; i++) { const c = w.until(); assert.ok(c, `request ${i}`); seen.add(c.n);
        assert.equal(c.set, 'sv10'); assert.ok(c.price >= lo - 1e-9 && c.price <= hi + 1e-9 && PTCG_DATA.sv10.cards.find(x => x.n === c.n && x.r === c.kind), `${c.name} $${c.price} for $${lo}–$${hi}`);
        assert.ok(w.G.dismissCommission()); w.run(w.G.COMM_GAP); }
      assert.ok(seen.size >= 6, `${seen.size} different cards in 24 requests at revenue $${rev}`);
    }
    const a = shop(1), b = shop(2); assert.equal(JSON.stringify(a.until()), JSON.stringify(b.until()), 'the same shop at the same time asks the same, whatever the walk-in seed');
  }

  // 5. The walk-in stream, the till and the binder are exactly what they were without it, for an hour that never serves one.
  {
    const hour = extra => { const w = shop(9, extra, ['sv08', 'sv10']); Object.assign(w.st().up, { clerk: 1 }); w.st().auto = { sv08: true, sv10: true }; w.st().shopT = 0; w.st().week = 1; w.run(3600);
      const s = w.st(); return { w, key: JSON.stringify([s.cash, s.earned, s.cust, s.customers, s.singles, s.stock, s.shelves, s.recent.length, s.intake, s.lost, s.billsPaid]) }; };
    const on = hour(), off = hour({ commissions: false });
    assert.equal(on.key, off.key, 'same cash, sales, binder and shelves with commissions on or off'); assert.ok(on.w.st().commAt > 0 || on.w.st().comm, 'and it did ask for cards meanwhile'); assert.equal(off.w.st().commAt, 0);
  }

  // 6. Saves: old ones have none; a request survives a reload; damaged ones become none without touching the rest; deadline and cooldown are bounded.
  {
    const mem = {}, env = w => ({ now: () => w.T, random: S.rng(2), storage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } });
    mem[KEY] = JSON.stringify({ cash: 10, singles: {} }); const o = { T: NOW }, Old = createGame(env(o));
    assert.deepEqual([Old.state.comm, Old.state.commAt, Old.state.commPaid], [null, 0, 0], 'a save from before: nobody asking, cooldown 0, nothing paid');
    for (const k of Object.keys(mem)) delete mem[k];
    const w = { T: NOW }, G = createGame(env(w)); Object.assign(G.state, { cash: 123456, week: 2, shopT: 1250 }); G.place(0, 'sv08');
    for (let i = 0; i < 400 && !G.state.comm; i++) { w.T += 10e3; G.tick(); } assert.ok(G.state.comm);
    const good = JSON.parse(mem[KEY]), R = createGame(env({ T: w.T }));
    assert.deepEqual([R.state.comm, R.state.commAt], [G.state.comm, G.state.commAt], 'a request survives a reload'); assert.equal(R.state.cash, good.cash);
    const real = good.comm, cheap = PTCG_DATA.sv08.cards.find(x => x.r === 'C'), load = comm => { mem[KEY] = JSON.stringify({ ...good, comm }); return createGame(env({ T: w.T })); };
    const bad = { 'unknown set': { ...real, set: 'nope' }, 'prototype set': { ...real, set: '__proto__' }, 'unknown card': { ...real, n: 'zzz' }, 'a common': { ...real, n: cheap.n, r: 'C', kind: 'C' }, 'kind not the rarity': { ...real, kind: 'REV' },
      'no price': { ...real, price: null }, 'text price': { ...real, price: '5' }, 'negative price': { ...real, price: -1 }, 'no reward': { ...real, reward: 0 }, 'a reward above COMM_PAY × price': { ...real, reward: real.price * 5 },
      'no deadline': { ...real, due: null }, 'text deadline': { ...real, due: 'soon' }, 'a string': 'x', 'a number': 5, 'a list': [], 'half of one': { set: real.set, n: real.n } };
    for (const [what, comm] of Object.entries(bad)) { const L = load(comm); assert.equal(L.state.comm, null, `${what}: no request`); assert.equal(L.state.cash, good.cash, `${what}: the rest of the save loads`); }
    assert.equal(load(null).state.comm, null);
    assert.equal(load({ ...real, due: 1e12 }).state.comm.due, good.shopT + G.COMM_LEN, 'a deadline cannot lie beyond a fresh request');
    assert.equal(load({ ...real, name: 'old name' }).state.comm.name, PTCG_DATA.sv08.cards.find(x => x.n === real.n).name, 'its name comes from the card data');
    for (const [commAt, want] of [[1e9, good.shopT], [-5, 0], ['x', 0], [null, 0], [100, 100]]) { mem[KEY] = JSON.stringify({ ...good, commAt }); assert.equal(createGame(env({ T: w.T })).state.commAt, want, `commAt ${commAt}`); }
    for (const [commPaid, want] of [[12.5, 12.5], [-3, 0], ['x', 0], [null, 0]]) { mem[KEY] = JSON.stringify({ ...good, commPaid }); assert.equal(createGame(env({ T: w.T })).state.commPaid, want, `commPaid ${commPaid}`); }
  }

  // 7. A new shop starts clean, 开分店 and 破产 alike.
  {
    const w = shop(13), G = w.G, st = w.st; w.until(); assert.ok(st().comm); st().commAt = 77;
    st().commPaid = 9; G.bankrupt(); assert.deepEqual([st().comm, st().commAt, st().commPaid], [null, 0, 0], '破产 clears it, the cooldown and what it paid');
    const v = shop(14), H = v.G; v.until(); assert.ok(v.st().comm); v.st().commAt = 77; Object.assign(v.st(), { owe: 0, loan: 0, debt: 0, overdue: null });
    assert.ok(H.branch(), '开分店'); assert.deepEqual([v.st().comm, v.st().commAt, v.st().shopT], [null, 0, 0], 'a new shop: nobody asking, cooldown 0, the clock at zero');
  }
  console.log('ok 找卡委托: asked after COMM_GAP once there is a clerk or COMM_OPEN of shop time, only for a shelved set inside the price band; serving it moves one copy and pays the reward; lapse and 不接 are free; old and damaged saves load; new shops clean; the walk-in stream untouched');
}
