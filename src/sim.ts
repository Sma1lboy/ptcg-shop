// Pack simulator: pure functions over DATA + SETS. Runs in the browser and in node (test/).
import { DATA, SETS, type CardData, type SetConf } from './sets.ts';

export type Rng = () => number;
// One pulled card. kind = the slot it came from (REV / PB / MB are printings of C/U/R cards, FE the cosmos-foil Energy).
export interface Pull { set: string; n: string; name: string; r: string; kind: string; price: number }

export const RANK: Record<string, number> = { C: 0, U: 1, R: 2, E: -1, REV: 2, ACE: 3, RR: 3, PB: 3, UR: 4, IR: 4, MB: 5, SIR: 6, HR: 6, MHR: 7 };
export const HITS = ['ACE', 'RR', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR', 'MHR'];
const ENERGY = ['草', '火', '水', '雷', '超', '斗', '恶', '钢'];
const setOf = (id: string) => SETS.find(s => s.id === id)!;

export function rng(seed: number): Rng { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const pools: Record<string, Record<string, CardData[]>> = {};
export function poolsFor(setId: string) {
  if (pools[setId]) return pools[setId];
  const data = DATA[setId], by: Record<string, CardData[]> = {};
  for (const c of data.cards) (by[c.r] ||= []).push(c);
  by.REV = [...(by.C || []), ...(by.U || []), ...(by.R || [])];
  by.PB = data.cards.filter(c => c.p.pb != null);
  by.MB = data.cards.filter(c => c.p.mb != null);
  return (pools[setId] = by);
}

// Picks one outcome from {key: percent}; remainder falls to `base`.
function roll(r: Rng, table: Record<string, number>, base: string) {
  let x = r() * 100;
  for (const k in table) { if ((x -= table[k]) < 0) return k; }
  return base;
}

function priceOf(card: CardData, kind: string) {
  const p = card.p;
  if (kind === 'REV') return p.r ?? p.n ?? 0;
  if (kind === 'PB') return p.pb ?? 0;
  if (kind === 'MB') return p.mb ?? 0;
  if (kind === 'C' || kind === 'U') return p.n ?? p.r ?? 0;
  return p.h ?? p.n ?? 0;
}

// Current market price of one pulled card, looked up by (set, number, kind). Energy is a game constant. null = card no longer in the data.
export function cardPrice(setId: string, n: string, kind: string) {
  if (kind === 'E') return 0.01;
  if (kind === 'FE') return 0.5;
  const card = DATA[setId]?.cards.find(c => c.n === n);
  return card ? priceOf(card, kind) : null;
}

// 手气 (a game bonus, bought in game.ts): every hit rarity's measured rate × m. m = 1 is the measured rates, untouched.
// A pack opened at m is recorded under rateKey(set, m), so its luck is judged against packs opened at the same odds.
export const roundM = (m: number) => Math.round(m * 100) / 100;
export const rateKey = (setId: string, m = 1) => roundM(m) === 1 ? setId : `${setId}@${roundM(m)}`;
export const parseKey = (key: string) => { const [id, m] = key.split('@'); return { id, m: m ? +m : 1 }; };
export const ratesFor = (set: SetConf, m = 1) => m === 1 ? set.rates : Object.fromEntries(Object.entries(set.rates).map(([k, v]) => [k, HITS.includes(k) ? v * m : v]));

export function slotTables(set: SetConf, m = 1) {
  const t = ratesFor(set, m), pick = (keys: string[]) => Object.fromEntries(keys.filter(k => t[k]).map(k => [k, t[k]]));
  return { rare: pick(['UR', 'RR']), rev1: pick(['ACE', 'PB']), rev2: pick(['MHR', 'HR', 'SIR', 'IR', 'MB']) };
}

function draw(r: Rng, setId: string, kind: string): Pull {
  const pool = poolsFor(setId)[kind];
  const card = pool[Math.floor(r() * pool.length)];
  return { set: setId, n: card.n, name: card.name, r: card.r, kind, price: priceOf(card, kind) };
}

// Returns the 11 cards of one booster (10 + basic Energy) in the order they sit in the pack (best last). m = 手气 multiplier.
export function openPack(setId: string, r: Rng, m = 1): Pull[] {
  const set = setOf(setId), t = slotTables(set, m), out: Pull[] = [];
  for (let i = 0; i < 4; i++) out.push(draw(r, setId, 'C'));
  for (let i = 0; i < 3; i++) out.push(draw(r, setId, 'U'));
  out.push(draw(r, setId, roll(r, t.rev1, 'REV')));
  out.push(draw(r, setId, roll(r, t.rev2, 'REV')));
  out.push(draw(r, setId, roll(r, t.rare, 'R')));
  const foil = set.rates.FE && r() * 100 < set.rates.FE;
  out.splice(7, 0, { set: setId, n: 'E', name: `基础${ENERGY[Math.floor(r() * 8)]}能量`, r: 'E', kind: foil ? 'FE' : 'E', price: cardPrice(setId, 'E', foil ? 'FE' : 'E')! });
  // reveal order: energy, commons, uncommons, reverses, rare slot
  return [out[7], ...out.slice(0, 7), ...out.slice(8)];
}

export const packValue = (cards: Pull[]) => cards.reduce((s, c) => s + c.price, 0);

// Expected market value of one pack, computed exactly from pool averages × slot odds. key = set id or rateKey(set, m).
export function packEV(key: string) {
  const { id: setId, m } = parseKey(key), set = setOf(setId), t = slotTables(set, m), P = poolsFor(setId);
  const avg = (kind: string) => P[kind].reduce((s, c) => s + priceOf(c, kind), 0) / P[kind].length;
  const slot = (table: Record<string, number>, base: string) => { let rest = 100, v = 0; for (const k in table) { v += table[k] / 100 * avg(k); rest -= table[k]; } return v + rest / 100 * avg(base); };
  return 4 * avg('C') + 3 * avg('U') + slot(t.rev1, 'REV') + slot(t.rev2, 'REV') + slot(t.rare, 'R') + 0.01;
}

// Luck: where a player's total pulled value sits among simulated players who opened the same packs.
// 60k packs per set (~250ms once per set): a 0.07%-per-pack SIR chase card gets ~40 samples, 20k gave ~14.
// Keyed by rateKey: packs opened with 手气 are compared with packs opened at the same boosted odds.
const SAMPLES = 60000, samples: Record<string, Float64Array> = {};
function valueSamples(key: string) {
  if (samples[key]) return samples[key];
  const { id, m } = parseKey(key), r = rng(0xC0FFEE ^ id.length), a = new Float64Array(SAMPLES);
  for (let i = 0; i < a.length; i++) a[i] = packValue(openPack(id, r, m));
  return (samples[key] = a);
}
// Where one pack's value ranks among simulated packs of the same set: share of packs worth less (ties count half).
const sorted: Record<string, Float64Array> = {};
export function packPercentile(key: string, value: number) {
  const a = sorted[key] ||= Float64Array.from(valueSamples(key)).sort();
  let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < value - 1e-9) lo = m + 1; else hi = m; }
  let up = lo; while (up < a.length && a[up] <= value + 1e-9) up++;
  return (lo + (up - lo) / 2) / a.length;
}
// Monte-Carlo resamples of the player's pack count; budget ~2M draws so SE stays under ~1pp even at 1000 packs.
export function luckPercentile(counts: Record<string, number>, value: number, trials?: number) { // counts: {rateKey: packs}
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
// over packs opened in several sets at the odds each was opened with (Poisson-binomial by DP, truncated at k+1 entries).
export function hitTail(counts: Record<string, number>, kind: string, k: number) { // counts: {rateKey: packs}
  const probs = []; let mean = 0;
  for (const key in counts) { const { id, m } = parseKey(key), p = (ratesFor(setOf(id), m)[kind] || 0) / 100; for (let i = 0; i < counts[key]; i++) probs.push(p); mean += p * counts[key]; }
  const pmf = new Float64Array(k + 1); pmf[0] = 1; // P(X = j) for j <= k
  for (const p of probs) for (let j = k; j >= 0; j--) pmf[j] = pmf[j] * (1 - p) + (j ? pmf[j - 1] * p : 0);
  const le = pmf.reduce((a, b) => a + b, 0), lt = le - pmf[k];
  return k >= mean ? 1 - lt : le;
}
