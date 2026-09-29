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
  const cash0 = st().cash; assert.ok(G.upgrade('racks')); assert.equal(st().cash, cash0 - G.UPGRADES.racks.costs[0]);
  assert.equal(G.shelves().length, G.RACK_BASE + 1); assert.ok(G.upgrade('depth')); assert.equal(G.depth(), G.DEPTH_BASE + G.DEPTH_STEP);
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

  // 5. Trophy: bounded and returned to stock. It changes who comes, not how many.
  st().singles.b = { ...hit, price: 1e7, count: 1 }; G.setTrophy('b');
  assert.ok(G.trophyBonus() < 0.5, 'trophy bonus is bounded');
  const rate0 = G.rate(); G.clearTrophy(); assert.equal(G.rate(), rate0, 'trophy does not change walk-in rate'); assert.equal(st().singles.b.count, 1);

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
    const before = JSON.stringify([st().singles, st().shown, st().trophy, st().dex, st().pulled]);
    assert.ok(miss.every((c, i) => G.BUY_R.includes(c.r) && (!i || c.price >= miss[i - 1].price)), 'only hits are for sale, cheapest first');
    assert.ok(G.collect('sv08'));
    assert.equal(first.price, S.cardPrice('sv08', first.n, first.r)); assert.ok(Math.abs(cash0 - st().cash - first.price) < 1e-9, 'a card costs its market price');
    assert.equal(G.dexCount('sv08'), n0 + 1);
    assert.ok(G.collect('sv08', true)); assert.equal(G.missing('sv08').length, 0); assert.equal(G.collect('sv08'), false, 'nothing left to buy');
    assert.equal(JSON.stringify([st().singles, st().shown, st().trophy, st().dex, st().pulled]), before, 'bought cards never become sellable (no buy-at-market, list-at-160% pump) and are not pulls');
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
  assert.deepEqual(A.check(G), [], 'a fresh shop has earned nothing');

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
  const zard = PTCG_DATA['sv03.5'].cards.find(c => c.name.startsWith('Charizard')); assert.ok(!st().ach.charizard);
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
  G.list(hits[0]); G.setTrophy(hits[1] ?? hits[0]);
  const cards = () => Object.values(st().singles).reduce((a, c) => a + c.count, 0) + st().shown.length + (st().trophy ? 1 : 0);
  const n0 = cards(), L0 = G.luck(), ach0 = { ...st().ach }, fame = G.fameFor();
  assert.ok(G.branch());
  const L1 = G.luck();
  assert.deepEqual([L1.packs, L1.value, L1.live, L1.expected, L1.pct], [L0.packs, L0.value, L0.live, L0.expected, L0.pct], '欧气 record unchanged by a branch');
  assert.equal(cards(), n0, 'every card comes along'); assert.equal(st().shown.length + (st().trophy ? 1 : 0), 0, 'the case is emptied into the binder');
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
  assert.ok(opener[3].net < shop[3].net, 'opening packs is a fun expense, not a money machine, even when hits are sold at +20%');
  const lucky = play({ hours: 3, openShare: 0.05, pct: 0.92, cardPct: 1.2, luck: 'max', log: 3600, ...pay });
  assert.ok(lucky[3].net < shop[3].net, `still a fun expense with 手气 maxed from the start ($${lucky[3].net} vs $${shop[3].net})`);
  console.log(`ok growth: net after 1h/3h = $${shop[1].net}/$${shop[3].net}; the same shop that opens 5% of its packs: $${opener[3].net}`);
  // Long game: a player who puts 2% of revenue into master sets has a next goal for hours, and it pays for itself.
  const ach = [], plain = play({ hours: 20, openShare: 0, pct: 1, log: 3600, ...pay }), chase = play({ hours: 20, openShare: 0, pct: 1, masterShare: 0.02, log: 3600, ...pay }); // 2% of the scaled revenue ≈ the dollars 10% was before the ×6 volume: card prices are market data and were not scaled
  const masters = h => chase[h].dex.split('/').filter(x => x === '★').length;
  assert.ok(masters(3) >= 1, `first master set within 3h (${chase[3].dex})`);
  assert.ok(masters(6) < 4 && masters(10) > masters(3), `still chasing after 6h, and progress keeps coming (${chase[6].dex} → ${chase[10].dex})`);
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
  console.log(`ok 债务: ${w - 1} installments, $1,000 → $1,210 in 2 weeks, grace → loan → bankruptcy, 8h closed = 1 week; manager ${mgr.paid} bills in 4h, idler ${idle.paid} in 48h, newbie ${noob.paid} in 2h`);
}
// 剧情: every scene has lines, every line renders to text (debt lines with and without a bill; milestones always get their card/set); debt beats degrade to nothing
// on a game without the economy, map each event to its scene once per week, and a paid week after the first plays the short line.
{
  for (const [id, scenes] of Object.entries(ST.SCENES)) for (const sc of scenes) {
    assert.ok(sc.lines.length, `story ${id}: empty scene`);
    for (const l of sc.lines) for (const c of [...(['bigpull', 'unlock'].includes(id) ? [] : [{}]), { bill: '$12.00', week: 2, card: 'X', price: '$1', set: 'Y', bills: 25, fame: 6, debt: '$60,000', shop: 2 }]) {
      const t = typeof l.t === 'string' ? l.t : l.t(c); assert.ok(t && !t.includes('undefined'), `story ${id}: "${t}"`);
    }
  }
  const g = createGame({ now: () => 0, random: S.rng(1), storage: { getItem: () => null, setItem() {} } });
  if (!g.nextBill) assert.equal(D.bill(g), null); // no economy yet: nothing to read
  assert.equal(D.debtBeat(undefined, g), null); assert.equal(D.debtBeat({ open: [] }, g), null);
  const fake = Object.assign(Object.create(g), { nextBill: () => ({ week: 3, amount: 120, dueAt: 9 }) });
  const due = D.debtBeat({ type: 'bill_due' }, fake);
  assert.deepEqual([due.kind, due.key, due.week, due.amount], ['due', 'due:0.0:3', 3, 120]);
  assert.equal(ST.sceneFor(due, {}), 'due'); assert.equal(ST.sceneFor(due, { [due.key]: 1 }), null);
  const paid = w => D.debtBeat({ type: 'bill_paid', week: w }, fake);
  assert.equal(ST.sceneFor(paid(1), {}), 'paid1'); assert.ok(['paid', 'paid2'].includes(ST.sceneFor(paid(2), { paid1: 1 })));
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'bankrupt' }, fake), { bankrupt: 1 }), 'bankrupt'); // a bankruptcy always plays
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'nope' }, fake), {}), null);
  assert.equal(ST.sceneFor(D.debtBeat({ type: 'story', id: 'loan' }, fake), {}), 'loan');
  for (const k of ['due', 'paid1', 'paid', 'paid2', 'last', 'missed', 'loan', 'bankrupt', 'debt_cleared', 'branch']) assert.ok(ST.SCENES[k], `no scene ${k}`);
  // The end of a run, played as the ui plays it (a beat's key marks it seen): the bill before the last says so; the bill that
  // clears the debt emits due → paid → 还清 in one tick, and only 还清 speaks; the next shop starts at week 1 again and still
  // gets its weekly beats and, later, its own 还清.
  let T = 1_700_000_000_000; const E = createGame({ now: () => T, random: S.rng(3), storage: { getItem: () => null, setItem() {} } }), seen = {}, played = [];
  E.on(ev => { const b = D.debtBeat(ev, E), id = ST.sceneFor(b, seen); if (id) { played.push(id); if (b.key) seen[b.key] = 1; } });
  const week = () => { for (let i = 0; i < E.WEEK; i += 20) { T += 20e3; E.tick(); } };
  const owe = n => { E.state.owe = E.state.debt = [0, 1].reduce((a, i) => a + Math.round(E.BILL0 * (1 + E.DEBT_STEP * E.state.branch.n) * E.BILL_G ** (E.state.week - 1 + i)), 0) - n; };
  E.state.cash = 1e6; E.state.earned.sealed = 1; owe(0);
  week(); assert.deepEqual(played, ['last'], 'the bill before the last one (the till covered it: no 「这周的账」 before it)');
  week(); assert.deepEqual(played, ['last', 'debt_cleared'], 'the clearing bill: no 「下周见」 before 还清');
  assert.ok(E.branch()); assert.equal(played.at(-1), 'branch'); E.state.cash = 1e6;
  played.length = 0; week(); assert.ok(['paid1', 'paid', 'paid2'].includes(played[0]), "shop 2's week 1 is not shop 1's week 1");
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
  console.log(`ok 亲手开出: every card pullable, odds match the simulator, 名气 +${J.HAND_FAME} once per set at the next 开分店, kept through bankruptcy`);
}

