// Balance harness: plays the real src/game.ts with a scripted player on a fake clock and prints the growth curve.
// Run: node scripts/autoplay.mjs [hours=3] [openShare=0.15] [pct=1] [masterShare=0] [racks] [depth] — pct = asking price as a share of market (a number,
// or per set { sv08: 0.95, … }); masterShare = share of revenue put into finishing 图鉴 master sets (open packs for C/U/R, buy the hits);
// racks / depth = the highest 货架 / 加层 level this player buys (to measure what those upgrades are worth).
import { createGame } from '../src/game.ts';
import * as S from '../src/sim.ts';
import { SETS } from '../src/sets.ts';

export function boot(seed = 1) {
  let T = 1_700_000_000_000, s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = createGame({ now: () => T, random: rnd, storage: { getItem: () => null, setItem() {} } });
  return { G, S, SETS, advance: sec => { T += sec * 1000; }, now: () => T };
}

// One "visit" every `step` seconds: buy the cheapest upgrade (up to `cap` levels; 货架 first while an unlocked set has no shelf) or 技能 first (手气 only if this player opens packs; 看店 never, it never closes), then stock (kept back for opening or put on the shelf at `pct` of market),
// open `openShare` of the back-room stock, sell cheap singles to peers and put hits in the case at `cardPct`.
// off = minutes of every hour the player is away (the shop runs on its own; a clerk, if hired, restocks).
// Shelves: an empty shelf gets the unlocked set with the fewest shelves (pricier sets first), so every set is on sale before any doubles up.
export function play({ hours = 3, openShare = 0.15, step = 20, seed = 1, pct = 1.0, cardPct = 1.0, masterShare = 0, luck, cap = {}, off = 0, log = 600 } = {}) {
  const { G, SETS, advance } = boot(seed), st = G.state, rows = []; let spent = 0, pot = 0, rev = 0;
  const pctOf = id => typeof pct === 'number' ? pct : pct[id] ?? 1;
  const baseLeft = id => G.dexTotal(id) - G.dexCount(id) - G.missing(id).length; // C/U/R still to pull
  const wants = k => k !== 'watch' && (k !== 'luck' || (luck ?? (openShare > 0 || masterShare > 0)));
  if (luck === 'max') st.skills.luck = G.SKILLS.luck.max; // a player who starts with 手气 maxed (balance check)
  const sold = { opener: 0, seeker: 0, collector: 0, flipper: 0 };
  for (let t = 0; t <= hours * 3600; t += step) {
    advance(step); G.tick();
    if (t % 3600 >= (60 - off) * 60) { if (t % log === 0) rows.push(row(t)); continue; }
    G.sellBulk();
    for (const [k, c] of Object.entries(st.singles)) if (c.price < 25) G.sell(k);
    for (const [k] of Object.entries(st.singles)) if (G.list(k)) st.shown[st.shown.length - 1].pct = cardPct;
    let best = null; for (const k of Object.keys(G.UPGRADES)) { const c = G.upgradeCost(k); if (c != null && G.lvl(k) < (cap[k] ?? Infinity) && (!best || c < best[1])) best = [k, c]; }
    for (const k of Object.keys(G.SKILLS)) { const c = G.skillCost(k); if (c != null && wants(k) && G.canLearn(k) && (!best || c < best[1])) best = ['skill:' + k, c]; }
    if (SETS.filter(x => G.unlocked(x.id)).length > G.racks() && G.upgradeCost('racks') != null && G.lvl('racks') < (cap.racks ?? Infinity)) best = ['racks', G.upgradeCost('racks')]; // a set is waiting for a shelf: that comes first
    if (best && st.cash >= best[1]) { spent += best[1]; if (best[0].startsWith('skill:')) G.learn(best[0].slice(6)); else G.upgrade(best[0]); best = null; }
    const leaving = off && (t + step) % 3600 >= (60 - off) * 60; // last visit before going away: fill the shelves, save later (unless a set is waiting for a shelf)
    const hold = best && (!leaving || best[0] === 'racks') && st.cash > best[1] * 0.4 ? best[1] : 0; // saving for the next upgrade: stop pouring cash into stock and packs
    pot += (G.revenue() - rev) * masterShare; rev = G.revenue(); // the master-set budget: a share of what came in since last visit
    const goal = SETS.filter(x => G.unlocked(x.id) && !G.master(x.id)).sort((a, b) => a.packPrice * baseLeft(a.id) - b.packPrice * baseLeft(b.id))[0];
    if (goal && masterShare) { // pull the C/U/R by opening packs, then buy the missing hits cheapest first
      if (baseLeft(goal.id)) { const n = Math.min(10, Math.floor(Math.min(pot, st.cash) / G.wholesale(goal.id))); if (n > 0 && G.buy(goal.id, n)) { pot -= G.wholesale(goal.id) * n; G.open(goal.id, n); } }
      for (let m = G.missing(goal.id)[0]; m && m.price <= Math.min(pot, st.cash) && G.collect(goal.id); m = G.missing(goal.id)[0]) pot -= m.price;
    }
    const ids = SETS.filter(x => G.unlocked(x.id)).map(x => x.id).reverse(), racksOf = id => G.shelves().filter(s => s.id === id).length;
    for (const id of ids) if (!racksOf(id)) { const i = G.shelves().findIndex(s => !s.id || racksOf(s.id) > 1); if (i >= 0) G.place(i, id); } // a newly unlocked set takes a doubled-up shelf
    G.shelves().forEach((s, i) => { if (!s.id && ids.length) G.place(i, ids.reduce((a, b) => (racksOf(b) < racksOf(a) ? b : a))); });
    for (const id of ids) G.setPrice(id, pctOf(id));
    for (const id of ids) if (st.stock[id] > 0) G.shelve(id, st.stock[id]); // leftovers in the back room go out first
    const byHand = ids.filter(id => !(G.lvl('clerk') > 0 && st.auto[id])); // the rest the clerk restocks
    for (let more = true; more;) { // fill the shelves 5 packs a set at a time, so a short budget is spread over every set
      more = false;
      for (const id of byHand) {
        const room = racksOf(id) * G.depth() - G.shelfQty(id), n = Math.min(5, room, Math.floor(Math.max(0, st.cash - (G.shelfQty(id) < 10 ? 0 : hold)) / G.wholesale(id)));
        if (n > 0 && G.buy(id, n)) { G.shelve(id, n); more = true; }
      }
    }
    if (!hold) for (const set of SETS) { const n = Math.floor(G.shelfQty(set.id) * openShare); if (n > 0) { G.unshelve(set.id, n); G.open(set.id, n); } }
    if (t % log === 0) rows.push(row(t));
  }
  function row(t) {
    return { min: t / 60, cash: Math.round(st.cash), net: Math.round(st.cash + spent + SETS.reduce((a, x) => a + (G.shelfQty(x.id) + (st.stock[x.id] || 0)) * G.wholesale(x.id), 0)), perMin: '', rev: Math.round(G.revenue()), revMin: '', up: Object.values(st.up).reduce((a, b) => a + b, 0) + Object.values(st.skills).reduce((a, b) => a + b, 0), packs: Object.values(st.opened).reduce((a, b) => a + b, 0), dex: SETS.map(x => G.master(x.id) ? '★' : Math.round(G.dexCount(x.id) / G.dexTotal(x.id) * 100)).join('/'), rate: +(G.rate() * 60).toFixed(1), sold: st.cust.sold, pricey: st.cust.pricey, none: st.cust.none };
  }
  for (let i = 1; i < rows.length; i++) { rows[i].perMin = Math.round((rows[i].net - rows[i - 1].net) / (log / 60)); rows[i].revMin = Math.round((rows[i].rev - rows[i - 1].rev) / (log / 60)); }
  return rows;
}

if (process.argv[1].endsWith('autoplay.mjs')) {
  const [hours = 3, openShare = 0.15, pct = 1, masterShare = 0, racks = Infinity, depth = Infinity] = process.argv.slice(2).map(Number);
  console.table(play({ hours, openShare, pct, masterShare, cap: { racks, depth }, log: 1800 }));
}
