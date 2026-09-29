// Fairness check: 200k simulated packs per set must land inside TCGplayer's measured 95% CI for every rarity.
// Run: node test/sim.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of readdirSync('data').filter(f => f.endsWith('.js'))) vm.runInContext(readFileSync('data/' + f, 'utf8'), ctx);
for (const f of ['src/sets.js', 'src/sim.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
const { PTCG_SETS, PTCG_SIM: S, PTCG_DATA } = ctx.window;

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
const p = S.luckPercentile({ sv08: 36 }, 0);
assert.equal(p, 0, 'zero value must be the unluckiest');
console.log('ok luck percentile');

// ---------- economy (src/game.js) ----------
{
  let T = 1_700_000_000_000;
  const store = {};
  const gctx = { window: {}, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, Date: { now: () => T }, Math };
  gctx.window.window = gctx.window; vm.createContext(gctx);
  for (const f of readdirSync('data').filter(f => f.endsWith('.js'))) vm.runInContext(readFileSync('data/' + f, 'utf8'), gctx);
  for (const f of ['src/sets.js', 'src/sim.js', 'src/game.js']) vm.runInContext(readFileSync(f, 'utf8'), gctx);
  const G = gctx.window.PTCG_GAME, st = () => G.state;

  // 1. No money pump: even at the best supplier level, opening a pack and selling the hits at the top display-case
  //    price (bulk goes to peers at BUYLIST) returns less than the pack cost.
  const bestWholesale = G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length;
  const topMult = Math.max(...G.CASE_PRICING.map(t => t.mult));
  for (const set of PTCG_SETS) {
    assert.ok(S.packEV(set.id) * topMult < set.packPrice * bestWholesale, `${set.id}: opening packs must stay negative EV`);
  }
  assert.ok(bestWholesale > G.BUYLIST * 0.8, 'supplier discount must not undercut what the sealed sale is worth');
  assert.ok(G.CASE_PRICING.every(t => t.buy > 0 && t.buy <= 1) && G.CASE_PRICING.every((t, i, a) => !i || (t.mult > a[i - 1].mult && t.buy < a[i - 1].buy)),
    'higher case price must mean lower sale chance');
  for (const [k, u] of Object.entries(G.UPGRADES)) assert.ok(u.costs.every((c, i, a) => !i || c > a[i - 1]), `${k} costs must increase`);

  // 2. Shelf capacity and set unlocks.
  assert.equal(G.buy('sv08.5', 1), false, 'locked set cannot be stocked');
  st().cash = 1; assert.equal(G.buy('sv08', 999), false, 'cannot afford it');
  st().cash = 1e6;
  G.buy('sv08', 999);
  assert.equal(st().stock.sv08, G.SHELF_BASE, 'buy clamps to shelf capacity');
  assert.equal(G.buy('sv08', 1), false, 'full shelf');
  const cash0 = st().cash; assert.ok(G.upgrade('shelf')); assert.equal(st().cash, cash0 - G.UPGRADES.shelf.costs[0]);
  assert.equal(G.capacity(), G.SHELF_BASE + 20);
  st().earned.sealed = 400; assert.ok(G.unlocked('sv08.5'));

  // 3. Idle shop: an hour closed sells at most the stock, credits at most what was stocked, and never goes negative.
  G.buy('sv08', 40); const stocked = st().stock.sv08, before = st().cash;
  T += 3600e3; G.tick();
  assert.ok(st().stock.sv08 >= 0 && st().stock.sv08 < stocked, 'customers bought packs while closed');
  assert.ok(st().cash - before <= stocked * 8.47 * 1.15 + 1e-6, 'offline revenue cannot exceed stock value');
  assert.ok(st().offline && st().offline.sales > 0, 'offline report recorded');
  T += 30 * 86400e3; st().stock.sv08 = 5; G.tick();
  assert.ok(st().lost > 0, 'empty shelf turns customers away');
  assert.ok(st().offline.secs <= G.OFFLINE_CAP * 2 + 1, 'offline credit is capped per absence');

  // 4. Display case: slots limit, price tier changes take-home, trophy bonus stays bounded.
  const hit = { set: 'sv08', n: '1', kind: 'SIR', r: 'SIR', name: 'test', price: 100, count: 3 };
  st().singles.a = hit;
  for (let i = 0; i < 10; i++) G.list('a');
  assert.equal(st().shown.length, G.CASE_BASE, 'case slots cap listings');
  G.unlist(0); assert.equal(st().shown.length, G.CASE_BASE - 1);
  assert.ok(!G.list('nope'));
  st().singles.b = { ...hit, price: 1e7, count: 1 }; G.setTrophy('b');
  assert.ok(G.trophyBonus() < 0.5, 'trophy bonus is bounded');
  const rate0 = G.rate(); G.clearTrophy(); assert.ok(G.rate() < rate0 && st().singles.b.count === 1, 'trophy returns to stock');
  console.log('ok economy');
}
