// Shop state + actions. No DOM in here: ui.js renders state and calls these.
(function (g) {
  const S = g.PTCG_SIM;
  const SAVE_KEY = 'ptcg-shop-v1';
  // Game settings (invented, not market data — shown as such in the UI footer):
  const WHOLESALE = 0.72;        // distributor price as a share of the current market pack price (supplier upgrades lower it)
  const WHOLESALE_STEP = 0.03;   // per supplier level
  const BUYLIST = 0.7;           // what a fellow shop pays for your singles, share of market
  const START_CASH = 150;
  const ARRIVAL = 0.20;          // walk-ins per second before 口碑; each one is an individual with an errand (see TYPES)
  const WAREHOUSE = 200;         // packs per set the back room holds; only shelf packs are for sale
  const MIN_PCT = 0.6, MAX_PCT = 1.6, PCT_STEP = 0.05; // asking price as a share of market, for shelf packs and case singles
  // Customer types. tol = the most a customer will pay, as a share of market (mean; sd is the spread between individuals).
  const TYPES = {
    opener:    { name: '拆包玩家', w: 50, tol: 1.06, sd: 0.08 }, // buys 1–5 packs of a set to open; budget-limited
    seeker:    { name: '找卡的', w: 22, tol: 1.12, sd: 0.10 },   // wants one card of a given rarity
    collector: { name: '收藏党', w: 10, tol: 1.22, sd: 0.12 },   // wants the priciest card in the case; trophy and signage draw more of them
    flipper:   { name: '倒爷', w: 8, tol: 0.93, sd: 0.05 },      // sweeps up bargains in bulk; ignores anything above ~market
  };
  const SEEK = [['RR', 'ACE', 'PB'], ['UR', 'IR', 'MB'], ['SIR', 'HR']]; // what seekers ask for: one card of a rarity tier, from a given set (or any)
  const SEEK_W = [50, 35, 15];
  const SIGN_STEP = 0.04;                 // signage: customers pay +4% more per level, and more seekers/collectors come
  const SHELF_BASE = 20, SHELF_STEP = 20; // packs per set the shelf holds
  const CASE_BASE = 3, CASE_STEP = 2;     // display-case slots
  const OFFLINE_CAP = 6 * 3600;           // seconds of closed-shop sales credited on return
  const HEAT_EVERY = 120;                 // seconds between 行情 rerolls
  // 图鉴: each set's Pokédex fills as you pull new card numbers (selling a card never un-collects it).
  // Reaching a share of a set's cards permanently raises walk-in traffic. Game setting; steps sum to +30% per set.
  const DEX_TIERS = [[0.25, 0.02], [0.5, 0.03], [0.75, 0.05], [0.9, 0.08], [1, 0.12]];
  const BAILOUT = 30;                     // a shop with no cash, stock or cards to sell gets this much once (soft-lock guard)
  const CLERK_SLICE = 30;                 // seconds per catch-up step while a clerk is restocking (so a closed shop keeps being restocked)
  const UNLOCK = { 'sv08.5': 400, 'sv03.5': 2000 }; // lifetime revenue needed before a set can be stocked
  const UPGRADES = {
    signage:  { name: '招牌', desc: `顾客肯多付 +${SIGN_STEP * 100}% / 级，更多收藏党和找卡的`, costs: [120, 260, 570, 1250, 2750] },
    shelf:    { name: '货架', desc: `每个系列多放 ${SHELF_STEP} 包`, costs: [80, 160, 320, 640] },
    case:     { name: '展示柜', desc: `多 ${CASE_STEP} 个柜位`, costs: [150, 330, 730, 1600] },
    supplier: { name: '进货渠道', desc: `进货价再低 ${WHOLESALE_STEP * 100} 个百分点`, costs: [300, 750, 1900, 4700] },
    clerk:    { name: '店员', desc: '1 级：货架见底自动进货上架（含打烊时）；2 级：补满货架，并把散卡卖给同行', costs: [500, 2600] }, // ponytail: no wage; add one if cash piles up unspent
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
  const trophyBonus = () => state.trophy ? state.trophy.price / (state.trophy.price + 150) * 0.5 : 0; // 0..0.5, more for pricier cards
  const shelfQty = id => state.shelf[id]?.qty || 0;
  const pctOf = id => state.shelf[id]?.pct ?? 1;
  const ask = id => Math.round(sealedPrice(id) * pctOf(id) * 100) / 100;
  const cardPct = c => c.pct ?? 1;
  const cardAsk = c => Math.round(c.price * cardPct(c) * 100) / 100;
  const dexTotal = id => g.PTCG_DATA[id].cards.length;
  const dexCount = id => Object.keys(state.dexSeen).filter(k => k.startsWith(id + '|')).length;
  const dexShare = id => dexCount(id) / dexTotal(id);
  const dexBonusOf = id => DEX_TIERS.reduce((a, [at, b]) => a + (dexShare(id) >= at - 1e-9 ? b : 0), 0);
  const dexBonus = () => g.PTCG_SETS.reduce((a, s) => a + dexBonusOf(s.id), 0);
  const rate = () => ARRIVAL * (1 + dexBonus()); // walk-ins per second: only word of mouth (图鉴) grows it
  const fresh = () => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [], shelf: {}, cust: { visits: 0, sold: 0, pricey: 0, none: 0 }, recent: [],
    up: {}, dex: {}, dexPacks: 0, dexSeen: {}, auto: {}, shown: [], trophy: null, heat: {}, heatT: 0, lost: 0, savedAt: Date.now(), offline: null });

  let state = load(), luckCache = null, lastTick = state.savedAt; // first tick after load credits the time the tab was closed
  const listeners = [];
  const emit = () => { save(); listeners.forEach(f => f()); };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cash === 'number') {
        const st = { ...fresh(), ...s };
        if (!s.shelf) { for (const [id, n] of Object.entries(st.stock)) if (n > 0) st.shelf[id] = { qty: n, pct: 1 }; st.stock = {}; } // pre-storefront saves: everything was on sale
        return st;
      } } catch {}
    return fresh();
  }
  function save() { state.savedAt = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }
  function log(text, tone = '') { state.log.unshift({ t: Date.now(), text, tone }); state.log.length = Math.min(state.log.length, 40); }

  // Moves cash into stock (back room, or straight onto the shelf for the clerk) without logging or saving; returns the cost.
  function stockUp(id, n, toShelf) {
    if (!unlocked(id)) return 0;
    n = Math.min(n, toShelf ? capacity() - shelfQty(id) : WAREHOUSE - (state.stock[id] || 0));
    const cost = wholesale(id) * n;
    if (n <= 0 || state.cash < cost) return 0;
    state.cash -= cost;
    if (toShelf) (state.shelf[id] ||= { qty: 0, pct: 1 }).qty += n; else state.stock[id] = (state.stock[id] || 0) + n;
    return cost;
  }
  function buy(id, n) {
    const before = state.stock[id] || 0, cost = stockUp(id, n);
    if (!cost) return false;
    log(`进货 ${setById(id).name} ×${state.stock[id] - before}，−$${cost.toFixed(2)}`);
    emit(); return true;
  }
  // Shelf: only packs on the shelf are sold to customers. pct = asking price as a share of the market pack price.
  function shelve(id, n) {
    n = Math.min(n, state.stock[id] || 0, capacity() - shelfQty(id));
    if (n <= 0) return false;
    state.stock[id] -= n; (state.shelf[id] ||= { qty: 0, pct: 1 }).qty += n;
    emit(); return true;
  }
  function unshelve(id, n) {
    n = Math.min(n, shelfQty(id), WAREHOUSE - (state.stock[id] || 0));
    if (n <= 0) return false;
    state.shelf[id].qty -= n; state.stock[id] = (state.stock[id] || 0) + n;
    emit(); return true;
  }
  const clampPct = p => Math.round(Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, p)) / PCT_STEP) * PCT_STEP * 100) / 100;
  function setPrice(id, pct) { (state.shelf[id] ||= { qty: 0, pct: 1 }).pct = clampPct(pct); emit(); }

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
        if (c.r !== 'E') state.dexSeen[`${c.set}|${c.n}`] = 1;
        const key = `${c.set}|${c.n}|${c.kind}`;
        (state.singles[key] ||= { ...c, count: 0 }).count++;
        const d = (state.dex[key] ||= { c: 0, p: c.price }); d.c++; d.p = c.price;
        state.tally[c.kind] = (state.tally[c.kind] || 0) + 1;
        if (S.HITS.includes(c.kind)) state.hits.push({ ...c, t: Date.now() });
      }
    }
    state.hits.sort((a, b) => b.price - a.price); state.hits.length = Math.min(state.hits.length, 24);
    state.costOpened += wholesale(id) * n;
    state.opened[id] = (state.opened[id] || 0) + n; state.dexPacks += n;
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
    state.shown.push({ key, ...card, pct: 1 });
    emit(); return true;
  }
  function unlist(i) {
    const c = state.shown.splice(i, 1)[0]; if (!c) return;
    const { key, pct, ...card } = c;
    (state.singles[key] ||= { ...card, count: 0 }).count++;
    emit();
  }
  function setCardPrice(i, pct) { if (state.shown[i]) { state.shown[i].pct = clampPct(pct); emit(); } }
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
    if (k === 'clerk' && lvl(k) === 1) for (const s of g.PTCG_SETS) if (shelfQty(s.id) || state.stock[s.id] || state.opened[s.id]) state.auto[s.id] = true;
    log(`升级：${UPGRADES[k].name} Lv${lvl(k)}，−$${cost}`);
    emit(); return true;
  }

  // ---------- customers ----------
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const lognorm = (median, sigma) => median * Math.exp(sigma * gauss());
  const pickW = (items, w) => { let x = Math.random() * items.reduce((a, it) => a + w(it), 0); return items.find(it => (x -= w(it)) < 0) || items[0]; };
  const typeWeight = t => TYPES[t].w * (t === 'collector' ? 1 + 0.15 * lvl('signage') + 3 * trophyBonus() : t === 'seeker' ? 1 + 0.15 * lvl('signage') : 1);
  // Highest share of market this customer will pay: the type's mean, plus signage, plus (collectors) the trophy, plus personal spread.
  const tolOf = t => Math.max(0.5, TYPES[t].tol + (t === 'flipper' ? 0 : SIGN_STEP * lvl('signage')) + (t === 'collector' ? trophyBonus() * 0.6 : 0) + TYPES[t].sd * gauss());
  const heatW = id => { const h = state.heat[id]; return h > 1 ? 2 : h < 1 ? 0.5 : 1; };
  const sellCard = (i, quiet, who) => {
    const c = state.shown.splice(i, 1)[0], gain = cardAsk(c);
    state.cash += gain; state.earned.singles += gain;
    return { gain, text: `${who}买走 ${c.name}，+$${gain.toFixed(2)}` };
  };
  const sellPacks = (id, n, who) => {
    const gain = ask(id) * n; state.shelf[id].qty -= n; state.cash += gain; state.earned.sealed += gain;
    return { gain, text: `${who}买走 ${n} 包${setById(id).name}，+$${gain.toFixed(2)}` };
  };

  // One walk-in customer: picks an errand, looks at what is on the shelf/in the case at what price, buys or leaves.
  // Returns cash taken in. res: 'sold' | 'pricey' (something matched but too dear) | 'none' (nothing they wanted was for sale).
  function visit(quiet) {
    const type = pickW(Object.keys(TYPES), typeWeight), who = TYPES[type].name, tol = tolOf(type), hits = state.shown;
    const onShelf = g.PTCG_SETS.filter(s => shelfQty(s.id) > 0).map(s => s.id);
    let res = 'none', out = null, why = '';
    if (type === 'opener') {
      const budget = lognorm(25, 0.6), want = (r => r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(Math.random() * 3))(Math.random());
      let id = pickW(g.PTCG_SETS.filter(s => unlocked(s.id)), s => heatW(s.id)).id;
      if (!shelfQty(id) && onShelf.length && Math.random() < 0.5) id = pickW(onShelf, i => shelfQty(i)); // settles for another set
      if (shelfQty(id)) {
        const n = Math.min(want, shelfQty(id), Math.floor(budget / ask(id)));
        if (n >= 1 && pctOf(id) <= tol) { res = 'sold'; out = sellPacks(id, n, who); } else { res = 'pricey'; why = `${setById(id).name}标价 ${Math.round(pctOf(id) * 100)}%，嫌贵走了`; }
      } else why = `想拆 ${setById(id).name}，货架没有`;
    } else if (type === 'flipper') {
      const cheap = onShelf.filter(id => pctOf(id) <= tol).sort((a, b) => pctOf(a) - pctOf(b))[0];
      const budget = lognorm(300, 0.5);
      if (cheap) { // a low price empties the shelf: they take up to 4–15 packs
        const n = Math.min(shelfQty(cheap), Math.floor(budget / ask(cheap)), 4 + Math.floor(Math.random() * 12));
        if (n >= 1) { res = 'sold'; out = sellPacks(cheap, n, who); }
      }
      if (res !== 'sold') {
        const i = hits.findIndex(c => cardPct(c) <= tol && cardAsk(c) <= budget);
        if (i >= 0) { res = 'sold'; out = sellCard(i, quiet, who); }
        else if (onShelf.length || hits.length) { res = 'pricey'; why = '没有低于市价的货，空手走了'; }
      }
    } else if (type === 'seeker') {
      const tier = pickW([0, 1, 2], i => SEEK_W[i]), any = Math.random() < 0.4, sid = pickW(g.PTCG_SETS.filter(s => unlocked(s.id)), () => 1).id;
      const fits = hits.map((c, i) => [c, i]).filter(([c]) => SEEK[tier].includes(c.kind) && (any || c.set === sid)).sort((a, b) => cardAsk(a[0]) - cardAsk(b[0]));
      const budget = lognorm(60, 0.7);
      if (!fits.length) why = `想找一张 ${SEEK[tier].join('/')}，柜里没有`;
      else if (cardPct(fits[0][0]) <= tol && cardAsk(fits[0][0]) <= budget) { res = 'sold'; out = sellCard(fits[0][1], quiet, who); }
      else { res = 'pricey'; why = `${fits[0][0].name} 标价 ${Math.round(cardPct(fits[0][0]) * 100)}%，嫌贵`; }
    } else { // collector
      const budget = lognorm(150, 0.8), big = hits.map((c, i) => [c, i]).filter(([c]) => c.price >= 12).sort((a, b) => b[0].price - a[0].price);
      const ok = big.find(([c]) => cardPct(c) <= tol && cardAsk(c) <= budget);
      if (ok) { res = 'sold'; out = sellCard(ok[1], quiet, who); }
      else if (big.length) { res = 'pricey'; why = `${big[0][0].name} 标价 ${Math.round(cardPct(big[0][0]) * 100)}%，嫌贵`; }
      else why = '想看点值钱的卡，柜里没有';
    }
    const c = state.cust; c.visits++; if (res === 'sold') { c.sold++; state.customers++; } else if (res === 'pricey') c.pricey++; else { c.none++; state.lost++; }
    state.recent.unshift({ t: type, r: res, text: out ? out.text : `${who}：${why}` }); state.recent.length = Math.min(state.recent.length, 40);
    if (out && !quiet) log(out.text, 'gain');
    return out ? out.gain : 0;
  }

  // The clerk (upgrade): tops up the shelf of every set with auto-restock on (buying straight onto it), and at level 2 sells the bulk to peers.
  function clerkWork(acc) {
    const L = lvl('clerk'); if (!L) return;
    for (const set of g.PTCG_SETS) {
      const id = set.id, cap = capacity(), goal = L >= 2 ? cap : Math.ceil(cap / 2), have = shelfQty(id);
      if (!state.auto[id] || have >= goal / 2) continue;
      const n = Math.min(goal - have, Math.floor(state.cash / wholesale(id))), cost = n > 0 ? stockUp(id, n, true) : 0;
      if (cost) { acc.packs += n; acc.spent += cost; }
    }
    if (L >= 2) { const b = dumpBulk(); acc.bulk += b.n; acc.bulkV += b.v; }
  }
  // Dead end guard: no cash for the cheapest pack, nothing on the shelf, nothing to sell. Game setting.
  function bailout() {
    const cheapest = Math.min(...g.PTCG_SETS.filter(s => unlocked(s.id)).map(s => wholesale(s.id)));
    if (state.cash >= cheapest || Object.values(state.stock).some(n => n > 0) || Object.values(state.shelf).some(o => o.qty > 0) || Object.keys(state.singles).length || state.shown.length) return false;
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
      for (let i = 0; i < m; i++) { const got = visit(quiet); revenue += got; if (got) sales++; }
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

  // 行情: every couple of minutes one unlocked set runs hot (+15% price and twice the demand) and another cold (−10% price, half the demand). Game setting.
  function rollHeat(now) {
    const ids = g.PTCG_SETS.map(s => s.id).filter(unlocked).sort(() => Math.random() - 0.5);
    state.heat = Object.fromEntries([[ids[0], 1.15], [ids[1], 0.9]].filter(([id]) => id)); state.heatT = now;
  }

  const TITLES = [[0.99, '欧皇本皇'], [0.9, '欧洲人'], [0.7, '小欧'], [0.3, '平民'], [0.1, '小非'], [0, '非酋']];
  function luck() {
    if (luckCache) return luckCache;
    const packs = Object.values(state.opened).reduce((a, b) => a + b, 0);
    const expected = Object.entries(state.opened).reduce((s, [id, n]) => s + n * S.packEV(id), 0);
    // Price basis: the simulated players are priced with today's data, so re-price every card ever pulled the same way
    // (state.pulled is the price at the moment of opening; prices move when data/ is refreshed). Saves from before
    // state.dex existed only have that snapshot.
    const live = state.dexPacks === packs;
    const value = live ? Object.entries(state.dex).reduce((s, [k, d]) => { const [set, n, kind] = k.split('|'); return s + d.c * (S.cardPrice(set, n, kind) ?? d.p); }, 0) : state.pulled;
    const pct = packs ? S.luckPercentile(state.opened, value) : null;
    const title = pct == null ? '还没开包' : TITLES.find(([p]) => pct >= p)[1];
    return (luckCache = { packs, pct, title, value, live, expected, cost: state.costOpened, listEV: Object.entries(state.opened).reduce((s, [id, n]) => s + n * setById(id).packPrice, 0) });
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
    buy, shelve, unshelve, setPrice, setCardPrice, open, sell, setAuto, dexCount, dexTotal, dexBonusOf, dexBonus, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    list, unlist, setTrophy, clearTrophy, upgrade, upgradeCost, ackOffline,
    sealedPrice, ask, cardAsk, shelfQty, pctOf, cardPct, capacity, slots, revenue, unlocked, unlockAt, rate, trophyBonus, wholesaleRate, lvl,
    UPGRADES, TYPES, DEX_TIERS, BAILOUT, BUYLIST, WHOLESALE, WHOLESALE_STEP, ARRIVAL, SIGN_STEP, OFFLINE_CAP, HEAT_EVERY, SHELF_BASE, CASE_BASE, WAREHOUSE, MIN_PCT, MAX_PCT, PCT_STEP,
  };
})(window);
