// Shop state + actions. No DOM in here: ui.js renders state and calls these.
(function (g) {
  const S = g.PTCG_SIM;
  const SAVE_KEY = 'ptcg-shop-v1';
  // Game settings (invented, not market data — shown as such in the UI footer):
  const WHOLESALE = 0.72;        // distributor price as a share of the current market pack price (supplier upgrades lower it)
  const WHOLESALE_STEP = 0.03;   // per supplier level
  const BUYLIST = 0.7;           // what a fellow shop pays for your singles, share of market
  const CUSTOMERS_PER_SEC = 0.12; // base walk-in rate; signage and the trophy card raise it
  const START_CASH = 150;
  const BROWSE = 0.35;           // share of customers who look at the display case instead of the pack shelf
  const CASE_PRICING = [         // display-case price tiers: share of market asked, chance a browsing customer takes the card
    { name: '九折', mult: 0.9, buy: 0.8 }, { name: '市价', mult: 1.0, buy: 0.5 }, { name: '加价', mult: 1.25, buy: 0.2 }];
  const SHELF_BASE = 20, SHELF_STEP = 20; // packs per set the shelf holds
  const CASE_BASE = 3, CASE_STEP = 2;     // display-case slots
  const SIGN_STEP = 0.3;                  // +30% walk-ins per signage level
  const OFFLINE_CAP = 6 * 3600;           // seconds of closed-shop sales credited on return
  const HEAT_EVERY = 120;                 // seconds between 行情 rerolls
  // 图鉴: each set's Pokédex fills as you pull new card numbers (selling a card never un-collects it).
  // Reaching a share of a set's cards permanently raises walk-in traffic. Game setting; steps sum to +30% per set.
  const DEX_TIERS = [[0.25, 0.02], [0.5, 0.03], [0.75, 0.05], [0.9, 0.08], [1, 0.12]];
  const BAILOUT = 30;                     // a shop with no cash, stock or cards to sell gets this much once (soft-lock guard)
  const CLERK_SLICE = 30;                 // seconds per catch-up step while a clerk is restocking (so a closed shop keeps being restocked)
  const UNLOCK = { 'sv08.5': 400, 'sv03.5': 2000 }; // lifetime revenue needed before a set can be stocked
  const UPGRADES = {
    signage:  { name: '招牌', desc: `进店客流 +${SIGN_STEP * 100}% / 级`, costs: [120, 260, 570, 1250, 2750] },
    shelf:    { name: '货架', desc: `每个系列多放 ${SHELF_STEP} 包`, costs: [80, 160, 320, 640] },
    case:     { name: '展示柜', desc: `多 ${CASE_STEP} 个柜位`, costs: [150, 330, 730, 1600] },
    supplier: { name: '进货渠道', desc: `进货价再低 ${WHOLESALE_STEP * 100} 个百分点`, costs: [300, 750, 1900, 4700] },
    clerk:    { name: '店员', desc: '1 级：货架见底自动进货（含打烊时）；2 级：补满货架，并把散卡卖给同行', costs: [500, 2600] },
  };

  const setById = id => g.PTCG_SETS.find(s => s.id === id);
  const lvl = k => state.up[k] || 0;
  const wholesaleRate = () => WHOLESALE - WHOLESALE_STEP * lvl('supplier');
  const wholesale = id => Math.round(setById(id).packPrice * wholesaleRate() * 100) / 100;
  const sealedPrice = id => Math.round(setById(id).packPrice * (state.heat[id] || 1) * 100) / 100;
  const capacity = () => SHELF_BASE + SHELF_STEP * lvl('shelf');
  const slots = () => CASE_BASE + CASE_STEP * lvl('case');
  const revenue = () => state.earned.sealed + state.earned.singles;
  const unlockAt = id => UNLOCK[id] || 0;
  const unlocked = id => revenue() >= unlockAt(id);
  const trophyBonus = () => state.trophy ? state.trophy.price / (state.trophy.price + 150) * 0.5 : 0; // capped below +50%
  const dexTotal = id => g.PTCG_DATA[id].cards.length;
  const dexCount = id => Object.keys(state.dex).filter(k => k.startsWith(id + '|')).length;
  const dexShare = id => dexCount(id) / dexTotal(id);
  const dexBonusOf = id => DEX_TIERS.reduce((a, [at, b]) => a + (dexShare(id) >= at - 1e-9 ? b : 0), 0);
  const dexBonus = () => g.PTCG_SETS.reduce((a, s) => a + dexBonusOf(s.id), 0);
  const rate = () => CUSTOMERS_PER_SEC * (1 + SIGN_STEP * lvl('signage')) * (1 + trophyBonus()) * (1 + dexBonus());
  const fresh = () => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [],
    up: {}, dex: {}, auto: {}, shown: [], casePrice: 1, trophy: null, heat: {}, heatT: 0, lost: 0, savedAt: Date.now(), offline: null });

  let state = load(), luckCache = null, lastTick = state.savedAt; // first tick after load credits the time the tab was closed
  const listeners = [];
  const emit = () => { save(); listeners.forEach(f => f()); };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cash === 'number') return { ...fresh(), ...s }; } catch {}
    return fresh();
  }
  function save() { state.savedAt = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }
  function log(text, tone = '') { state.log.unshift({ t: Date.now(), text, tone }); state.log.length = Math.min(state.log.length, 40); }

  // Moves cash into shelf stock without logging or saving; returns the cost (0 if nothing was bought).
  function stockUp(id, n) {
    if (!unlocked(id)) return 0;
    n = Math.min(n, capacity() - (state.stock[id] || 0));
    const cost = wholesale(id) * n;
    if (n <= 0 || state.cash < cost) return 0;
    state.cash -= cost; state.stock[id] = (state.stock[id] || 0) + n;
    return cost;
  }
  function buy(id, n) {
    const before = state.stock[id] || 0, cost = stockUp(id, n);
    if (!cost) return false;
    log(`进货 ${setById(id).name} ×${state.stock[id] - before}，−$${cost.toFixed(2)}`);
    emit(); return true;
  }

  function open(id, n) {
    n = Math.min(n, state.stock[id] || 0);
    if (!n) return [];
    state.stock[id] -= n;
    const packs = [], dex0 = dexBonusOf(id), had = dexCount(id);
    for (let i = 0; i < n; i++) {
      const pack = S.openPack(id, Math.random);
      packs.push(pack);
      state.pulled += S.packValue(pack);
      for (const c of pack) {
        if (c.r !== 'E') state.dex[`${c.set}|${c.n}`] = 1;
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
    if (dexCount(id) > had) {
      if (dexBonusOf(id) > dex0) log(`图鉴：${setById(id).name} 收录 ${Math.round(dexShare(id) * 100)}%，客流加成 +${Math.round(dexBonusOf(id) * 100)}%`, 'hit');
    }
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
  function dumpBulk() { // sells every non-hit single, no log or save; returns { n, v }
    const b = bulkValue(); if (!b.n) return b;
    for (const [k, s] of Object.entries(state.singles)) if (isBulk(s)) delete state.singles[k];
    state.cash += b.v; state.earned.singles += b.v;
    return b;
  }
  function sellBulk() {
    const { n, v } = dumpBulk(); if (!n) return 0;
    log(`散卡 ${n} 张打包卖给同行，+$${v.toFixed(2)}`, 'gain');
    emit(); return v;
  }

  // ---------- shop: customers, display case, trophy, upgrades ----------
  function list(key) {
    const c = state.singles[key];
    if (!c || state.shown.length >= slots() || !S.HITS.includes(c.kind)) return false;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.shown.push({ key, ...card });
    emit(); return true;
  }
  function unlist(i) {
    const c = state.shown.splice(i, 1)[0]; if (!c) return;
    const { key, ...card } = c;
    (state.singles[key] ||= { ...card, count: 0 }).count++;
    emit();
  }
  function setCasePrice(i) { state.casePrice = i; emit(); }
  function setTrophy(key) {
    const c = state.singles[key]; if (!c) return false;
    const old = state.trophy;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.trophy = { key, ...card };
    if (old) { const { key: k, ...o } = old; (state.singles[k] ||= { ...o, count: 0 }).count++; }
    log(`镇店之宝：${card.name}，客流 +${Math.round(trophyBonus() * 100)}%`);
    emit(); return true;
  }
  function clearTrophy() {
    const old = state.trophy; if (!old) return;
    const { key, ...o } = old; state.trophy = null;
    (state.singles[key] ||= { ...o, count: 0 }).count++;
    emit();
  }
  const upgradeCost = k => UPGRADES[k].costs[lvl(k)];  // undefined once maxed
  function upgrade(k) {
    const cost = upgradeCost(k);
    if (cost == null || state.cash < cost) return false;
    state.cash -= cost; state.up[k] = lvl(k) + 1;
    if (k === 'clerk' && lvl(k) === 1) for (const s of g.PTCG_SETS) if (state.stock[s.id] || state.opened[s.id]) state.auto[s.id] = true;
    log(`升级：${UPGRADES[k].name} Lv${lvl(k)}，−$${cost}`);
    emit(); return true;
  }

  // One walk-in customer. Returns cash taken in (0 if they left empty-handed).
  function serve(quiet) {
    if (state.shown.length && Math.random() < BROWSE) {
      const i = Math.floor(Math.random() * state.shown.length), tier = CASE_PRICING[state.casePrice];
      if (Math.random() >= tier.buy) return 0;
      const c = state.shown.splice(i, 1)[0], gain = Math.round(c.price * tier.mult * 100) / 100;
      state.cash += gain; state.earned.singles += gain; state.customers++;
      if (!quiet) log(`顾客买走展示柜里的 ${c.name}，+$${gain.toFixed(2)}`, 'gain');
      return gain;
    }
    const ids = Object.keys(state.stock).filter(id => state.stock[id] > 0);
    if (!ids.length) { state.lost++; return 0; }
    let x = Math.random() * ids.reduce((s, id) => s + state.stock[id], 0);
    const id = ids.find(id => (x -= state.stock[id]) < 0) || ids[0], price = sealedPrice(id);
    state.stock[id]--; state.cash += price; state.earned.sealed += price; state.customers++;
    if (!quiet) log(`顾客买走 1 包${setById(id).name}，+$${price.toFixed(2)}`, 'gain');
    return price;
  }

  // The clerk (upgrade): tops up the shelf of every set with auto-restock on, and at level 2 sells the bulk to peers.
  function clerkWork(acc) {
    const L = lvl('clerk'); if (!L) return;
    for (const set of g.PTCG_SETS) {
      const id = set.id, cap = capacity(), goal = L >= 2 ? cap : Math.ceil(cap / 2), have = state.stock[id] || 0;
      if (!state.auto[id] || have >= goal / 2) continue;
      const n = Math.min(goal - have, Math.floor(state.cash / wholesale(id))), cost = n > 0 ? stockUp(id, n) : 0;
      if (cost) { acc.packs += n; acc.spent += cost; }
    }
    if (L >= 2) { const b = dumpBulk(); acc.bulk += b.n; acc.bulkV += b.v; }
  }
  // Dead end guard: no cash for the cheapest pack, nothing on the shelf, nothing to sell. Game setting.
  function bailout() {
    const cheapest = Math.min(...g.PTCG_SETS.filter(s => unlocked(s.id)).map(s => wholesale(s.id)));
    if (state.cash >= cheapest || Object.values(state.stock).some(n => n > 0) || Object.keys(state.singles).length || state.shown.length) return false;
    state.cash += BAILOUT; log(`货架空了、钱也花光了，亲戚周济了 $${BAILOUT}`, 'gain'); return true;
  }

  // Advances the shop by the wall-clock time since the last call, so background tabs and closed tabs both catch up.
  function tick() {
    const now = Date.now(), dt = Math.min((now - lastTick) / 1000, OFFLINE_CAP); lastTick = now;
    if (dt <= 0) return;
    if (now - state.heatT > HEAT_EVERY * 1000) rollHeat(now);
    const acc = { packs: 0, spent: 0, bulk: 0, bulkV: 0 }, lost0 = state.lost, slice = lvl('clerk') ? CLERK_SLICE : dt;
    let n = 0, revenue = 0, sales = 0, quiet = false;
    for (let left = dt; left > 0; left -= slice) {
      const x = rate() * Math.min(slice, left), m = Math.floor(x) + (Math.random() < x % 1 ? 1 : 0);
      quiet = quiet || m > 3; n += m;
      for (let i = 0; i < m; i++) { const g = serve(quiet); revenue += g; if (g) sales++; }
      clerkWork(acc);
    }
    if (acc.packs) log(`店员进货 ${acc.packs} 包，−$${acc.spent.toFixed(2)}${acc.bulk ? `；散卡 ${acc.bulk} 张卖给同行，+$${acc.bulkV.toFixed(2)}` : ''}`);
    else if (acc.bulk) log(`店员把散卡 ${acc.bulk} 张卖给同行，+$${acc.bulkV.toFixed(2)}`, 'gain');
    if (dt > 30 && n) { // long absence: one summary instead of a log line per customer
      const o = state.offline ||= { secs: 0, sales: 0, revenue: 0, lost: 0 };
      o.secs += dt; o.sales += sales; o.revenue += revenue; o.lost += state.lost - lost0;
      log(`打烊期间卖出 ${sales} 件，+$${revenue.toFixed(2)}`, 'gain');
    }
    const rescued = bailout();
    if (n || dt > 30 || acc.packs || acc.bulk || rescued) emit(); else save();
  }
  function setAuto(id, on) { state.auto[id] = !!on; emit(); }
  function ackOffline() { state.offline = null; emit(); }

  // 行情: every couple of minutes one unlocked set runs hot (+15% at the counter) and another cold (−10%). Game setting.
  function rollHeat(now) {
    const ids = g.PTCG_SETS.map(s => s.id).filter(unlocked).sort(() => Math.random() - 0.5);
    state.heat = Object.fromEntries([[ids[0], 1.15], [ids[1], 0.9]].filter(([id]) => id)); state.heatT = now;
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
    buy, open, sell, setAuto, dexCount, dexTotal, dexBonusOf, dexBonus, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    list, unlist, setCasePrice, setTrophy, clearTrophy, upgrade, upgradeCost, ackOffline,
    sealedPrice, capacity, slots, revenue, unlocked, unlockAt, rate, trophyBonus, wholesaleRate, lvl,
    UPGRADES, DEX_TIERS, BAILOUT, CASE_PRICING, BUYLIST, WHOLESALE, WHOLESALE_STEP, CUSTOMERS_PER_SEC, SIGN_STEP, BROWSE, OFFLINE_CAP, HEAT_EVERY, SHELF_BASE, CASE_BASE,
  };
})(window);
