// Balance harness: plays the real src/game.js with a scripted player on a fake clock and prints the growth curve.
// Run: node scripts/autoplay.mjs [hours=3] [openShare=0.15] — openShare = fraction of shelf stock the player opens instead of leaving for customers.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

export function boot(seed = 1) {
  let T = 1_700_000_000_000, s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const M = Object.create(Math); M.random = rnd;
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} }, Date: { now: () => T }, Math: M, setTimeout, console };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  for (const f of readdirSync('data').filter(f => f.endsWith('.js'))) vm.runInContext(readFileSync('data/' + f, 'utf8'), ctx);
  for (const f of ['src/sets.js', 'src/sim.js', 'src/game.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  return { G: ctx.window.PTCG_GAME, S: ctx.window.PTCG_SIM, SETS: ctx.window.PTCG_SETS, advance: sec => { T += sec * 1000; }, now: () => T };
}

// One "visit" every `step` seconds: restock the best-margin unlocked set, open some packs, sell hits above a price as trophies/singles, buy the cheapest upgrade.
export function play({ hours = 3, openShare = 0.15, step = 20, seed = 1, auto = false, log = 600 } = {}) {
  const { G, SETS, advance } = boot(seed), st = G.state, rows = []; let spent = 0;
  for (let t = 0; t <= hours * 3600; t += step) {
    advance(step); G.tick();
    let best = null; for (const k of Object.keys(G.UPGRADES)) { const c = G.upgradeCost(k); if (c != null && (!best || c < best[1])) best = [k, c]; }
    if (best && st.cash >= best[1]) { spent += best[1]; G.upgrade(best[0]); best = null; }
    const hold = best && st.cash > best[1] * 0.4 ? best[1] : 0; // saving for the next upgrade: stop pouring cash into stock and packs
    if (!auto || !G.clerk || !G.clerk()) { // no clerk: the player restocks by hand each visit, priciest set they can afford first
      for (const set of [...SETS].reverse()) if (G.unlocked(set.id)) G.buy(set.id, Math.min(G.capacity(), Math.floor(Math.max(0, st.cash - hold) / G.wholesale(set.id))));
    }
    for (const set of SETS) { // open a share of the stock, only when the shelf is deep enough that customers still have packs
      const n = Math.floor((st.stock[set.id] || 0) * openShare); if (n > 0 && !hold) G.open(set.id, n);
    }
    G.sellBulk();
    for (const [k, c] of Object.entries(st.singles)) if (c.price < 25) G.sell(k); // hits above $25 go to the case
    for (const [k, c] of Object.entries(st.singles)) G.list(k);
    if (G.buyStaff) G.buyStaff();
    if (t % log === 0) rows.push({ min: t / 60, cash: Math.round(st.cash), net: Math.round(st.cash + spent + Object.entries(st.stock).reduce((a, [i, n]) => a + n * G.wholesale(i), 0)), rate: +(G.rate() * 60).toFixed(1), up: Object.values(st.up).reduce((a, b) => a + b, 0), packs: Object.values(st.opened).reduce((a, b) => a + b, 0), dex: G.dexCount ? G.dexCount() : '-', lost: st.lost });
  }
  return rows;
}

if (process.argv[1].endsWith('autoplay.mjs')) {
  const [hours = 3, openShare = 0.15] = process.argv.slice(2).map(Number);
  console.table(play({ hours, openShare, log: 1800 }));
}
