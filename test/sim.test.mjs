// Fairness check: 200k simulated packs per set must land inside TCGplayer's measured 95% CI for every rarity.
// Run: node test/sim.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SETS as PTCG_SETS, DATA as PTCG_DATA } from '../src/sets.ts';
import * as S from '../src/sim.ts';
import { createGame } from '../src/game.ts';

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
  const ev = S.packEV(set.id), mean = value / N;
  assert.ok(Math.abs(mean - ev) / ev < 0.05, `${set.id} EV ${ev.toFixed(2)} vs sim mean ${mean.toFixed(2)}`);
  console.log(`ok ${set.id.padEnd(7)} EV $${ev.toFixed(2)} / pack $${set.packPrice} (${(ev / set.packPrice * 100).toFixed(0)}%)`);
}
// 手气 (game bonus) must leave the measured odds alone: with no bonus, openPack is byte-identical to the pre-手气 code
// (hash recorded from that code, 2000 packs per set, seed 42), and the default argument is the same as m = 1.
{
  for (const m of [undefined, 1]) {
    const h = createHash('sha256');
    for (const set of PTCG_SETS) { const r = S.rng(42); for (let i = 0; i < 2000; i++) for (const c of S.openPack(set.id, r, m)) h.update(set.id + c.n + c.kind + '|'); }
    assert.equal(h.digest('hex'), '321b156f4309598b9545f432c25e2ae6fa16e292adf9bb8643c5a5e6c7df7254', `no-bonus packs changed (m=${m})`);
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
  //    with 手气 maxed too.
  const bestWholesale = G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length, maxM = S.roundM(1 + G.SKILLS.luck.step * G.SKILLS.luck.max);
  for (const set of PTCG_SETS) assert.ok(S.packEV(S.rateKey(set.id, maxM)) < set.packPrice * bestWholesale, `${set.id}: opening packs must stay negative EV even at 手气 ×${maxM}`);
  assert.ok(bestWholesale > G.BUYLIST * 0.8, 'supplier discount must not undercut what the sealed sale is worth');
  for (const [k, u] of Object.entries(G.UPGRADES)) assert.ok(u.costs.every((c, i, a) => !i || c > a[i - 1]), `${k} costs must increase`);
  assert.ok(G.DEX_TIERS.every(([a, b], i, t) => !i || (a > t[i - 1][0] && b >= t[i - 1][1])) && G.DEX_TIERS.at(-1)[0] === 1, 'dex tiers ascend and end at 100%');

  // 2. Stock -> shelf: buying fills the back room only, nothing sells until it is on the shelf.
  assert.equal(G.buy('sv08.5', 1), false, 'locked set cannot be stocked');
  st().cash = 1; assert.equal(G.buy('sv08', 999), false, 'cannot afford it');
  st().cash = 1e6; G.buy('sv08', 999);
  assert.equal(st().stock.sv08, G.WAREHOUSE, 'buy clamps to the warehouse');
  assert.equal(G.buy('sv08', 1), false, 'full warehouse');
  T += 3600e3; G.tick();
  assert.equal(st().earned.sealed, 0, 'unshelved packs never sell');
  assert.equal(st().stock.sv08, G.WAREHOUSE);
  G.shelve('sv08', 999); assert.equal(G.shelfQty('sv08'), G.SHELF_BASE, 'shelf capacity');
  assert.equal(st().stock.sv08, G.WAREHOUSE - G.SHELF_BASE);
  G.unshelve('sv08', 5); assert.equal(G.shelfQty('sv08'), G.SHELF_BASE - 5);
  G.setPrice('sv08', 9); assert.equal(G.pctOf('sv08'), G.MAX_PCT, 'price clamps'); G.setPrice('sv08', 0); assert.equal(G.pctOf('sv08'), G.MIN_PCT);
  G.setPrice('sv08', 1.02); assert.ok(Math.abs(G.pctOf('sv08') - 1) < 1e-9 && Math.abs(G.ask('sv08') - G.sealedPrice('sv08')) < 1e-9, 'price snaps to steps');
  const cash0 = st().cash; assert.ok(G.upgrade('shelf')); assert.equal(st().cash, cash0 - G.UPGRADES.shelf.costs[0]);
  assert.equal(G.capacity(), G.SHELF_BASE + 20);
  st().earned.sealed = 400; assert.ok(G.unlocked('sv08.5'));

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

  // 6. Old saves: packs that used to be "on sale" land on the shelf.
  store['ptcg-shop-v1'] = JSON.stringify({ cash: 10, stock: { sv08: 7 }, singles: {} });
  const G2 = createGame(env); // a page reload: a second game over the same storage
  assert.equal(G2.shelfQty('sv08'), 7); assert.equal(G2.state.stock.sv08 || 0, 0);
  delete store['ptcg-shop-v1'];

  // 7. Soft-lock guard, 图鉴 and the clerk.
  G.reset(); st().cash = 0; T += 1e3; G.tick();
  assert.equal(st().cash, G.BAILOUT, 'broke shop with nothing to sell gets a one-off top-up'); T += 1e3; G.tick(); assert.equal(st().cash, G.BAILOUT);
  G.reset(); st().cash = 1e6; G.buy('sv08', 1); const [pack] = G.open('sv08', 1);
  assert.equal(G.dexCount('sv08'), new Set(pack.filter(c => c.r !== 'E').map(c => c.n)).size, 'opening records new card numbers');
  const r0 = G.rate(); for (let i = 0; i < 400; i++) { G.buy('sv08', 10); G.open('sv08', 10); }
  assert.ok(G.dexBonus() > 0 && G.rate() > r0, 'collecting raises word-of-mouth'); assert.ok(G.dexCount('sv08') > G.dexTotal('sv08') * 0.75);
  G.reset(); st().cash = 1e6; st().earned.sealed = 1e6; G.buy('sv08', 1); G.shelve('sv08', 1); G.upgrade('clerk');
  assert.ok(st().auto.sv08, 'first clerk level turns auto-restock on for sets already in use');
  T += 3 * 3600e3; G.tick(); assert.ok(G.shelfQty('sv08') > 0 || st().earned.sealed > 1e6, 'clerk keeps the shelf stocked while the shop is closed');
  assert.ok(st().offline.sales > 20, `a clerk lets a closed shop keep selling past one shelf (${st().offline.sales} sales)`);

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
    const PCTS = [0.85, 0.9, 1, 1.1];
    const profitAt = (id, pct) => {
      G.reset(); st().cash = 1e9; st().earned.sealed = 1e6; st().up.shelf = 4; T += 1;
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
  console.log('ok economy');
}

// ---------- growth curve (scripts/autoplay.mjs plays the real game.ts on a fake clock) ----------
{
  const { play } = await import('../scripts/autoplay.mjs');
  const shop = play({ hours: 3, openShare: 0, pct: 0.92, log: 3600 }), opener = play({ hours: 3, openShare: 0.05, pct: 0.92, cardPct: 1.2, log: 3600 });
  assert.ok(shop[1].net > 500, `an hour of trading should more than triple the $150 start (net ${shop[1].net})`);
  assert.ok(shop[3].net > shop[1].net * 2, 'income keeps growing, upgrades pay off');
  assert.ok(shop[3].up >= 5, `several upgrades bought within 3h (${shop[3].up})`);
  assert.ok(opener[3].net < shop[3].net, 'opening packs is a fun expense, not a money machine, even when hits are sold at +20%');
  const lucky = play({ hours: 3, openShare: 0.05, pct: 0.92, cardPct: 1.2, luck: 'max', log: 3600 });
  assert.ok(lucky[3].net < shop[3].net, `still a fun expense with 手气 maxed from the start ($${lucky[3].net} vs $${shop[3].net})`);
  console.log(`ok growth: net after 1h/3h = $${shop[1].net}/$${shop[3].net}; the same shop that opens 5% of its packs: $${opener[3].net}`);
  // Long game: a player who puts 10% of revenue into master sets has a next goal for hours, and it pays for itself.
  const plain = play({ hours: 10, openShare: 0, pct: 1, log: 3600 }), chase = play({ hours: 10, openShare: 0, pct: 1, masterShare: 0.1, log: 3600 });
  const masters = h => chase[h].dex.split('/').filter(x => x === '★').length;
  assert.ok(masters(3) >= 1, `first master set within 3h (${chase[3].dex})`);
  assert.ok(masters(6) < 4 && masters(10) > masters(3), `still chasing after 6h, and progress keeps coming (${chase[6].dex} → ${chase[10].dex})`);
  assert.ok(chase[10].net > plain[10].net, `the binder pays for itself by hour 10 (net $${chase[10].net} vs $${plain[10].net} for a shop that never collects)`);
  console.log(`ok long game: master sets at 3h/6h/10h = ${masters(3)}/${masters(6)}/${masters(10)}; walk-ins ${plain[10].rate} → ${chase[10].rate}/min; net at 10h $${chase[10].net} vs $${plain[10].net}`);
}
