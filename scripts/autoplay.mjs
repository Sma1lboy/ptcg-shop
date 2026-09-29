// Balance harness: plays the real src/game.ts with a scripted player on a fake clock and prints the growth curve.
// Run: node scripts/autoplay.mjs [hours=3] [openShare=0.15] [pct=1] — pct = asking price as a share of market.
import { createGame } from '../src/game.ts';
import * as S from '../src/sim.ts';
import { SETS } from '../src/sets.ts';

export function boot(seed = 1) {
  let T = 1_700_000_000_000, s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = createGame({ now: () => T, random: rnd, storage: { getItem: () => null, setItem() {} } });
  return { G, S, SETS, advance: sec => { T += sec * 1000; }, now: () => T };
}

// One "visit" every `step` seconds: buy upgrades first, then stock (kept back for opening or put on the shelf at `pct` of market),
// open `openShare` of the back-room stock, sell cheap singles to peers and put hits in the case at `cardPct`.
export function play({ hours = 3, openShare = 0.15, step = 20, seed = 1, pct = 1.0, cardPct = 1.0, log = 600 } = {}) {
  const { G, SETS, advance } = boot(seed), st = G.state, rows = []; let spent = 0;
  const sold = { opener: 0, seeker: 0, collector: 0, flipper: 0 };
  for (let t = 0; t <= hours * 3600; t += step) {
    advance(step); G.tick();
    G.sellBulk();
    for (const [k, c] of Object.entries(st.singles)) if (c.price < 25) G.sell(k);
    for (const [k] of Object.entries(st.singles)) if (G.list(k)) st.shown[st.shown.length - 1].pct = cardPct;
    let best = null; for (const k of Object.keys(G.UPGRADES)) { const c = G.upgradeCost(k); if (c != null && (!best || c < best[1])) best = [k, c]; }
    if (best && st.cash >= best[1]) { spent += best[1]; G.upgrade(best[0]); best = null; }
    const hold = best && st.cash > best[1] * 0.4 ? best[1] : 0; // saving for the next upgrade: stop pouring cash into stock and packs
    for (const set of [...SETS].reverse()) if (G.unlocked(set.id)) {
      G.setPrice(set.id, pct);
      const clerked = G.lvl('clerk') > 0 && st.auto[set.id];
      if (!clerked) { // by hand: fill the shelf, then whatever is affordable goes to the back room for opening
        const room = G.capacity() - G.shelfQty(set.id), n = Math.min(room, Math.floor(Math.max(0, st.cash - (G.shelfQty(set.id) < 10 ? 0 : hold)) / G.wholesale(set.id)));
        if (n > 0 && G.buy(set.id, n)) G.shelve(set.id, n);
      }
    }
    if (!hold) for (const set of SETS) { const n = Math.floor(G.shelfQty(set.id) * openShare); if (n > 0) { G.unshelve(set.id, n); G.open(set.id, n); } }
    if (t % log === 0) rows.push({ min: t / 60, cash: Math.round(st.cash), net: Math.round(st.cash + spent + SETS.reduce((a, x) => a + (G.shelfQty(x.id) + (st.stock[x.id] || 0)) * G.wholesale(x.id), 0)), perMin: '', up: Object.values(st.up).reduce((a, b) => a + b, 0), packs: Object.values(st.opened).reduce((a, b) => a + b, 0), dex: SETS.map(x => G.dexCount(x.id)).join('/'), sold: st.cust.sold, pricey: st.cust.pricey, none: st.cust.none });
  }
  for (let i = 1; i < rows.length; i++) rows[i].perMin = Math.round((rows[i].net - rows[i - 1].net) / (log / 60));
  return rows;
}

if (process.argv[1].endsWith('autoplay.mjs')) {
  const [hours = 3, openShare = 0.15, pct = 1] = process.argv.slice(2).map(Number);
  console.table(play({ hours, openShare, pct, log: 1800 }));
}
