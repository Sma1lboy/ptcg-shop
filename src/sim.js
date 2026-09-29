// Pack simulator: pure functions over PTCG_DATA + PTCG_SETS. Runs in the browser and in node (test/).
(function (g) {
  const RANK = { C: 0, U: 1, R: 2, E: -1, REV: 2, ACE: 3, RR: 3, PB: 3, UR: 4, IR: 4, MB: 5, SIR: 6, HR: 6 };
  const HITS = ['ACE', 'RR', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR'];
  const ENERGY = ['草', '火', '水', '雷', '超', '斗', '恶', '钢'];

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const pools = {};
  function poolsFor(setId) {
    if (pools[setId]) return pools[setId];
    const data = g.PTCG_DATA[setId], by = {};
    for (const c of data.cards) (by[c.r] ||= []).push(c);
    by.REV = [...(by.C || []), ...(by.U || []), ...(by.R || [])];
    by.PB = data.cards.filter(c => c.p.pb != null);
    by.MB = data.cards.filter(c => c.p.mb != null);
    return (pools[setId] = by);
  }

  // Picks one outcome from {key: percent}; remainder falls to `base`.
  function roll(r, table, base) {
    let x = r() * 100;
    for (const k in table) { if ((x -= table[k]) < 0) return k; }
    return base;
  }

  function priceOf(card, kind) {
    const p = card.p;
    if (kind === 'REV') return p.r ?? p.n ?? 0;
    if (kind === 'PB') return p.pb ?? 0;
    if (kind === 'MB') return p.mb ?? 0;
    if (kind === 'C' || kind === 'U') return p.n ?? p.r ?? 0;
    return p.h ?? p.n ?? 0;
  }

  // Current market price of one pulled card, looked up by (set, number, kind). Energy is a game constant. null = card no longer in the data.
  function cardPrice(setId, n, kind) {
    if (kind === 'E') return 0.01;
    if (kind === 'FE') return 0.5;
    const card = g.PTCG_DATA[setId]?.cards.find(c => c.n === n);
    return card ? priceOf(card, kind) : null;
  }

  function slotTables(set) {
    const t = set.rates, pick = keys => Object.fromEntries(keys.filter(k => t[k]).map(k => [k, t[k]]));
    return { rare: pick(['UR', 'RR']), rev1: pick(['ACE', 'PB']), rev2: pick(['HR', 'SIR', 'IR', 'MB']) };
  }

  function draw(r, setId, kind) {
    const pool = poolsFor(setId)[kind];
    const card = pool[Math.floor(r() * pool.length)];
    return { set: setId, n: card.n, name: card.name, r: card.r, kind, price: priceOf(card, kind) };
  }

  // Returns the 11 cards of one booster (10 + basic Energy) in the order they sit in the pack (best last).
  function openPack(setId, r) {
    const set = g.PTCG_SETS.find(s => s.id === setId), t = slotTables(set), out = [];
    for (let i = 0; i < 4; i++) out.push(draw(r, setId, 'C'));
    for (let i = 0; i < 3; i++) out.push(draw(r, setId, 'U'));
    out.push(draw(r, setId, roll(r, t.rev1, 'REV')));
    out.push(draw(r, setId, roll(r, t.rev2, 'REV')));
    out.push(draw(r, setId, roll(r, t.rare, 'R')));
    const foil = set.rates.FE && r() * 100 < set.rates.FE;
    out.splice(7, 0, { set: setId, n: 'E', name: `基础${ENERGY[Math.floor(r() * 8)]}能量`, r: 'E', kind: foil ? 'FE' : 'E', price: cardPrice(setId, 'E', foil ? 'FE' : 'E') });
    // reveal order: energy, commons, uncommons, reverses, rare slot
    return [out[7], ...out.slice(0, 7), ...out.slice(8)];
  }

  const packValue = cards => cards.reduce((s, c) => s + c.price, 0);

  // Expected market value of one pack, computed exactly from pool averages × slot odds.
  function packEV(setId) {
    const set = g.PTCG_SETS.find(s => s.id === setId), t = slotTables(set), P = poolsFor(setId);
    const avg = kind => P[kind].reduce((s, c) => s + priceOf(c, kind), 0) / P[kind].length;
    const slot = (table, base) => { let rest = 100, v = 0; for (const k in table) { v += table[k] / 100 * avg(k); rest -= table[k]; } return v + rest / 100 * avg(base); };
    return 4 * avg('C') + 3 * avg('U') + slot(t.rev1, 'REV') + slot(t.rev2, 'REV') + slot(t.rare, 'R') + 0.01;
  }

  // Luck: where a player's total pulled value sits among simulated players who opened the same packs.
  // 60k packs per set (~250ms once per set): a 0.07%-per-pack SIR chase card gets ~40 samples, 20k gave ~14.
  const SAMPLES = 60000, samples = {};
  function valueSamples(setId) {
    if (samples[setId]) return samples[setId];
    const r = rng(0xC0FFEE ^ setId.length), a = new Float64Array(SAMPLES);
    for (let i = 0; i < a.length; i++) a[i] = packValue(openPack(setId, r));
    return (samples[setId] = a);
  }
  // Where one pack's value ranks among simulated packs of the same set: share of packs worth less (ties count half).
  const sorted = {};
  function packPercentile(setId, value) {
    const a = sorted[setId] ||= Float64Array.from(valueSamples(setId)).sort();
    let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < value - 1e-9) lo = m + 1; else hi = m; }
    let up = lo; while (up < a.length && a[up] <= value + 1e-9) up++;
    return (lo + (up - lo) / 2) / a.length;
  }
  // Monte-Carlo resamples of the player's pack count; budget ~2M draws so SE stays under ~1pp even at 1000 packs.
  function luckPercentile(counts, value, trials) { // counts: {setId: packs}
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    trials ||= Math.max(1000, Math.min(4000, Math.floor(2e6 / Math.max(total, 1))));
    const r = rng(7); let below = 0, ties = 0;
    for (let t = 0; t < trials; t++) {
      let v = 0;
      for (const id in counts) { const a = valueSamples(id); for (let k = 0; k < counts[id]; k++) v += a[Math.floor(r() * a.length)]; }
      if (v < value - 1e-9) below++; else if (Math.abs(v - value) <= 1e-9) ties++;
    }
    return (below + ties / 2) / trials;
  }

  // Exact chance of seeing `k` or more (k >= expected) / `k` or fewer (k < expected) hits of one rarity,
  // over packs opened in several sets (Poisson-binomial by DP, truncated at k+1 entries).
  function hitTail(counts, kind, k) {
    const probs = []; let mean = 0;
    for (const id in counts) { const p = (g.PTCG_SETS.find(s => s.id === id).rates[kind] || 0) / 100; for (let i = 0; i < counts[id]; i++) probs.push(p); mean += p * counts[id]; }
    const pmf = new Float64Array(k + 1); pmf[0] = 1; // P(X = j) for j <= k
    for (const p of probs) for (let j = k; j >= 0; j--) pmf[j] = pmf[j] * (1 - p) + (j ? pmf[j - 1] * p : 0);
    const le = pmf.reduce((a, b) => a + b, 0), lt = le - pmf[k];
    return k >= mean ? 1 - lt : le;
  }

  g.PTCG_SIM = { rng, openPack, packEV, cardPrice, packValue, luckPercentile, packPercentile, hitTail, RANK, HITS, slotTables, poolsFor };
})(typeof window !== 'undefined' ? window : globalThis);