// A week the till covers plays one beat (收到), not two: 「这周的账」 only when it could not be paid.
{
  let T = 1_700_000_000_000; const W = createGame({ now: () => T, random: S.rng(8), storage: { getItem: () => null, setItem() {} } }), kinds = [];
  W.on(ev => { const b = D.debtBeat(ev, W); if (b) kinds.push(b.kind); });
  const week = () => { for (let i = 0; i < W.WEEK; i += 20) { T += 20e3; W.tick(); } };
  W.state.cash = 1e5; week(); assert.ok(kinds.includes('paid') && !kinds.includes('due'), `covered week: ${kinds}`);
  kinds.length = 0; W.state.cash = 0; W.state.shelves.length = 0; W.state.stock = { sv08: 5 }; week(); // stock in the back room: no 进货钱 bailout
  assert.deepEqual(kinds.filter(k => k === 'due' || k === 'missed'), ['due', 'missed'], `a short week still says so: ${kinds}`);
  console.log('ok a covered bill is one beat, a missed one still two');
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
  const t0 = performance.now(); S.luckPercentile(big, M); const ms = performance.now() - t0;
  const mid = Object.fromEntries(PTCG_SETS.flatMap(s => [[s.id, 1500], [S.rateKey(s.id, 1.25), 1500]])), t1 = performance.now(); S.luckPercentile(mid, 1e5); const ms2 = performance.now() - t1;
  assert.ok(ms < 100 && ms2 < 400, `luckPercentile took ${ms.toFixed(0)} ms on 88k packs, ${ms2.toFixed(0)} ms on 20 keys × 1500`);
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

// 店员没本钱 (GAMEPLAY.md §12.2): the clerk buys with the cash in the till at his round. A round that cannot fill the shelves is
// recorded (clerkRound, clerkShort) and logged; 现在补货 (clerkNow) is his buying now and does not move his next round. The
// 普通 player on seed 1 falls into it on the third shop (夜市, 2 级店员 bought with the last $10.4k before a round): shelves stay
// empty for hours and the loan snowballs. The same player heeding the two notes (no upgrade that leaves less than a round needs;
// 现在补货 when a round came up short) clears that shop and the next.
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
  const { play } = await import('../scripts/autoplay.mjs'), run = heed => play({ hours: 30, seed: 1, step: 90, openShare: 0.02, pct: 1, reserve: 1, repay: true, branch: 'paid', heed, log: 3600 });
  const [blind, heeds] = [run(false), run(true)];
  assert.ok(blind.G.state.branch.n === 2 && blind.G.state.loan > 20000, `without the notes the 3rd shop is stuck: loan ${blind.G.state.loan | 0}`);
  assert.ok(heeds.G.state.branch.n >= 3 && heeds.debt.borrowed < blind.debt.borrowed / 2, `heeding them clears it: shop ${heeds.G.state.branch.n + 1}, borrowed ${heeds.debt.borrowed | 0}`);
  console.log(`ok 店员没本钱: a short round is recorded and 现在补货 fills it; 普通 seed 1, 30 h: 3rd shop stuck on a $${Math.round(blind.G.state.loan / 1000)}k loan → heeding the notes reaches shop ${heeds.G.state.branch.n + 1}, borrowed $${Math.round(blind.debt.borrowed / 1000)}k → $${Math.round(heeds.debt.borrowed / 1000)}k`);
}
