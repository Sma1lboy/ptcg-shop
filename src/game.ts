// Shop state + actions. No DOM in here: the ui renders state and calls these.
// createGame() takes its clock, random source and storage as arguments so node (test/, scripts/autoplay.mjs) can drive it
// on a fake clock with a seeded rng; the browser uses the defaults.
import { DATA, SETS } from './sets.ts';
import * as S from './sim.ts';
import type { Pull } from './sim.ts';

export interface Single extends Pull { count: number }
export interface Shown extends Pull { key: string; pct: number }
export interface Trophy extends Pull { key: string }
// One walk-in customer, as the 顾客 panel and 店内动态 show them. t = TYPES key, r = 'sold' | 'pricey' | 'none'; set = the set they
// looked at (openers, flippers) or asked for (seekers; absent = any set); miss = the set an opener came for that was not on the shelf;
// tier = seeker's SEEK row; card = the case card bought or balked at; price = that pack's or card's market price then; pct = its
// asking price and max = the most this customer would pay, both as shares of that market price; why = 'budget' (fine price, not
// enough money on them) | 'cool' (flipper still holding that set).
export interface Visit { at: number; t: string; r: string; set?: string; miss?: string; tier?: number; card?: string; n?: number; price?: number; pct?: number; max?: number; gain?: number; why?: string }
export interface State {
  cash: number; stock: Record<string, number>; singles: Record<string, Single>; opened: Record<string, number>; tally: Record<string, number>;
  pulled: number; costOpened: number; hits: (Pull & { t: number })[]; earned: { sealed: number; singles: number }; customers: number;
  log: { t: number; text: string; tone: string; amt?: number }[]; shelf: Record<string, { qty: number; pct: number }>;
  cust: { visits: number; sold: number; pricey: number; none: number }; recent: Visit[];
  up: Record<string, number>; dex: Record<string, { c: number; p: number }>; dexPacks: number; dexSeen: Record<string, 1>; auto: Record<string, boolean>;
  shown: Shown[]; trophy: Trophy | null; heat: Record<string, number>; heatT: number; lost: number; savedAt: number; flipT: Record<string, number>;
  skills: Record<string, number>; packsBy: Record<string, number>; // packsBy: packs opened per S.rateKey (set + the 手气 odds they were opened at)
  offline: { secs: number; sales: number; revenue: number; lost: number } | null;
}
export interface Luck { packs: number; pct: number | null; title: string; value: number; live: boolean; expected: number; cost: number; listEV: number; boosted: number }
export interface GameEnv { now?: () => number; random?: () => number; storage?: Pick<Storage, 'getItem' | 'setItem'> }
export type Game = ReturnType<typeof createGame>;

