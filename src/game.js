// Shop state + actions. No DOM in here: ui.js renders state and calls these.
(function (g) {
  const S = g.PTCG_SIM;
  const SAVE_KEY = 'ptcg-shop-v1';
  // Game settings (invented, not market data — shown as such in the UI footer):
  const WHOLESALE = 0.72;        // distributor price as a share of the current market pack price
  const BUYLIST = 0.7;           // what a fellow shop pays for your singles, share of market
  const CUSTOMERS_PER_SEC = 0.25;
  const START_CASH = 150;

  const setById = id => g.PTCG_SETS.find(s => s.id === id);
  const wholesale = id => Math.round(setById(id).packPrice * WHOLESALE * 100) / 100;
  const fresh = () => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [] });

  let state = load(), luckCache = null;
  const listeners = [];
  const emit = () => { save(); listeners.forEach(f => f()); };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cash === 'number') return { ...fresh(), ...s }; } catch {}
    return fresh();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }
  function log(text, tone = '') { state.log.unshift({ t: Date.now(), text, tone }); state.log.length = Math.min(state.log.length, 40); }

  function buy(id, n) {
    const cost = wholesale(id) * n;
    if (state.cash < cost) return false;
    state.cash -= cost;
    state.stock[id] = (state.stock[id] || 0) + n;
    log(`进货 ${setById(id).name} ×${n}，−$${cost.toFixed(2)}`);
    emit(); return true;
  }

  function open(id, n) {
    n = Math.min(n, state.stock[id] || 0);
    if (!n) return [];
    state.stock[id] -= n;
    const packs = [];
    for (let i = 0; i < n; i++) {
      const pack = S.openPack(id, Math.random);
      packs.push(pack);
      state.pulled += S.packValue(pack);
      for (const c of pack) {
        const key = `${c.set}|${c.n}|${c.kind}`;
        (state.singles[key] ||= { ...c, count: 0 }).count++;
        state.tally[c.kind] = (state.tally[c.kind] || 0) + 1;
        if (S.HITS.includes(c.kind)) state.hits.push({ ...c, t: Date.now() });
      }
    }
    state.hits.sort((a, b) => b.price - a.price); state.hits.length = Math.min(state.hits.length, 24);
    state.costOpened += wholesale(id) * n;
    state.opened[id] = (state.opened[id] || 0) + n;
    luckCache = null;
    const best = packs.flat().reduce((a, b) => (b.price > a.price ? b : a));
    log(`开了 ${n} 包${setById(id).name}，最贵：${best.name} $${best.price.toFixed(2)}`, S.HITS.includes(best.kind) ? 'hit' : '');
    emit(); return packs;
  }

  function sell(key, count = Infinity) {
    const s = state.singles[key]; if (!s) return 0;
    const k = Math.min(count, s.count), gain = s.price * BUYLIST * k;
    s.count -= k; if (!s.count) delete state.singles[key];
    state.cash += gain; state.earned.singles += gain;
    log(`卖出 ${s.name} ×${k}，+$${gain.toFixed(2)}`, 'gain');
    emit(); return gain;
  }

  const isBulk = s => !S.HITS.includes(s.kind);
  function bulkValue() { let n = 0, v = 0; for (const s of Object.values(state.singles)) if (isBulk(s)) { n += s.count; v += s.price * s.count * BUYLIST; } return { n, v }; }
  function sellBulk() {
    const { n, v } = bulkValue(); if (!n) return 0;
    for (const [k, s] of Object.entries(state.singles)) if (isBulk(s)) delete state.singles[k];
    state.cash += v; state.earned.singles += v;
    log(`散卡 ${n} 张打包卖给同行，+$${v.toFixed(2)}`, 'gain');
    emit(); return v;
  }

  // Walk-in customers buy sealed packs at market price, weighted by what is on the shelf.
  function tick(dt) {
    if (Math.random() >= CUSTOMERS_PER_SEC * dt) return;
    const ids = Object.keys(state.stock).filter(id => state.stock[id] > 0);
    if (!ids.length) return;
    let x = Math.random() * ids.reduce((s, id) => s + state.stock[id], 0);
    const id = ids.find(id => (x -= state.stock[id]) < 0) || ids[0], set = setById(id);
    state.stock[id]--; state.cash += set.packPrice; state.earned.sealed += set.packPrice; state.customers++;
    log(`顾客买走 1 包${set.name}，+$${set.packPrice.toFixed(2)}`, 'gain');
    emit();
  }

  const TITLES = [[0.99, '欧皇本皇'], [0.9, '欧洲人'], [0.7, '小欧'], [0.3, '平民'], [0.1, '小非'], [0, '非酋']];
  function luck() {
    if (luckCache) return luckCache;
    const packs = Object.values(state.opened).reduce((a, b) => a + b, 0);
    const expected = Object.entries(state.opened).reduce((s, [id, n]) => s + n * S.packEV(id), 0);
    const pct = packs ? S.luckPercentile(state.opened, state.pulled) : null;
    const title = pct == null ? '还没开包' : TITLES.find(([p]) => pct >= p)[1];
    return (luckCache = { packs, pct, title, value: state.pulled, expected, cost: state.costOpened });
  }
  // Expected count of each hit rarity for the packs opened so far.
  function expectedTally() {
    const e = {};
    for (const [id, n] of Object.entries(state.opened)) for (const [k, p] of Object.entries(setById(id).rates)) e[k] = (e[k] || 0) + n * p / 100;
    return e;
  }

  function reset() { state = fresh(); luckCache = null; emit(); }

  g.PTCG_GAME = {
    get state() { return state; }, on: f => listeners.push(f),
    buy, open, sell, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    BUYLIST, WHOLESALE, CUSTOMERS_PER_SEC,
  };
})(window);
