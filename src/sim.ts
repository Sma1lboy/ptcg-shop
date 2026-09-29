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
  return 4 * avg('C') + 3 * avg('U') + slot(t.rev1, 'REV') + slot(t.rev2, 'REV') + slot(t.rare, 'R') + energyEV(set);
}
// The basic Energy: $0.01, or the $0.50 cosmos foil at set.rates.FE (openPack reads set.rates, so 手气 doesn't touch it).
const energyEV = (set: SetConf) => { const fe = (set.rates.FE || 0) / 100; return fe * cardPrice(set.id, 'E', 'FE')! + (1 - fe) * cardPrice(set.id, 'E', 'E')!; };

// Where one pack's value ranks among 60k simulated packs of its set (share worth less, ties count half). One pack, so a pool is
// fine here: its sampling error doesn't grow with anything. ~250 ms once per set, built when a pack of that set is first ranked.
const SAMPLES = 60000, sorted: Record<string, Float64Array> = {};
export function packPercentile(key: string, value: number) {
  const a = sorted[key] ||= (() => { const { id, m } = parseKey(key), r = rng(0xC0FFEE ^ id.length), x = new Float64Array(SAMPLES); for (let i = 0; i < x.length; i++) x[i] = packValue(openPack(id, r, m)); return x.sort(); })();
  let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < value - 1e-9) lo = m + 1; else hi = m; }
  let up = lo; while (up < a.length && a[up] <= value + 1e-9) up++;
  return (lo + (up - lo) / 2) / a.length;
}

// Luck: where a player's total pulled value sits among LUCK_TRIALS simulated players who opened exactly the same packs (same sets,
// counts and odds). A pack is independent slots (openPack): 4 commons, 3 uncommons, two reverse slots, the rare slot, the Energy.
// So n packs of one key are 4n common picks, 3n uncommon picks, and per slot a multinomial count of each rarity it rolled; the value
// is, per rarity, the sum of that many uniform picks from its card list. A simulated player draws those counts, adds up small counts
// card by card and large ones (> PICKS picks from one list) as a normal with the list's exact mean and variance. There is no finite
// pool to resample: the old 60k-pack pool's mean was off by ~1/245 SD per pack, and summed over n packs that bias grew as n while
// the spread grew as √n (1.35 SD at 88k packs). Cost doesn't grow with pack count. Error: the trial count, ±1.96·√(p(1−p)/T), plus the
// normal approximations above (large counts only, where they are tight).
export const LUCK_TRIALS = 4000;
const PICKS = 100;
interface List { v: Float64Array; mu: number; sd: number }
interface Model { lists: Record<string, List>; slots: [string, number][][]; fe: number; e: number; foil: number }
const models: Record<string, Model> = {};
function model(key: string) {
  if (models[key]) return models[key];
  const { id, m } = parseKey(key), set = setOf(id), t = slotTables(set, m), P = poolsFor(id), lists: Record<string, List> = {};
  const list = (k: string) => lists[k] ||= (() => { const v = Float64Array.from(P[k], c => priceOf(c, k)), mu = v.reduce((a, b) => a + b, 0) / v.length; return { v, mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) }; })();
  // each slot: [rarity, percent] with the base (the remainder) last
  const slots = ([[t.rev1, 'REV'], [t.rev2, 'REV'], [t.rare, 'R']] as const).map(([tb, base]) =>
    [...Object.entries(tb), [base, 100 - Object.values(tb).reduce((a, b) => a + b, 0)] as [string, number]]);
  for (const s of slots) for (const [k] of s) list(k);
  list('C'); list('U');
  const e = cardPrice(id, 'E', 'E')!;
  return (models[key] = { lists, slots, fe: (set.rates.FE || 0) / 100, e, foil: cardPrice(id, 'E', 'FE')! - e });
}
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
// Binomial(n, p): inversion from 0 while the mean is ≤ 200 ((1−p)^n ≥ e^-200 is still a normal double), a rounded normal above.
function binomial(r: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomial(r, n, 1 - p);
  const mean = n * p;
  if (mean > 200) return Math.min(n, Math.max(0, Math.round(mean + Math.sqrt(mean * (1 - p)) * gauss(r))));
  let u = r(), q = Math.pow(1 - p, n), k = 0;
  while (u > q && k < n) { u -= q; q *= (n - k) / (k + 1) * p / (1 - p); k++; }
  return k;
}
function picks(r: Rng, l: List, k: number) {
  if (k > PICKS) return k * l.mu + Math.sqrt(k) * l.sd * gauss(r);
  let v = 0; for (let i = 0; i < k; i++) v += l.v[Math.floor(r() * l.v.length)];
  return v;
}
function simTotal(r: Rng, key: string, n: number) {
  const M = model(key);
  let v = picks(r, M.lists.C, 4 * n) + picks(r, M.lists.U, 3 * n) + n * M.e + M.foil * binomial(r, n, M.fe);
  for (const s of M.slots) {
    let left = n, rest = 100;
    for (let i = 0; i < s.length; i++) {
      const [k, pct] = s[i], c = i === s.length - 1 ? left : binomial(r, left, Math.min(1, pct / rest));
      v += picks(r, M.lists[k], c); left -= c; rest -= pct;
    }
  }
  return v;
}
export function luckPercentile(counts: Record<string, number>, value: number, trials = LUCK_TRIALS) { // counts: {rateKey: packs}
  const r = rng(7); let below = 0, ties = 0;
  for (let t = 0; t < trials; t++) {
    let v = 0; for (const key in counts) if (counts[key] > 0) v += simTotal(r, key, counts[key]);
    if (v < value - 1e-9) below++; else if (Math.abs(v - value) <= 1e-9) ties++;
  }
  return (below + ties / 2) / trials;
}