export function createGame({ now: clock = Date.now, random = Math.random, storage }: GameEnv = {}) {
  // Touched lazily inside try/catch, so a browser with storage blocked still plays (unsaved).
  const store = storage ?? { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) };
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
  const TYPES: Record<string, { name: string; w: number; tol: number; sd: number }> = {
    opener:    { name: '拆包玩家', w: 50, tol: 1.06, sd: 0.08 }, // buys 1–5 packs of a set to open; budget-limited
    seeker:    { name: '找卡的', w: 22, tol: 1.12, sd: 0.10 },   // wants one card of a given rarity
    collector: { name: '收藏党', w: 10, tol: 1.22, sd: 0.12 },   // wants the priciest card in the case; trophy and signage draw more of them
    flipper:   { name: '倒爷', w: 8, tol: 0.93, sd: 0.05 },      // sweeps up bargains in bulk; ignores anything above ~market
  };
  // Per-set pack demand. w = share of pack buyers who come for this set, tol = added to how far over market they will pay,
  // budget = multiplier on their spending money. Flavour from where each set sits in the real market, not market data.
  // crowd = extra walk-ins once the set is unlocked (a new release brings its own customers). Only the later sets have it:
  // their packs cost less than the average of the first four, so without new customers unlocking them would cut income.
  const DEMAND: Record<string, { tag: string; w: number; tol: number; budget: number; crowd?: number }> = {
    sv08: { tag: '货足比价', w: 1.2, tol: -0.06, budget: 1 },      // plentiful main set: players shop around
    sv10: { tag: '行情平稳', w: 1, tol: 0, budget: 1 },
    'sv08.5': { tag: '断货抢手', w: 1.3, tol: 0.14, budget: 1.6 }, // sold out for most of 2025: players pay over market, and bring more money
    'sv03.5': { tag: '老粉收藏', w: 0.7, tol: 0.06, budget: 2.4 }, // out of print; adult collectors with deeper pockets
    sv09: { tag: '平价好开', w: 0.9, tol: -0.03, budget: 0.7, crowd: 0.1 }, // cheapest pack, a double rare in 1 of 5: kids on pocket money, shopping around
    me01: { tag: '新世代', w: 1.2, tol: 0.04, budget: 1.2, crowd: 0.1 },    // first Mega Evolution set: everyone wants a look at the new series
    me02: { tag: '追喷火龙', w: 1.4, tol: 0.12, budget: 1.5, crowd: 0.1 },   // Mega Charizard X SIR is the chase card of the era: chasers pay over market
  };
  const FLIP_COOLDOWN = 600;              // seconds: after a flipper buys a set's packs, nobody flips that set again until they resold
  const SEEK = [['RR', 'ACE', 'PB'], ['UR', 'IR', 'MB'], ['SIR', 'HR', 'MHR']]; // what seekers ask for: one card of a rarity tier, from a given set (or any)
  const SEEK_W = [50, 35, 15];
  const BIG_CARD = 12;                    // collectors only look at case cards worth at least this much
  const RECENT = 60;                      // walk-ins kept for the 顾客 panel (about five minutes of a young shop)
  const SIGN_STEP = 0.04;                 // signage: customers pay +4% more per level, and more seekers/collectors come
  const SHELF_BASE = 20, SHELF_STEP = 20; // packs per set the shelf holds
  const CASE_BASE = 3, CASE_STEP = 2;     // display-case slots
  const OFFLINE_CAP = 6 * 3600;           // seconds of closed-shop sales credited on return
  const HEAT_EVERY = 120;                 // seconds between 行情 rerolls
  // 图鉴: each set's Pokédex fills as you pull new card numbers (selling a card never un-collects it).
  // Reaching a share of a set's cards permanently raises walk-in traffic. Game setting; steps sum to +38% per set.
  const DEX_TIERS: [number, number][] = [[0.25, 0.02], [0.5, 0.03], [0.75, 0.05], [0.9, 0.08], [1, 0.2]];
  // Hits (RR and up) can also be bought from other shops at market price, into the binder only; C/U/R only come from packs.
  const BUY_R = ['RR', 'ACE', 'UR', 'IR', 'SIR', 'HR', 'MHR'];
  const MASTER = { tol: 0.1, w: 1.5 };    // 大师套 (a set's dex at 100%): its pack buyers pay +10% more, and 1.5× as many come for it
  const BAILOUT = 30;                     // a shop with no cash, stock or cards to sell gets this much once (soft-lock guard)
  const CLERK_SLICE = 30;                 // seconds per catch-up step while a clerk is restocking (so a closed shop keeps being restocked)
  const UNLOCK: Record<string, number> = { 'sv08.5': 400, 'sv03.5': 2000, sv09: 10000, me01: 25000, me02: 60000 }; // lifetime revenue needed before a set can be stocked
  const UPGRADES: Record<string, { name: string; desc: string; costs: number[] }> = {
    signage:  { name: '招牌', desc: `顾客肯多付 +${SIGN_STEP * 100}% / 级，更多收藏党和找卡的`, costs: [120, 260, 570, 1250, 2750] },
    shelf:    { name: '货架', desc: `每个系列多放 ${SHELF_STEP} 包`, costs: [80, 160, 320, 640] },
    case:     { name: '展示柜', desc: `多 ${CASE_STEP} 个柜位`, costs: [150, 330, 730, 1600] },
    supplier: { name: '进货渠道', desc: `进货价再低 ${WHOLESALE_STEP * 100} 个百分点`, costs: [300, 750, 1900, 4700] },
    clerk:    { name: '店员', desc: '1 级：货架见底自动进货上架（含打烊时）；2 级：补满货架，并把散卡卖给同行', costs: [500, 2600] }, // ponytail: no wage; add one if cash piles up unspent
  };
  // 技能: the long-term money sink, levelled with cash. Level L+1 costs base × grow^L. step = the effect of one level (see fx).
  // 手气 multiplies the hit rates a pack is opened with; the measured rates in sets.ts are never touched, and every pack is
  // recorded with the odds it was opened at, so 欧气检测 compares it with packs opened at the same odds.
  const SKILLS: Record<string, { name: string; group: string; desc: string; max: number; base: number; grow: number; step: number; fx: (lv: number) => string }> = {
    luck: { name: '手气', group: '幸运', desc: '开包时闪卡（RR 及以上）的概率乘系数，官方概率不变', max: 5, base: 400, grow: 2.2, step: 0.05, fx: lv => `闪卡概率 ×${S.roundM(1 + 0.05 * lv).toFixed(2)}` },
    talk: { name: '口才', group: '经营', desc: '顾客肯付的上限（倒爷除外）', max: 10, base: 250, grow: 1.7, step: 0.02, fx: lv => `肯多付 +${Math.round(2 * lv)} 个百分点` },
    crowd: { name: '人气', group: '经营', desc: '进店人数，和图鉴口碑相乘', max: 10, base: 300, grow: 1.75, step: 0.05, fx: lv => `进店 +${Math.round(5 * lv)}%` },
    watch: { name: '看店', group: '经营', desc: '打烊期间最多结算多久', max: 3, base: 600, grow: 2.5, step: 2, fx: lv => `最多 ${OFFLINE_CAP / 3600 + 2 * lv} 小时` },
    apprentice: { name: '带徒弟', group: '经营', desc: '店员把最贵的闪卡挂进空柜位（要先雇店员）', max: 1, base: 800, grow: 1, step: 1.1, fx: lv => lv ? '自动上柜，标价 110%' : '不上柜' },
  };

  const setById = (id: string) => SETS.find(s => s.id === id)!;
  const lvl = (k: string) => state.up[k] || 0;
  const skill = (k: string) => state.skills[k] || 0;
  const luckMult = () => S.roundM(1 + SKILLS.luck.step * skill('luck'));
  const offlineCap = () => OFFLINE_CAP + SKILLS.watch.step * 3600 * skill('watch');
  const wholesaleRate = () => WHOLESALE - WHOLESALE_STEP * lvl('supplier');
  const wholesale = (id: string) => Math.round(setById(id).packPrice * wholesaleRate() * 100) / 100;
  const sealedPrice = (id: string) => Math.round(setById(id).packPrice * (state.heat[id] || 1) * 100) / 100;
  const capacity = () => SHELF_BASE + SHELF_STEP * lvl('shelf');
  const slots = () => CASE_BASE + CASE_STEP * lvl('case');
  const revenue = () => state.earned.sealed + state.earned.singles;
  const unlockAt = (id: string) => UNLOCK[id] || 0;
  const unlocked = (id: string) => revenue() >= unlockAt(id);
  const trophyBonus = () => state.trophy ? state.trophy.price / (state.trophy.price + 150) * 0.5 : 0; // 0..0.5, more for pricier cards
  const shelfQty = (id: string) => state.shelf[id]?.qty || 0;
  const pctOf = (id: string) => state.shelf[id]?.pct ?? 1;
  const ask = (id: string) => Math.round(sealedPrice(id) * pctOf(id) * 100) / 100;
  const cardPct = (c: { pct?: number }) => c.pct ?? 1;
  const cardAsk = (c: Shown) => Math.round(c.price * cardPct(c) * 100) / 100;
  const dexTotal = (id: string) => DATA[id].cards.length;
  const dexCount = (id: string) => (dexN ||= Object.keys(state.dexSeen).reduce((a, k) => { const s = k.split('|')[0]; a[s] = (a[s] || 0) + 1; return a; }, {} as Record<string, number>))[id] || 0;
  const dexShare = (id: string) => dexCount(id) / dexTotal(id);
  const master = (id: string) => dexCount(id) >= dexTotal(id);
  const demand = (id: string) => { const d = DEMAND[id] || { tag: '', w: 1, tol: 0, budget: 1 }; return master(id) ? { ...d, tol: d.tol + MASTER.tol, w: d.w * MASTER.w } : d; };
  const dexBonusOf = (id: string) => DEX_TIERS.reduce((a, [at, b]) => a + (dexShare(id) >= at - 1e-9 ? b : 0), 0);
  const dexBonus = () => SETS.reduce((a, s) => a + dexBonusOf(s.id), 0);
  const lineup = () => SETS.reduce((a, s) => a + (unlocked(s.id) ? DEMAND[s.id]?.crowd || 0 : 0), 0);
  const rate = () => ARRIVAL * (1 + dexBonus()) * (1 + SKILLS.crowd.step * skill('crowd')) * (1 + lineup()); // walk-ins per second: 图鉴 word of mouth × 人气 × new sets
  const fresh = (): State => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [], shelf: {}, cust: { visits: 0, sold: 0, pricey: 0, none: 0 }, recent: [],
    up: {}, dex: {}, dexPacks: 0, dexSeen: {}, auto: {}, shown: [], trophy: null, heat: {}, heatT: 0, lost: 0, savedAt: clock(), offline: null, flipT: {}, skills: {}, packsBy: {} });

  let state = load(), luckCache: Luck | null = null, lastTick = state.savedAt, vnow = lastTick, dexN: Record<string, number> | null = null; // dexN: per-set dex counts, cleared when dexSeen changes // first tick after load credits the time the tab was closed
  const listeners: (() => void)[] = [];
  const emit = () => { save(); listeners.forEach(f => f()); };

  function load(): State {
    try { const s = JSON.parse(store.getItem(SAVE_KEY)!); if (s && typeof s.cash === 'number') {
        const st = { ...fresh(), ...s };
        if (!s.shelf) { for (const [id, n] of Object.entries(st.stock as State['stock'])) if (n > 0) st.shelf[id] = { qty: n, pct: 1 }; st.stock = {}; } // pre-storefront saves: everything was on sale
        if (!s.packsBy) st.packsBy = { ...st.opened }; // pre-手气 saves: every pack was opened at the measured odds
        st.recent = st.recent.filter((v: Visit) => v.at); // pre-顾客流水 saves kept each walk-in as a line of text only
        return st;
      } } catch {}
    return fresh();
  }
  function save() { state.savedAt = clock(); try { store.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }
  function log(text: string, tone = '', amt?: number) { state.log.unshift({ t: clock(), text, tone, amt }); state.log.length = Math.min(state.log.length, 40); }

  // Moves cash into stock (back room, or straight onto the shelf for the clerk) without logging or saving; returns the cost.
  function stockUp(id: string, n: number, toShelf?: boolean) {
    if (!unlocked(id)) return 0;
    n = Math.min(n, toShelf ? capacity() - shelfQty(id) : WAREHOUSE - (state.stock[id] || 0));
    const cost = wholesale(id) * n;
    if (n <= 0 || state.cash < cost) return 0;
    state.cash -= cost;
    if (toShelf) (state.shelf[id] ||= { qty: 0, pct: 1 }).qty += n; else state.stock[id] = (state.stock[id] || 0) + n;
    return cost;
  }
  function buy(id: string, n: number) {
    const before = state.stock[id] || 0, cost = stockUp(id, n);
    if (!cost) return false;
    log(`进货 ${setById(id).name} ×${state.stock[id] - before}`, '', -cost);
    emit(); return true;
  }
  // Shelf: only packs on the shelf are sold to customers. pct = asking price as a share of the market pack price.
  function shelve(id: string, n: number) {
    n = Math.min(n, state.stock[id] || 0, capacity() - shelfQty(id));
    if (n <= 0) return false;
    state.stock[id] -= n; (state.shelf[id] ||= { qty: 0, pct: 1 }).qty += n;
    emit(); return true;
  }
  function unshelve(id: string, n: number) {
    n = Math.min(n, shelfQty(id), WAREHOUSE - (state.stock[id] || 0));
    if (n <= 0) return false;
    state.shelf[id].qty -= n; state.stock[id] = (state.stock[id] || 0) + n;
    emit(); return true;
  }
  const clampPct = (p: number) => Math.round(Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, p)) / PCT_STEP) * PCT_STEP * 100) / 100;
  function setPrice(id: string, pct: number) { (state.shelf[id] ||= { qty: 0, pct: 1 }).pct = clampPct(pct); emit(); }

  function open(id: string, n: number) {
    n = Math.min(n, state.stock[id] || 0);
    if (!n) return [];
    state.stock[id] -= n;
    const packs = [], dex0 = dexBonusOf(id), had = dexCount(id), m = luckMult(), key = S.rateKey(id, m);
    for (let i = 0; i < n; i++) {
      const pack = S.openPack(id, random, m);
      packs.push(pack);
      state.pulled += S.packValue(pack);
      for (const c of pack) {
        if (c.r !== 'E' && !state.dexSeen[`${c.set}|${c.n}`]) { state.dexSeen[`${c.set}|${c.n}`] = 1; dexN = null; }
        const key = `${c.set}|${c.n}|${c.kind}`;
        (state.singles[key] ||= { ...c, count: 0 }).count++;
        const d = (state.dex[key] ||= { c: 0, p: c.price }); d.c++; d.p = c.price;
        state.tally[c.kind] = (state.tally[c.kind] || 0) + 1;
        if (S.HITS.includes(c.kind)) state.hits.push({ ...c, t: clock() });
      }
    }
    state.hits.sort((a, b) => b.price - a.price); state.hits.length = Math.min(state.hits.length, 24);
    state.costOpened += wholesale(id) * n;
    state.opened[id] = (state.opened[id] || 0) + n; state.packsBy[key] = (state.packsBy[key] || 0) + n; state.dexPacks += n;
    luckCache = null;
    if (dexCount(id) > had) dexLog(id, dex0);
    const best = packs.flat().reduce((a, b) => (b.price > a.price ? b : a));
    log(`开了 ${n} 包${setById(id).name}，最贵：${best.name} $${best.price.toFixed(2)}`, S.HITS.includes(best.kind) ? 'hit' : '');
    emit(); return packs;
  }

  const dexLog = (id: string, before: number) => { if (dexBonusOf(id) > before) log(master(id)
    ? `大师套：${setById(id).name} 收齐了！回头客 +${Math.round(dexBonusOf(id) * 100)}%，这个系列的拆包玩家肯多付 ${MASTER.tol * 100}%`
    : `图鉴：${setById(id).name} 收录 ${Math.round(dexShare(id) * 100)}%，客流加成 +${Math.round(dexBonusOf(id) * 100)}%`, 'hit'); };

  // 图鉴补卡: missing hits of a set, cheapest first, at today's market price.
  const missing = (id: string) => DATA[id].cards.filter(c => BUY_R.includes(c.r) && !state.dexSeen[`${id}|${c.n}`])
    .map(c => ({ n: c.n, name: c.name, r: c.r, price: S.cardPrice(id, c.n, c.r)! })).sort((a, b) => a.price - b.price);
  // Buys the cheapest missing hit (or all of them) into the binder. Never into singles/case/trophy, so it cannot be resold.
  function collect(id: string, all = false) {
    const miss = missing(id), buy = all ? miss : miss.slice(0, 1), cost = buy.reduce((a, c) => a + c.price, 0);
    if (!unlocked(id) || !buy.length || state.cash < cost) return false;
    const before = dexBonusOf(id);
    state.cash -= cost; for (const c of buy) state.dexSeen[`${id}|${c.n}`] = 1; dexN = null;
    log(`图鉴补卡：${buy.length > 1 ? `${setById(id).name}闪卡 ${buy.length} 张` : buy[0].name}`, '', -cost);
    dexLog(id, before);
    emit(); return true;
  }

  function sell(key: string, count = Infinity) {
    const s = state.singles[key]; if (!s) return 0;
    const k = Math.min(count, s.count), gain = s.price * BUYLIST * k;
    s.count -= k; if (!s.count) delete state.singles[key];
    state.cash += gain; state.earned.singles += gain;
    log(`${s.name} ×${k} 卖给同行`, 'gain', gain);
    emit(); return gain;
  }

  const isBulk = (s: Single) => !S.HITS.includes(s.kind);
  function bulkValue() { let n = 0, v = 0; for (const s of Object.values(state.singles)) if (isBulk(s)) { n += s.count; v += s.price * s.count * BUYLIST; } return { n, v }; }
  function dumpBulk() { // sells every non-hit single, no log or save; returns { n, v }
    const b = bulkValue(); if (!b.n) return b;
    for (const [k, s] of Object.entries(state.singles)) if (isBulk(s)) delete state.singles[k];
    state.cash += b.v; state.earned.singles += b.v;
    return b;
  }
  function sellBulk() {
    const { n, v } = dumpBulk(); if (!n) return 0;
    log(`散卡 ${n} 张打包卖给同行`, 'gain', v);
    emit(); return v;
  }

  // ---------- shop: customers, display case, trophy, upgrades ----------
  function toCase(key: string, pct = 1) { // one copy of a hit from singles into the case, no log or save
    const c = state.singles[key];
    if (!c || state.shown.length >= slots() || !S.HITS.includes(c.kind)) return false;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.shown.push({ key, ...card, pct });
    return true;
  }
  function list(key: string) { if (!toCase(key)) return false; emit(); return true; }
  function unlist(i: number) {
    const c = state.shown.splice(i, 1)[0]; if (!c) return;
    const { key, pct, ...card } = c;
    (state.singles[key] ||= { ...card, count: 0 }).count++;
    emit();
  }
  function setCardPrice(i: number, pct: number) { if (state.shown[i]) { state.shown[i].pct = clampPct(pct); emit(); } }
  function setTrophy(key: string) {
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
  const upgradeCost = (k: string): number | undefined => UPGRADES[k].costs[lvl(k)];  // undefined once maxed
  const skillCost = (k: string) => skill(k) < SKILLS[k].max ? Math.round(SKILLS[k].base * SKILLS[k].grow ** skill(k)) : undefined;
  const canLearn = (k: string) => k !== 'apprentice' || lvl('clerk') > 0;
  function learn(k: string) {
    const cost = skillCost(k);
    if (cost == null || state.cash < cost || !canLearn(k)) return false;
    state.cash -= cost; state.skills[k] = skill(k) + 1;
    log(`技能：${SKILLS[k].name} Lv${skill(k)}（${SKILLS[k].fx(skill(k))}）`, '', -cost);
    emit(); return true;
  }
  function upgrade(k: string) {
    const cost = upgradeCost(k);
    if (cost == null || state.cash < cost) return false;
    state.cash -= cost; state.up[k] = lvl(k) + 1;
    if (k === 'clerk' && lvl(k) === 1) for (const s of SETS) if (shelfQty(s.id) || state.stock[s.id] || state.opened[s.id]) state.auto[s.id] = true;
    log(`升级：${UPGRADES[k].name} Lv${lvl(k)}`, '', -cost);
    emit(); return true;
  }

  // ---------- customers ----------
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const lognorm = (median: number, sigma: number) => median * Math.exp(sigma * gauss());
  const pickW = <T,>(items: T[], w: (it: T) => number) => { let x = random() * items.reduce((a, it) => a + w(it), 0); return items.find(it => (x -= w(it)) < 0) || items[0]; };
  const typeWeight = (t: string) => TYPES[t].w * (t === 'collector' ? 1 + 0.15 * lvl('signage') + 3 * trophyBonus() : t === 'seeker' ? 1 + 0.15 * lvl('signage') : 1);
  // Highest share of market this customer will pay: the type's mean, plus signage, plus (collectors) the trophy, plus personal spread.
  const tolOf = (t: string) => Math.max(0.5, TYPES[t].tol + (t === 'flipper' ? 0 : SIGN_STEP * lvl('signage') + SKILLS.talk.step * skill('talk')) + (t === 'collector' ? trophyBonus() * 0.6 : 0) + TYPES[t].sd * gauss());
  const heatW = (id: string) => { const h = state.heat[id]; return h > 1 ? 2 : h < 1 ? 0.5 : 1; };
  // Both record the sale on the visit (what went, at what asking price, for how much) and take the money.
  const sellCard = (i: number, v: Visit) => {
    const c = state.shown.splice(i, 1)[0];
    v.r = 'sold'; v.card = c.name; v.price = c.price; v.pct = cardPct(c); v.gain = cardAsk(c); state.cash += v.gain; state.earned.singles += v.gain;
  };
  const sellPacks = (id: string, n: number, v: Visit) => {
    v.r = 'sold'; v.set = id; v.n = n; v.price = sealedPrice(id); v.pct = pctOf(id); v.gain = ask(id) * n;
    state.shelf[id].qty -= n; state.cash += v.gain; state.earned.sealed += v.gain;
  };
  const balk = (v: Visit, c: Shown, max: number) => { v.r = 'pricey'; v.card = c.name; v.price = c.price; v.pct = cardPct(c); if (v.pct <= max) v.why = 'budget'; };

  // One walk-in customer: picks an errand, looks at what is on the shelf/in the case at what price, buys or leaves, and is
  // kept in state.recent (see Visit). Returns cash taken in. r: 'sold' | 'pricey' (something matched but too dear, or they
  // were short of money) | 'none' (nothing they wanted was for sale).
  function visit() {
    const type = pickW(Object.keys(TYPES), typeWeight), tol = tolOf(type), hits = state.shown;
    const onShelf = SETS.filter(s => shelfQty(s.id) > 0).map(s => s.id), v: Visit = { at: vnow, t: type, r: 'none', max: tol };
    if (type === 'opener') {
      const want = (r => r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(random() * 3))(random());
      let id = pickW(SETS.filter(s => unlocked(s.id)), s => heatW(s.id) * demand(s.id).w).id;
      if (!shelfQty(id) && onShelf.length && random() < 0.5) { v.miss = id; id = pickW(onShelf, i => shelfQty(i)); } // settles for another set
      v.set = id; v.max = tol + demand(id).tol;
      if (shelfQty(id)) {
        const n = Math.min(want, shelfQty(id), Math.floor(lognorm(25 * demand(id).budget, 0.6) / ask(id)));
        if (n >= 1 && pctOf(id) <= v.max) sellPacks(id, n, v); else { v.r = 'pricey'; v.price = sealedPrice(id); v.pct = pctOf(id); if (v.pct <= v.max) v.why = 'budget'; }
      }
    } else if (type === 'flipper') {
      const under = onShelf.filter(id => pctOf(id) <= tol), cheap = under.filter(id => !(state.flipT[id] > vnow)).sort((a, b) => pctOf(a) - pctOf(b))[0];
      const budget = lognorm(300, 0.5);
      if (cheap) { // a low price empties the shelf: they take up to 4–15 packs, then that set is off their list until resold
        const n = Math.min(shelfQty(cheap), Math.floor(budget / ask(cheap)), 4 + Math.floor(random() * 12));
        if (n >= 1) { sellPacks(cheap, n, v); state.flipT[cheap] = vnow + FLIP_COOLDOWN * 1000; }
      }
      if (v.r !== 'sold') {
        const i = hits.findIndex(c => cardPct(c) <= tol && cardAsk(c) <= budget);
        if (i >= 0) sellCard(i, v);
        else if (under.length) { v.r = 'pricey'; v.why = 'cool'; v.set = under[0]; }
        else if (onShelf.length || hits.length) v.r = 'pricey';
      }
    } else if (type === 'seeker') {
      const tier = pickW([0, 1, 2], i => SEEK_W[i]), any = random() < 0.4, sid = pickW(SETS.filter(s => unlocked(s.id)), () => 1).id;
      const fits = hits.map((c, i) => [c, i] as const).filter(([c]) => SEEK[tier].includes(c.kind) && (any || c.set === sid)).sort((a, b) => cardAsk(a[0]) - cardAsk(b[0]));
      const budget = lognorm(60, 0.7);
      v.tier = tier; if (!any) v.set = sid;
      if (!fits.length) { /* nothing of that rarity in the case */ }
      else if (cardPct(fits[0][0]) <= tol && cardAsk(fits[0][0]) <= budget) sellCard(fits[0][1], v);
      else balk(v, fits[0][0], tol);
    } else { // collector
      const budget = lognorm(150, 0.8), big = hits.map((c, i) => [c, i] as const).filter(([c]) => c.price >= BIG_CARD).sort((a, b) => b[0].price - a[0].price);
      const ok = big.find(([c]) => cardPct(c) <= tol && cardAsk(c) <= budget);
      if (ok) sellCard(ok[1], v);
      else if (big.length) balk(v, big[0][0], tol);
    }
    const c = state.cust; c.visits++; if (v.r === 'sold') { c.sold++; state.customers++; } else if (v.r === 'pricey') c.pricey++; else { c.none++; state.lost++; }
    state.recent.unshift(v); state.recent.length = Math.min(state.recent.length, RECENT);
    return v.gain || 0;
  }

  // The clerk (upgrade): tops up the shelf of every set with auto-restock on (buying straight onto it), and at level 2 sells the bulk to peers.
  function clerkWork(acc: { packs: number; spent: number; bulk: number; bulkV: number; listed: number }) {
    const L = lvl('clerk'); if (!L) return;
    if (skill('apprentice')) { // 带徒弟: priciest hits first into the free case slots
      const hits = Object.entries(state.singles).filter(([, c]) => S.HITS.includes(c.kind)).sort((a, b) => b[1].price - a[1].price);
      for (const [k] of hits) { while (toCase(k, SKILLS.apprentice.step)) acc.listed++; if (state.shown.length >= slots()) break; }
    }
    for (const set of SETS) {
      const id = set.id, cap = capacity(), goal = L >= 2 ? cap : Math.ceil(cap / 2), have = shelfQty(id);
      if (!state.auto[id] || have >= goal / 2) continue;
      const n = Math.min(goal - have, Math.floor(state.cash / wholesale(id))), cost = n > 0 ? stockUp(id, n, true) : 0;
      if (cost) { acc.packs += n; acc.spent += cost; }
    }
    if (L >= 2) { const b = dumpBulk(); acc.bulk += b.n; acc.bulkV += b.v; }
  }
  // Dead end guard: no cash for the cheapest pack, nothing on the shelf, nothing to sell. Game setting.
  function bailout() {
    const cheapest = Math.min(...SETS.filter(s => unlocked(s.id)).map(s => wholesale(s.id)));
    if (state.cash >= cheapest || Object.values(state.stock).some(n => n > 0) || Object.values(state.shelf).some(o => o.qty > 0) || Object.keys(state.singles).length || state.shown.length) return false;
    state.cash += BAILOUT; log('货架空了、钱也花光了，亲戚周济', 'gain', BAILOUT); return true;
  }

  // Advances the shop by the wall-clock time since the last call, so background tabs and closed tabs both catch up.
  function tick() {
    const now = clock(), dt = Math.min((now - lastTick) / 1000, offlineCap()); lastTick = now;
    if (dt <= 0) return;
    if (now - state.heatT > HEAT_EVERY * 1000) rollHeat(now);
    const acc = { packs: 0, spent: 0, bulk: 0, bulkV: 0, listed: 0 }, lost0 = state.lost, slice = lvl('clerk') ? CLERK_SLICE : dt;
    let n = 0, revenue = 0, sales = 0;
    for (let left = dt; left > 0; left -= slice) {
      const len = Math.min(slice, left), x = rate() * len, m = Math.floor(x) + (random() < x % 1 ? 1 : 0), t0 = now - left * 1000;
      n += m;
      for (let i = 0; i < m; i++) { vnow = t0 + (i + 0.5) / m * len * 1000; const got = visit(); revenue += got; if (got) sales++; } // spread over the slice
      clerkWork(acc);
    }
    if (acc.packs) log(`店员进货 ${acc.packs} 包`, '', -acc.spent);
    if (acc.bulk) log(`店员把散卡 ${acc.bulk} 张卖给同行`, 'gain', acc.bulkV);
    if (acc.listed) log(`店员把 ${acc.listed} 张闪卡挂进了展示柜`);
    if (dt > 30 && n) { // long absence: one summary instead of a log line per customer
      const o = state.offline ||= { secs: 0, sales: 0, revenue: 0, lost: 0 };
      o.secs += dt; o.sales += sales; o.revenue += revenue; o.lost += state.lost - lost0;
      log(`打烊期间卖出 ${sales} 件`, 'gain', revenue);
    }
    const rescued = bailout();
    if (n || dt > 30 || acc.packs || acc.bulk || acc.listed || rescued) emit(); else save();
  }
  function setAuto(id: string, on: boolean) { state.auto[id] = !!on; emit(); }
  function ackOffline() { state.offline = null; emit(); }

  // 行情: every couple of minutes one unlocked set runs hot (+15% price and twice the demand) and another cold (−10% price, half the demand). Game setting.
  function rollHeat(now: number) {
    const ids = SETS.map(s => s.id).filter(unlocked).sort(() => random() - 0.5);
    state.heat = Object.fromEntries([[ids[0], 1.15], [ids[1], 0.9]].filter(([id]) => id)); state.heatT = now;
  }

  const TITLES: [number, string][] = [[0.99, '欧皇本皇'], [0.9, '欧洲人'], [0.7, '小欧'], [0.3, '平民'], [0.1, '小非'], [0, '非酋']];
  function luck(): Luck {
    if (luckCache) return luckCache;
    const packs = Object.values(state.opened).reduce((a, b) => a + b, 0);
    // Expected value and percentile use the odds each pack was actually opened at (state.packsBy), 手气 included.
    const expected = Object.entries(state.packsBy).reduce((s, [key, n]) => s + n * S.packEV(key), 0);
    // Price basis: the simulated players are priced with today's data, so re-price every card ever pulled the same way
    // (state.pulled is the price at the moment of opening; prices move when data/ is refreshed). Saves from before
    // state.dex existed only have that snapshot.
    const live = state.dexPacks === packs;
    const value = live ? Object.entries(state.dex).reduce((s, [k, d]) => { const [set, n, kind] = k.split('|'); return s + d.c * (S.cardPrice(set, n, kind) ?? d.p); }, 0) : state.pulled;
    const pct = packs ? S.luckPercentile(state.packsBy, value) : null;
    const title = pct == null ? '还没开包' : TITLES.find(([p]) => pct >= p)![1];
    return (luckCache = { packs, pct, title, value, live, expected, cost: state.costOpened, listEV: Object.entries(state.opened).reduce((s, [id, n]) => s + n * setById(id).packPrice, 0),
      boosted: Object.entries(state.packsBy).reduce((s, [key, n]) => s + (S.parseKey(key).m !== 1 ? n : 0), 0) });
  }
  // Expected count of each hit rarity for the packs opened so far, at the odds each was opened with.
  function expectedTally() {
    const e: Record<string, number> = {};
    for (const [key, n] of Object.entries(state.packsBy)) { const { id, m } = S.parseKey(key); for (const [k, p] of Object.entries(S.ratesFor(setById(id), m))) e[k] = (e[k] || 0) + n * p / 100; }
    return e;
  }

  function reset() { state = fresh(); luckCache = null; dexN = null; emit(); }

  return {
    get state() { return state; }, on: (f: () => void) => listeners.push(f),
    buy, shelve, unshelve, setPrice, setCardPrice, open, sell, collect, missing, master, setAuto, dexCount, dexTotal, dexBonusOf, dexBonus, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    list, unlist, setTrophy, clearTrophy, upgrade, upgradeCost, ackOffline, learn, skill, skillCost, canLearn, luckMult, offlineCap,
    demand, lineup, sealedPrice, ask, cardAsk, shelfQty, pctOf, cardPct, capacity, slots, revenue, unlocked, unlockAt, rate, trophyBonus, wholesaleRate, lvl,
    UPGRADES, SKILLS, TYPES, DEMAND, SEEK, BIG_CARD, FLIP_COOLDOWN, DEX_TIERS, MASTER, BUY_R, BAILOUT, BUYLIST, WHOLESALE, WHOLESALE_STEP, ARRIVAL, SIGN_STEP, OFFLINE_CAP, HEAT_EVERY, SHELF_BASE, CASE_BASE, WAREHOUSE, MIN_PCT, MAX_PCT, PCT_STEP,
  };
}
