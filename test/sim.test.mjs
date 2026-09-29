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