// Exact chance of seeing `k` or more (k >= expected) / `k` or fewer (k < expected) hits of one rarity,
// over packs opened in several sets at the odds each was opened with (Poisson-binomial). Packs opened at the same odds are one
// binomial, so this convolves one binomial per odds instead of stepping pack by pack (a 20-hour save: 88k packs × 14k RR took
// seconds per row). Terms below 1e-18 of the largest are dropped and mass past k is never needed; both cost < 1e-15.
export function hitTail(counts: Record<string, number>, kind: string, k: number) { // counts: {rateKey: packs}
  const by = new Map<number, number>(); let mean = 0;
  for (const key in counts) { const { id, m } = parseKey(key), p = (ratesFor(setOf(id), m)[kind] || 0) / 100; if (p > 0) by.set(p, (by.get(p) || 0) + counts[key]); mean += p * counts[key]; }
  let cur = new Float64Array(k + 1), a = 0, b = 0; cur[0] = 1; // P(X = j) for j <= k, nonzero on [a, b]
  for (const [p, n] of by) {
    const g = binom(n, p), lo = a + g.lo, hi = Math.min(b + g.lo + g.q.length - 1, k), next = new Float64Array(k + 1);
    for (let j = a; j <= b; j++) { const c = cur[j]; if (c) for (let i = 0; i < g.q.length && j + g.lo + i <= hi; i++) next[j + g.lo + i] += c * g.q[i]; }
    cur = next; a = lo; b = hi;
    if (a > b) return k >= mean ? 1 : 0; // every outcome is above k
    let max = 0; for (let j = a; j <= b; j++) max = Math.max(max, cur[j]);
    while (a < b && cur[a] < max * 1e-18) a++; while (b > a && cur[b] < max * 1e-18) b--;
  }
  let le = 0; for (let j = a; j <= b; j++) le += cur[j];
  const lt = le - cur[k];
  return k >= mean ? 1 - lt : le;
}
// Binomial(n, p) pmf from lo up, built outward from the mode by the term ratio (no (1-p)^n underflow), cut below 1e-18 of the mode.
function binom(n: number, p: number) {
  if (p >= 1) return { lo: n, q: [1] };
  const r = p / (1 - p), m = Math.min(n, Math.floor((n + 1) * p)), up = [1], down: number[] = [];
  for (let j = m, t = 1; j < n && (t *= (n - j) / (j + 1) * r) > 1e-18; j++) up.push(t);
  for (let j = m, t = 1; j > 0 && (t *= j / (n - j + 1) / r) > 1e-18; j--) down.push(t);
  const q = [...down.reverse(), ...up], sum = q.reduce((x, y) => x + y, 0);
  return { lo: m - down.length, q: q.map(x => x / sum) };
}
