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
export interface Shelf { id: string | null; qty: number } // one set per shelf; id stays after it sells out (the clerk refills it), null = empty
export interface State {
  cash: number; stock: Record<string, number>; singles: Record<string, Single>; opened: Record<string, number>; tally: Record<string, number>;
  pulled: number; costOpened: number; hits: (Pull & { t: number })[]; earned: { sealed: number; singles: number }; customers: number;
  log: { t: number; text: string; tone: string; amt?: number }[]; shelves: Shelf[]; price: Record<string, number>; // price: asking price per set, share of market
  cust: { visits: number; sold: number; pricey: number; none: number }; recent: Visit[];
  up: Record<string, number>; dex: Record<string, { c: number; p: number }>; dexPacks: number; dexSeen: Record<string, 1>; auto: Record<string, boolean>;
  shown: Shown[]; casePct?: number; trophy: Trophy | null; heat: Record<string, number>; heatT: number; lost: number; savedAt: number; flipT: Record<string, number>; clerkT: number; // clerkT: when the clerk's next round is due
  skills: Record<string, number>; packsBy: Record<string, number>; // packsBy: packs opened per S.rateKey (set + the 手气 odds they were opened at)
  miss: Record<string, number[]>; // per set: when a pack buyer came for it and it was on no shelf (last MISS_WINDOW only), so the shelf page can say who to make room for
  offline: { secs: number; sales: number; revenue: number; lost: number; bills?: number; borrowed?: number } | null; // bills / borrowed: paid to 九姐 / borrowed while away
  ach: Record<string, number>; feat: Record<string, number>; // 成就 (src/achievements.ts owns both): id → when stamped; its counters (streaks, bests)
  branch: Branch;
  // 债务 (GAMEPLAY.md): owe = what is left of the opening debt (paid in weekly installments, no interest), loan = what was
  // borrowed (compounds weekly), debt = owe + loan (the one number the story reads). week = the week whose bill comes next;
  // shopT = the bill clock, seconds since this shop opened (a closed stretch adds one week at most); overdue = a bill that fell due short of cash, with
  // the shop time its grace runs out; wreck = the 破产 statement, shown until acknowledged.
  debt: number; owe: number; loan: number; week: number; shopT: number; billsPaid: number; loans: Loan[];
  overdue: { week: number; amount: number; inst: number; until: number } | null; best: number; weekRev0: number; wreck: Wreck | null;
}
export interface Loan { at: number; week: number; amount: number; forced: boolean }
export interface Wreck { at: number; week: number; shop: number; debt: number; cash: number; goods: number; cards: number; revenue: number }
// 开分店 (prestige): n = shops opened after the first; fame = 名气 not yet spent, got = all ever earned; life = revenue of the
// shops before this one; perks = 名气 perk levels. Survives every branch; only 清空存档 clears it.
export interface Branch { n: number; fame: number; got: number; life: number; perks: Record<string, number>; broke?: number; hands?: number } // broke = bankruptcies, ever (征信); hands = 亲手开齐 sets already paid in 名气
export interface Luck { packs: number; pct: number | null; title: string; value: number; live: boolean; expected: number; cost: number; listEV: number; boosted: number }
export interface GameEnv { now?: () => number; random?: () => number; storage?: Pick<Storage, 'getItem' | 'setItem'> | null } // storage null = never saved (autoplay: stringifying the save was 70% of its time)
export type Game = ReturnType<typeof createGame>;
// type = a debt event for the story (bill_due / bill_paid / bill_missed / loan_taken / bankrupt / story), with the bill's week and amount.
export interface GameEvent { open?: Pull[][]; type?: string; week?: number; amount?: number; id?: string; forced?: boolean; set?: string } // what happened, for listeners that need more than the new state (achievements.ts)

export function createGame({ now: clock = Date.now, random = Math.random, storage }: GameEnv = {}) {
  // Touched lazily inside try/catch, so a browser with storage blocked still plays (unsaved).
  const store = storage === null ? { getItem: () => null, setItem() {} } : storage ?? { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) };
  const SAVE_KEY = 'ptcg-shop-v1';
  // Game settings (invented, not market data — shown as such in the UI footer):
  const WHOLESALE = 0.72;        // distributor price as a share of the current market pack price (supplier upgrades lower it)
  const WHOLESALE_STEP = 0.03;   // per supplier level
  const BUYLIST = 0.7;           // what a fellow shop pays for your singles, share of market
  const START_CASH = 1000;
  const ARRIVAL = 0.5;          // walk-ins per second before 口碑; each one is an individual with an errand (see TYPES)
  const WAREHOUSE = 200;         // packs per set the back room holds; only shelf packs are for sale
  const MIN_PCT = 0.6, MAX_PCT = 1.6, PCT_STEP = 0.05; // asking price as a share of market, for shelf packs and case singles
  // The case's tag before you touch it (a card's asking price, share of market). Case browsers outnumber the hits a shop pulls
  // by far (late game ~30 a minute against ~4 from 10 packs a minute), so a card sells whatever it is listed at: 110% sits under
  // the mean ceiling of seekers (112%) and collectors (122%). Game setting.
  const CASE_PCT = 1.1;
  const DEFAULT_PCT = 0.95; // a set's tag before you touch it: under market, because the cheapest-shopping set (sv08, mean ceiling 100%) loses half its buyers at 100% on a cold day
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
    me03: { tag: '便宜没大卡', w: 0.9, tol: -0.04, budget: 0.8, crowd: 0.1 }, // cheapest Mega set, its best cards (Meowth ex SIR, Mega Zygarde MHR) only ~$100: bought on price
    me04: { tag: '追忍蛙', w: 1.2, tol: 0.08, budget: 1.3, crowd: 0.1 },     // Mega Greninja ex SIR and MHR (~$150 each): fans pay a little over market
    me05: { tag: '新品上市', w: 1.3, tol: 0.03, budget: 1, crowd: 0.1 },     // newest release (Mega Darkrai ex): the most asked-for set, at a normal price
  };
  const FLIP_COOLDOWN = 600;              // seconds: after a flipper buys a set's packs, nobody flips that set again until they resold
  const SEEK = [['RR', 'ACE', 'PB'], ['UR', 'IR', 'MB'], ['SIR', 'HR', 'MHR']]; // what seekers ask for: one card of a rarity tier, from a given set (or any)
  const SEEK_W = [50, 35, 15];
  const BIG_CARD = 12;                    // collectors only look at case cards worth at least this much
  const SIGN_STEP = 0.04;                 // signage: customers pay +4% more per level, and more seekers/collectors come
  // 统一货架: the shop has RACK_BASE shelves (+1 per 货架 level, up to one per set), each holds one set, DEPTH_BASE packs deep
  // (+DEPTH_STEP per 加层 level). More shelves = more sets on sale at once (openers who find their set buy it; the rest only
  // settle half the time); deeper shelves = longer before a shelf sells out, while you are away or between the clerk's rounds.
  const RACK_BASE = 3, DEPTH_BASE = 40, DEPTH_STEP = 40;
  const CASE_BASE = 3, CASE_STEP = 2;     // display-case slots
  const OFFLINE_CAP = 6 * 3600;           // seconds of closed-shop time credited on return, with a clerk minding the shop (看店 adds more)
  const NOCLERK_CAP = 3600;               // without a clerk nobody minds the shop: at most an hour is credited (sales and the bill clock alike)
  // 债务 (game setting, derivation in GAMEPLAY.md). A week is WEEK seconds of shop time while the page is open; a closed stretch
  // (sales credited up to offlineCap) moves the bill clock one week at most: 九姐 calls once while you are away. Shop n (0 = the first) owes
  // DEBT0 × (1 + DEBT_STEP·n); week w's bill is BILL0 × (1 + DEBT_STEP·n) × BILL_G^(w−1), capped at what is left, plus whatever
  // the loan has grown past the credit line. A bill short of cash gets GRACE seconds; then it is borrowed, or the shop goes bankrupt.
  // Loans compound LOAN_RATE a week (+LOAN_MARK per past bankruptcy, up to 3); the credit line is LOAN_K × the shop's best
  // week of revenue, at least LOAN_FLOOR × (1 + DEBT_STEP·n).
  const WEEK = 20 * 60, GRACE = 5 * 60;
  const DEBT0 = 40000, BILL0 = 300, BILL_G = 1.12, DEBT_STEP = 0.5;
  const LOAN_RATE = 0.1, LOAN_MARK = 0.05, LOAN_K = 1, LOAN_FLOOR = 3000;
  const HEAT_EVERY = 120;                 // seconds between 行情 rerolls
  // 图鉴: each set's Pokédex fills as you pull new card numbers (selling a card never un-collects it).
  // Reaching a share of a set's cards permanently raises walk-in traffic. Game setting; steps sum to +38% per set.
  const DEX_TIERS: [number, number][] = [[0.25, 0.02], [0.5, 0.03], [0.75, 0.05], [0.9, 0.08], [1, 0.2]];
  // Hits (RR and up) can also be bought from other shops at market price, into the binder only; C/U/R only come from packs.
  const BUY_R = ['RR', 'ACE', 'UR', 'IR', 'SIR', 'HR', 'MHR'];
  // 亲手开出: the same 图鉴, counting only card numbers pulled from a pack (state.dex, which every shop and bankruptcy keeps), not
  // bought. Every card of every set can be pulled at the measured odds, so it is the long line after 大师套 (one sample: 766–6,787
  // packs per set, about 24k for all ten). Pulling a whole set by hand earns HAND_FAME 名气, once per set, ever, paid out at the next
  // 开分店 (never mid-shop: 名气 spent on perks at once would make heavy opening pay for itself inside one shop). Game setting.
  const HAND_FAME = 2;
  const MASTER = { tol: 0.1, w: 1.5 };    // 大师套 (a set's dex at 100%): its pack buyers pay +10% more, and 1.5× as many come for it
  const BAILOUT = 300;                    // a shop with no cash, stock or cards to sell is lent this much (soft-lock guard; bankrupt if there is no credit left)
  const CLERK_SLICE = 30;                 // seconds per catch-up step while a clerk is restocking (so a closed shop keeps being restocked)
  const MISS_WINDOW = 600;                // 货柜 page: walk-ins (state.recent) and pack buyers who found their set missing (state.miss) are both kept for exactly this long, by time, so the two counts cover the same customers
  const CLERK_KEEP = 10;                  // packs of a set the clerk leaves in the back room for the player to open (one 开 10 包)
  const CLERK_ROUND = 300;                // the clerk goes round the shelves every 5 minutes: a shelf has to last until the next round (why 加层 pays late)
  // 客流上限: the word-of-mouth multiplier (图鉴口碑 × 新系列) counts in full up to CROWD_KNEE, and past it with diminishing
  // returns toward CROWD_KNEE + room(), room = CROWD_ROOM + ROOM_STEP per 店面扩建 level. Game setting, so the late shop keeps
  // growing without traffic running away; 店面扩建 is the open-ended place late cash goes (cost ×1.45 a level, the gain shrinks).
  // 人气 multiplies outside the cap, like 老主顾: it has a max level, and a level bought is the walk-ins it says (inside the cap,
  // a collector's 人气 Lv6 added +0.7%).
  const CROWD_KNEE = 1.4, CROWD_ROOM = 1, ROOM_STEP = 0.15;
  // Scale (game setting): the shop trades in volume (ARRIVAL, baskets, shelf depth), so every price the shop pays for growth —
  // upgrades, skills, unlock thresholds — is COST_X times its old list; market prices of packs and cards are never scaled.
  const COST_X = 4;
  const UNLOCK: Record<string, number> = { 'sv08.5': 400, 'sv03.5': 2000, sv09: 10000, me01: 25000, me02: 60000, me03: 100000, me04: 160000, me05: 250000 }; // ×COST_X below // lifetime revenue needed before a set can be stocked
  const UPGRADES: Record<string, { name: string; desc: string; costs: number[] }> = {
    signage:  { name: '招牌', desc: `顾客肯多付 +${SIGN_STEP * 100}% / 级，更多收藏党和找卡的`, costs: [120, 260, 570, 1250, 2750].map(c => c * COST_X) },
    racks:    { name: '货架', desc: '多一个货架，可以多摆一个系列', costs: SETS.slice(RACK_BASE).map((_, i) => Math.round(200 * 1.6 ** i / 10) * 10 * COST_X) }, // up to one per set: a second shelf of a set is only more depth
    depth:    { name: '加层', desc: `每个货架多放 ${DEPTH_STEP} 包`, costs: [80, 160, 320, 640].map(c => c * COST_X) },
    case:     { name: '展示柜', desc: `多 ${CASE_STEP} 个柜位`, costs: [150, 330, 730, 1600].map(c => c * COST_X) },
    supplier: { name: '进货渠道', desc: `进货价再低 ${WHOLESALE_STEP * 100} 个百分点`, costs: [300, 750, 1900, 4700].map(c => c * COST_X) },
    expand:   { name: '店面扩建', desc: `口碑客流的上限 +${ROOM_STEP}`, costs: Array.from({ length: 12 }, (_, i) => Math.round(2000 * 1.55 ** i / 100) * 100 * COST_X) },
    clerk:    { name: '店员', desc: `每 ${CLERK_ROUND / 60} 分钟巡一次货架，自动进货补到半满（含打烊时）；仓库里的货随时搬上架（留 ${CLERK_KEEP} 包给你拆）；2 级：补满，并把散卡卖给同行`, costs: [500, 2600].map(c => c * COST_X) }, // ponytail: no wage; add one if cash piles up unspent
  };
  // 技能: the long-term money sink, levelled with cash. Level L+1 costs base × grow^L. step = the effect of one level (see fx).
  // 手气 multiplies the hit rates a pack is opened with; the measured rates in sets.ts are never touched, and every pack is
  // recorded with the odds it was opened at, so 欧气检测 compares it with packs opened at the same odds.
  const SKILLS: Record<string, { name: string; group: string; desc: string; max: number; base: number; grow: number; step: number; fx: (lv: number) => string }> = {
    luck: { name: '手气', group: '幸运', desc: '开包时闪卡（RR 及以上）的概率乘系数，官方概率不变', max: 5, base: 400 * COST_X, grow: 2.2, step: 0.05, fx: lv => `闪卡概率 ×${S.roundM(1 + 0.05 * lv).toFixed(2)}` },
    talk: { name: '口才', group: '经营', desc: '顾客肯付的上限（倒爷除外）', max: 10, base: 250 * COST_X, grow: 1.5, step: 0.02, fx: lv => `肯多付 +${Math.round(2 * lv)} 个百分点` },
    crowd: { name: '人气', group: '经营', desc: '进店人数，乘在口碑客流外面，不受客流上限递减', max: 10, base: 300 * COST_X, grow: 1.5, step: 0.1, fx: lv => `进店 +${Math.round(10 * lv)}%` },
    watch: { name: '看店', group: '经营', desc: '打烊期间最多结算多久（要先雇店员，没店员一律 1 小时）', max: 3, base: 600 * COST_X, grow: 2.5, step: 2, fx: lv => `最多 ${OFFLINE_CAP / 3600 + 2 * lv} 小时` },
    apprentice: { name: '带徒弟', group: '经营', desc: '店员随时把单卡库存里最贵的闪卡挂进空柜位（要先雇店员）', max: 1, base: 800 * COST_X, grow: 1, step: 0, fx: lv => lv ? '柜位一空就补，按展示柜标价' : '不上柜' },
  };

  // 开分店 (prestige), game setting: once this shop's debt is paid (九姐 has no claim left) you can start over in a new shop for
  // 名气 = floor(sqrt(revenue / FAME_UNIT)) (500k → 6, 1M → 8, 2M → 12), spent on the permanent perks below. The new shop
  // starts from zero (cash, stock, shelves, upgrades, skills, revenue, so the later sets lock again) and owes that shop's
  // opening debt (DEBT_STEP above); the binder, 图鉴, achievements and the whole 欧气 record come along. Every perk has a max
  // level, so the carry-over is bounded. Perk level L+1 costs base + L 名气.
  const FAME_UNIT = 12500;
  const SEED_STEP = 1000, REG_STEP = 0.25, ACCESS_STEP = 0.15;
  const PERKS: Record<string, { name: string; group: string; desc: string; max: number; base: number; fx: (lv: number) => string }> = {
    seed: { name: '老本', group: '经营', desc: '每开一家新店，起步资金多一些（不算营业额）', max: 3, base: 1, fx: lv => `起步 $${(START_CASH + SEED_STEP * lv).toLocaleString('en-US')}` },
    fit: { name: '旧货架', group: '经营', desc: '老店的货架和层板搬过来：新店开张就有这么多级「货架」和「加层」', max: 3, base: 2, fx: lv => lv ? `开张就是货架、加层 Lv${lv}` : '空店开张' },
    regulars: { name: '老主顾', group: '经营', desc: '老店的熟客跟着来：基础进店人数上调，在客流上限之外单算', max: 4, base: 1, fx: lv => `基础客流 +${Math.round(REG_STEP * 100 * lv)}%` },
    access: { name: '门路', group: '经营', desc: '批发商认得你：后面的系列用更少的营业额解锁', max: 4, base: 1, fx: lv => `解锁门槛 ×${(1 - ACCESS_STEP * lv).toFixed(2)}` },
    hire: { name: '老店员', group: '经营', desc: '新店开张就有 1 级店员，所有系列勾好自动补货', max: 1, base: 3, fx: lv => lv ? '开张就有店员' : '要自己雇' },
    luck: { name: '手气底子', group: '幸运', desc: '技能「手气」的上限多一级，官方概率不变', max: 2, base: 4, fx: lv => `手气最高 ×${S.roundM(1 + SKILLS.luck.step * (SKILLS.luck.max + lv)).toFixed(2)}` },
  };

  const setById = (id: string) => SETS.find(s => s.id === id)!;
  const lvl = (k: string) => state.up[k] || 0;
  const skill = (k: string) => state.skills[k] || 0;
  const perk = (k: string) => state.branch.perks[k] || 0;
  const skillMax = (k: string) => SKILLS[k].max + (k === 'luck' ? perk('luck') : 0);
  const luckMult = () => S.roundM(1 + SKILLS.luck.step * skill('luck'));
  const offlineCap = () => lvl('clerk') ? OFFLINE_CAP + SKILLS.watch.step * 3600 * skill('watch') : NOCLERK_CAP;
  const wholesaleRate = () => WHOLESALE - WHOLESALE_STEP * lvl('supplier');
  const wholesale = (id: string) => Math.round(setById(id).packPrice * wholesaleRate() * 100) / 100;
  const sealedPrice = (id: string) => Math.round(setById(id).packPrice * (state.heat[id] || 1) * 100) / 100;
  const racks = () => RACK_BASE + lvl('racks');
  const depth = () => DEPTH_BASE + DEPTH_STEP * lvl('depth');
  const shelves = () => { while (state.shelves.length < racks()) state.shelves.push({ id: null, qty: 0 }); return state.shelves; }; // padded here, so a level set any way shows up
  const slots = () => CASE_BASE + CASE_STEP * lvl('case');
  const revenue = () => state.earned.sealed + state.earned.singles;
  const unlockAt = (id: string) => Math.round((UNLOCK[id] || 0) * COST_X * (1 - ACCESS_STEP * perk('access')));
  const unlocked = (id: string) => revenue() >= unlockAt(id);
  const trophyBonus = () => state.trophy ? state.trophy.price / (state.trophy.price + 150) * 0.5 : 0; // 0..0.5, more for pricier cards
  const shelfQty = (id: string) => shelves().reduce((a, s) => a + (s.id === id ? s.qty : 0), 0);
  const facings = (id: string) => shelves().filter(s => s.id === id && s.qty > 0).length;
  const pctOf = (id: string) => state.price[id] ?? DEFAULT_PCT;
  const ask = (id: string) => Math.round(sealedPrice(id) * pctOf(id) * 100) / 100;
  const cardPct = (c: { pct?: number }) => c.pct ?? 1;
  const casePct = () => state.casePct ?? CASE_PCT;
  const cardAsk = (c: Shown) => Math.round(c.price * cardPct(c) * 100) / 100;
  const dexTotal = (id: string) => DATA[id].cards.length;
  const dexCount = (id: string) => (dexN ||= Object.keys(state.dexSeen).reduce((a, k) => { const s = k.split('|')[0]; a[s] = (a[s] || 0) + 1; return a; }, {} as Record<string, number>))[id] || 0;
  const dexShare = (id: string) => dexCount(id) / dexTotal(id);
  const master = (id: string) => dexCount(id) >= dexTotal(id);
  // distinct card numbers of each set in state.dex (keys set|n|kind; energy is not a card of the set), cleared when a new key appears
  const hand = (id: string) => (handN ||= Object.keys(state.dex).reduce((a, k) => { const [s, n] = k.split('|'); if (n !== 'E') (a[s] ||= new Set()).add(n); return a; }, {} as Record<string, Set<string>>))[id];
  const handCount = (id: string) => hand(id)?.size || 0;
  const handDone = (id: string) => handCount(id) >= dexTotal(id);
  // Chance that one pack at 手气 m holds card n in any printing: per slot, the chance its rarity roll lands on a pool holding n, over that pool's size.
  const odds = new Map<string, number>(); // pure in (set, card, m): memoised, the 图鉴 panel asks for every missing card on each render
  function cardOdds(id: string, n: string, m = luckMult()) {
    const k = `${id}|${n}|${m}`, hit = odds.get(k); if (hit != null) return hit;
    const P = S.poolsFor(id), t = S.slotTables(setById(id), m), has = (k: string) => P[k]?.some(c => c.n === n) ? 1 / P[k].length : 0;
    const slot = (table: Record<string, number>, base: string) => { let rest = 100, p = 0; for (const k in table) { p += table[k] / 100 * has(k); rest -= table[k]; } return p + rest / 100 * has(base); };
    const miss = (1 - has('C')) ** 4 * (1 - has('U')) ** 3 * (1 - slot(t.rev1, 'REV')) * (1 - slot(t.rev2, 'REV')) * (1 - slot(t.rare, 'R'));
    odds.set(k, 1 - miss); return 1 - miss;
  }
  // Cards of a set not yet pulled by hand, rarest first, with the packs one takes on average at today's 手气.
  const handMissing = (id: string) => { const have = hand(id);
    return DATA[id].cards.filter(c => !have?.has(c.n)).map(c => ({ n: c.n, name: c.name, r: c.r, packs: 1 / cardOdds(id, c.n) })).sort((a, b) => b.packs - a.packs); };
  const demand = (id: string) => { const d = DEMAND[id] || { tag: '', w: 1, tol: 0, budget: 1 }; return master(id) ? { ...d, tol: d.tol + MASTER.tol, w: d.w * MASTER.w } : d; };
  const dexBonusOf = (id: string) => DEX_TIERS.reduce((a, [at, b]) => a + (dexShare(id) >= at - 1e-9 ? b : 0), 0);
  const dexBonus = () => SETS.reduce((a, s) => a + dexBonusOf(s.id), 0);
  const lineup = () => SETS.reduce((a, s) => a + (unlocked(s.id) ? DEMAND[s.id]?.crowd || 0 : 0), 0);
  const crowdRaw = () => (1 + dexBonus()) * (1 + lineup()); // 图鉴 word of mouth × new sets, before the cap
  const room = () => CROWD_ROOM + ROOM_STEP * lvl('expand');
  const crowdCap = () => CROWD_KNEE + room();
  const crowdMult = (raw = crowdRaw()) => raw <= CROWD_KNEE ? raw : CROWD_KNEE + (raw - CROWD_KNEE) / (1 + (raw - CROWD_KNEE) / room());
  const rate = () => ARRIVAL * (1 + REG_STEP * perk('regulars')) * (1 + SKILLS.crowd.step * skill('crowd')) * crowdMult(); // walk-ins per second; 老主顾 and 人气 sit outside the cap (each has its own max)
  const fresh = (): State => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [], shelves: [], price: {}, cust: { visits: 0, sold: 0, pricey: 0, none: 0 }, recent: [],
    up: {}, dex: {}, dexPacks: 0, dexSeen: {}, auto: {}, shown: [], trophy: null, heat: {}, heatT: 0, lost: 0, savedAt: clock(), offline: null, flipT: {}, clerkT: 0, skills: {}, packsBy: {}, miss: {}, ach: {}, feat: {}, branch: { n: 0, fame: 0, got: 0, life: 0, perks: {} },
    debt: DEBT0, owe: DEBT0, loan: 0, week: 1, shopT: 0, billsPaid: 0, loans: [], overdue: null, best: 0, weekRev0: 0, wreck: null });

  let migrated = false, state = load(), luckCache: Luck | null = null, lastTick = state.savedAt, vnow = lastTick, dexN: Record<string, number> | null = null, handN: Record<string, Set<string>> | null = null; // dexN: per-set dex counts, cleared when dexSeen changes // first tick after load credits the time the tab was closed
  const listeners: ((ev?: GameEvent) => void)[] = [];
  const emit = (ev?: GameEvent) => { save(); listeners.forEach(f => f(ev)); };
  // Debt events raised inside tick() wait here and go out one emit each once the tick is done.
  let pending: GameEvent[] = [];
  const flush = () => { const evs = pending; pending = []; evs.forEach(emit); return evs.length > 0; };
  // A pre-债务 save's first tick credits the closed time as usual, but its bill clock starts now: the first bill is a full week away.
  if (migrated) state.shopT = -Math.max(0, Math.min((clock() - state.savedAt) / 1000, offlineCap()));

  function load(): State {
    try { const s = JSON.parse(store.getItem(SAVE_KEY)!); if (s && typeof s.cash === 'number') {
        const st = { ...fresh(), ...s };
        if (!s.shelves) {
          let old = s.shelf;
          if (!old) { old = Object.fromEntries(Object.entries(st.stock as State['stock']).map(([id, n]) => [id, { qty: n, pct: 1 }])); st.stock = {}; } // pre-storefront saves: everything was on sale
          unify(st, old);
        }
        if (s.week == null) { migrated = true; st.owe = st.debt = Math.round(DEBT0 * (1 + DEBT_STEP * st.branch.n)); } // pre-债务 saves: 九姐 turns up now
        if (!s.packsBy) st.packsBy = { ...st.opened }; // pre-手气 saves: every pack was opened at the measured odds
        st.recent = st.recent.filter((v: Visit) => v.at); // pre-顾客流水 saves kept each walk-in as a line of text only
        return st;
      } } catch {}
    return fresh();
  }
  // Pre-统一货架 saves had one shelf per set ({ qty, pct }) and a 货架 level that deepened all of them. Each set that was on sale
  // gets a shelf of its own (货架 level = sets − RACK_BASE), the old level becomes 加层, and packs that do not fit go to the back room,
  // even past its cap: nothing is lost. Prices carry over.
  function unify(st: State & { shelf?: unknown }, old: Record<string, { qty: number; pct: number }>) {
    const used = Object.entries(old).filter(([, o]) => o.qty > 0), max = (k: string) => UPGRADES[k].costs.length;
    st.up = { ...st.up, racks: Math.min(max('racks'), Math.max(0, used.length - RACK_BASE)), depth: Math.min(max('depth'), st.up.shelf || 0) }; delete st.up.shelf;
    const deep = DEPTH_BASE + DEPTH_STEP * st.up.depth, n = RACK_BASE + st.up.racks;
    st.price = Object.fromEntries(Object.entries(old).map(([id, o]) => [id, o.pct])); st.shelves = [];
    used.forEach(([id, o], i) => { const k = i < n ? Math.min(o.qty, deep) : 0; if (k) st.shelves.push({ id, qty: k }); st.stock[id] = (st.stock[id] || 0) + o.qty - k; });
    delete st.shelf;
  }
  function save() { state.savedAt = clock(); if (storage === null) return; try { store.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }
  function log(text: string, tone = '', amt?: number) { state.log.unshift({ t: clock(), text, tone, amt }); state.log.length = Math.min(state.log.length, 40); }

  // Moves cash into stock (back room, or straight onto a shelf for the clerk) without logging or saving; returns the cost.
  function stockUp(id: string, n: number, shelf?: Shelf) {
    if (!unlocked(id)) return 0;
    n = Math.min(n, shelf ? depth() - shelf.qty : WAREHOUSE - (state.stock[id] || 0));
    const cost = wholesale(id) * n;
    if (n <= 0 || state.cash < cost - 1e-6) return 0;
    state.cash -= cost;
    if (shelf) shelf.qty += n; else state.stock[id] = (state.stock[id] || 0) + n;
    return cost;
  }
  function buy(id: string, n: number) {
    const before = state.stock[id] || 0, cost = stockUp(id, n);
    if (!cost) return false;
    log(`进货 ${setById(id).name} ×${state.stock[id] - before}`, '', -cost);
    emit(); return true;
  }
  // Shelves: only packs on a shelf are sold to customers. Moves up to n packs between the back room and the set's shelves; no save.
  function fill(id: string, n: number) {
    let left = Math.min(n, state.stock[id] || 0);
    for (const s of shelves()) if (s.id === id) { const k = Math.min(left, depth() - s.qty); s.qty += k; left -= k; }
    const moved = Math.min(n, state.stock[id] || 0) - left; state.stock[id] -= moved; return moved;
  }
  // A set put on a shelf is one the clerk restocks, unless the player turned that off for it.
  const label = (s: Shelf, id: string | null) => { s.id = id; if (id && state.auto[id] == null && lvl('clerk')) state.auto[id] = true; };
  // Fills the shelves this set already has; a set with none takes the first empty shelf. More shelves for one set: place().
  function shelve(id: string, n: number) {
    if (!(state.stock[id] > 0)) return false;
    if (!shelves().some(s => s.id === id)) { const free = shelves().find(s => !s.id); if (free) label(free, id); }
    if (!fill(id, n)) return false;
    emit(); return true;
  }
  function unshelve(id: string, n: number) { // back to the back room (while it has room); the shelves keep their set
    let left = Math.min(n, shelfQty(id), WAREHOUSE - (state.stock[id] || 0)); const moved = left;
    for (const s of shelves()) if (s.id === id) { const k = Math.min(left, s.qty); s.qty -= k; left -= k; }
    if (moved <= 0) return false;
    state.stock[id] = (state.stock[id] || 0) + moved;
    emit(); return true;
  }
  // Puts set id on shelf i (null clears it): what was there goes back to the back room, then the shelf is filled from it.
  function place(i: number, id: string | null) {
    const s = shelves()[i]; if (!s || (id && !unlocked(id))) return false;
    if (s.qty && s.id !== id) { const back = s.id!; if ((state.stock[back] || 0) + s.qty > WAREHOUSE) return false; state.stock[back] = (state.stock[back] || 0) + s.qty; s.qty = 0; }
    label(s, id);
    if (id) { const k = Math.min(state.stock[id] || 0, depth() - s.qty); s.qty += k; state.stock[id] = (state.stock[id] || 0) - k; }
    emit(); return true;
  }
  const clampPct = (p: number) => Math.round(Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, p)) / PCT_STEP) * PCT_STEP * 100) / 100;
  // commit = false while the price rail is being dragged: the tag moves, nothing re-renders or saves until the pointer lets go.
  function setPrice(id: string, pct: number, commit = true) { state.price[id] = clampPct(pct); if (commit) emit(); }

  function open(id: string, n: number) {
    n = Math.min(n, state.stock[id] || 0);
    if (!n) return [];
    state.stock[id] -= n;
    const packs = [], dex0 = dexBonusOf(id), had = dexCount(id), hand0 = handDone(id), m = luckMult(), key = S.rateKey(id, m);
    for (let i = 0; i < n; i++) {
      const pack = S.openPack(id, random, m);
      packs.push(pack);
      state.pulled += S.packValue(pack);
      for (const c of pack) {
        if (c.r !== 'E' && !state.dexSeen[`${c.set}|${c.n}`]) { state.dexSeen[`${c.set}|${c.n}`] = 1; dexN = null; }
        const key = `${c.set}|${c.n}|${c.kind}`;
        (state.singles[key] ||= { ...c, count: 0 }).count++;
        if (!state.dex[key]) handN = null;
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
    if (!hand0 && handDone(id)) {
      log(`亲手开齐：${setById(id).name} ${dexTotal(id)} 张全是自己开出来的。开下一家店时名气 +${HAND_FAME}`, 'hit');
      pending.push({ type: 'story', id: 'hand', set: id });
    }
    const best = packs.flat().reduce((a, b) => (b.price > a.price ? b : a));
    log(`开了 ${n} 包${setById(id).name}，最贵：${best.name} $${best.price.toFixed(2)}`, S.HITS.includes(best.kind) ? 'hit' : '');
    emit({ open: packs }); flush(); return packs;
  }

  const dexLog = (id: string, before: number) => { if (dexBonusOf(id) > before) log(master(id)
    ? `大师套：${setById(id).name} 收齐了！回头客 +${Math.round(dexBonusOf(id) * 100)}%${crowdRaw() > CROWD_KNEE ? `（全店客流过 ×${CROWD_KNEE} 后递减，现在 ×${crowdMult().toFixed(2)}）` : ''}，这个系列的拆包玩家肯多付 ${MASTER.tol * 100}%`
    : `图鉴：${setById(id).name} 收录 ${Math.round(dexShare(id) * 100)}%，客流加成 +${Math.round(dexBonusOf(id) * 100)}%${crowdRaw() > CROWD_KNEE ? `（全店过 ×${CROWD_KNEE} 后递减，现在 ×${crowdMult().toFixed(2)}）` : ''}`, 'hit'); };

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
  function toCase(key: string, pct = casePct()) { // one copy of a hit from singles into the case, no log or save
    const c = state.singles[key];
    if (!c || state.shown.length >= slots() || !S.HITS.includes(c.kind)) return false;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.shown.push({ key, ...card, pct });
    return true;
  }
  function list(key: string) { if (!toCase(key)) return false; emit(); return true; }
  // 补满柜位 (and 带徒弟, every tick): hits from singles into the free case slots, priciest first, at the case tag. Returns how many.
  // Which card goes first hardly matters: case browsers outnumber the hits, so every listed card sells (measured, see CASE_PCT).
  function stockCase() {
    let n = 0; if (state.shown.length >= slots()) return 0;
    const hits = Object.entries(state.singles).filter(([, c]) => S.HITS.includes(c.kind)).sort((a, b) => b[1].price - a[1].price);
    for (const [k] of hits) { while (toCase(k)) n++; if (state.shown.length >= slots()) break; }
    return n;
  }
  function fillCase() { const n = stockCase(); if (n) emit(); return n; }
  function unlist(i: number) {
    const c = state.shown.splice(i, 1)[0]; if (!c) return;
    const { key, pct, ...card } = c;
    (state.singles[key] ||= { ...card, count: 0 }).count++;
    emit();
  }
  function setCardPrice(i: number, pct: number) { if (state.shown[i]) { state.shown[i].pct = clampPct(pct); emit(); } }
  // The case tag: every card in the case and every card listed from now on. commit = false while its rail is dragged.
  function setCasePct(pct: number, commit = true) { state.casePct = clampPct(pct); for (const c of state.shown) c.pct = state.casePct; if (commit) emit(); }
  function setTrophy(key: string) {
    const c = state.singles[key]; if (!c) return false;
    const old = state.trophy;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.trophy = { key, ...card };
    if (old) { const { key: k, ...o } = old; (state.singles[k] ||= { ...o, count: 0 }).count++; }
    log(`镇店之宝：${card.name}，来的收藏党 +${Math.round(trophyBonus() * 300)}%`);
    emit(); return true;
  }
  function clearTrophy() {
    const old = state.trophy; if (!old) return;
    const { key, ...o } = old; state.trophy = null;
    (state.singles[key] ||= { ...o, count: 0 }).count++;
    emit();
  }
  const upgradeCost = (k: string): number | undefined => UPGRADES[k].costs[lvl(k)];  // undefined once maxed
  const skillCost = (k: string) => skill(k) < skillMax(k) ? Math.round(SKILLS[k].base * SKILLS[k].grow ** skill(k)) : undefined;
  const canLearn = (k: string) => k !== 'apprentice' || lvl('clerk') > 0;
  function learn(k: string) {
    const cost = skillCost(k);
    if (cost == null || state.cash < cost || !canLearn(k)) return false;
    const r0 = rate();
    state.cash -= cost; state.skills[k] = skill(k) + 1;
    log(`技能：${SKILLS[k].name} Lv${skill(k)}（${SKILLS[k].fx(skill(k))}${walkIns(r0)}）`, '', -cost);
    emit(); return true;
  }
  const canUpgrade = (k: string) => k !== 'expand' || crowdRaw() > CROWD_KNEE; // 扩建 only lifts a cap the shop has reached
  // fn() as if upgrade or skill k were one level higher, state untouched afterwards: the 成长 page shows what a level really does
  // (人气 and 扩建 go through the 客流上限, so their nominal step can be far from the walk-ins you get). fn must not pad shelves().
  function peek<T>(k: string, fn: () => T): T {
    const o = k in UPGRADES ? state.up : state.skills, had = o[k];
    o[k] = (had || 0) + 1;
    try { return fn(); } finally { if (had == null) delete o[k]; else o[k] = had; }
  }
  const perMin = (r: number) => (r * 60).toFixed(1);
  const walkIns = (r0: number) => rate() !== r0 ? `，进店 ${perMin(r0)} → ${perMin(rate())} 人/分` : ''; // for the log line of a level that moved traffic
  function upgrade(k: string) {
    const cost = upgradeCost(k);
    if (cost == null || state.cash < cost || !canUpgrade(k)) return false;
    const r0 = rate();
    state.cash -= cost; state.up[k] = lvl(k) + 1;
    if (k === 'clerk' && lvl(k) === 1) for (const s of SETS) if (shelves().some(o => o.id === s.id) || state.stock[s.id] || state.opened[s.id]) state.auto[s.id] = true;
    log(`升级：${UPGRADES[k].name} Lv${lvl(k)}${walkIns(r0)}`, '', -cost);
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
    v.r = 'sold'; v.set = id; v.n = n; v.price = sealedPrice(id); v.pct = pctOf(id); v.gain = ask(id) * n; state.cash += v.gain; state.earned.sealed += v.gain;
    let left = n; for (const s of shelves()) if (s.id === id) { const k = Math.min(left, s.qty); s.qty -= k; left -= k; }
  };
  const balk = (v: Visit, c: Shown, max: number) => { v.r = 'pricey'; v.card = c.name; v.price = c.price; v.pct = cardPct(c); if (v.pct <= max) v.why = 'budget'; };

  // One walk-in customer: picks an errand, looks at what is on the shelf/in the case at what price, buys or leaves, and is
  // kept in state.recent (see Visit). Returns cash taken in. r: 'sold' | 'pricey' (something matched but too dear, or they
  // were short of money) | 'none' (nothing they wanted was for sale).
  function visit() {
    const type = pickW(Object.keys(TYPES), typeWeight), tol = tolOf(type), hits = state.shown;
    const onShelf = SETS.filter(s => shelfQty(s.id) > 0).map(s => s.id), v: Visit = { at: vnow, t: type, r: 'none', max: tol };
    if (type === 'opener') {
      const want = (r => r < 0.4 ? 2 : r < 0.75 ? 4 : 5 + Math.floor(random() * 6))(random());
      let id = pickW(SETS.filter(s => unlocked(s.id)), s => heatW(s.id) * demand(s.id).w).id;
      if (!shelfQty(id)) { const m = (state.miss[id] ||= []); m.push(vnow); while (m[0] < vnow - MISS_WINDOW * 1000) m.shift(); } // the set they came for, before any settling
      if (!shelfQty(id) && onShelf.length && random() < 0.5) { v.miss = id; id = pickW(onShelf, facings); } // settles for another set, more likely one on several shelves
      v.set = id; v.max = tol + demand(id).tol;
      if (shelfQty(id)) {
        const n = Math.min(want, shelfQty(id), Math.floor(lognorm(60 * demand(id).budget, 0.6) / ask(id)));
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
    state.recent.unshift(v); while (state.recent.at(-1)!.at < vnow - MISS_WINDOW * 1000) state.recent.pop(); // bounded by rate() × MISS_WINDOW, and rate() is capped
    return v.gain || 0;
  }

  // The clerk (upgrade): once a round, tops up every shelf whose set has auto-restock on (buying straight onto it; half full at
  // level 1, full at level 2); at level 2 also sells the bulk to peers (every tick, like 带徒弟's listing).
  // Between rounds (every tick, and every catch-up slice while closed) the clerk also carries back-room stock of those sets onto
  // their shelves, keeping CLERK_KEEP packs back for the player to open: late in the game a shelf sells out in a minute or two,
  // so a back room the player keeps full is what keeps the shelves from standing empty until the next round. Game setting.
  function clerkWork(acc: { packs: number; spent: number; bulk: number; bulkV: number; listed: number }, t: number) {
    const L = lvl('clerk'); if (!L) return;
    if (skill('apprentice')) acc.listed += stockCase(); // 带徒弟: 补满柜位 on every tick
    for (const id of new Set(shelves().filter(sh => sh.id && state.auto[sh.id] && sh.qty < depth() && state.stock[sh.id] > CLERK_KEEP).map(sh => sh.id!))) fill(id, state.stock[id] - CLERK_KEEP);
    if (t >= state.clerkT) {
      state.clerkT = t + CLERK_ROUND * 1000;
      for (const sh of shelves()) {
        const id = sh.id, cap = depth(), goal = L >= 2 ? cap : Math.ceil(cap / 2);
        if (!id || !state.auto[id] || sh.qty >= goal) continue;
        const n = Math.min(goal - sh.qty, Math.floor(state.cash / wholesale(id))), cost = n > 0 ? stockUp(id, n, sh) : 0;
        if (cost) { acc.packs += n; acc.spent += cost; }
      }
    }
    if (L >= 2) { const b = dumpBulk(); acc.bulk += b.n; acc.bulkV += b.v; }
  }
  // Dead end guard: no cash for the cheapest pack and nothing on the shelves or in the back room. Game setting.
  function bailout() {
    const cheapest = Math.min(...SETS.filter(s => unlocked(s.id)).map(s => wholesale(s.id)));
    if (state.cash >= cheapest || Object.values(state.stock).some(n => n > 0) || shelves().some(o => o.qty > 0)) return false; // cards in the binder don't count: a new player may not think of selling them
    if (credit() < BAILOUT) { bankrupt(); return true; }
    borrow(BAILOUT, true); log('货架空了、钱也花光了：九姐借你进货钱，记在账上', 'loss', BAILOUT); return true;
  }

  // Advances the shop by the wall-clock time since the last call, so background tabs and closed tabs both catch up.
  function tick() {
    const now = clock(), dt = Math.min((now - lastTick) / 1000, offlineCap()); lastTick = now;
    if (dt <= 0) return;
    if (now - state.heatT > HEAT_EVERY * 1000) rollHeat(now);
    const acc = { packs: 0, spent: 0, bulk: 0, bulkV: 0, listed: 0 }, lost0 = state.lost, slice = CLERK_SLICE, away = dt > 30;
    let n = 0, revenue = 0, sales = 0;
    for (let left = dt; left > 0; left -= slice) {
      const len = Math.min(slice, left), x = rate() * len, m = Math.floor(x) + (random() < x % 1 ? 1 : 0), t0 = now - left * 1000;
      n += m;
      for (let i = 0; i < m; i++) { vnow = t0 + (i + 0.5) / m * len * 1000; const got = visit(); revenue += got; if (got) sales++; } // spread over the slice
      clerkWork(acc, now - (left - len) * 1000);
      debtWork(away ? len * Math.min(1, WEEK / dt) : len, away); // a closed stretch moves the bill clock one week at most
    }
    if (away && state.overdue) state.overdue.until = Math.max(state.overdue.until, state.shopT + GRACE); // what could not be covered while away gets its grace from the return
    if (acc.packs) log(`店员进货 ${acc.packs} 包`, '', -acc.spent);
    if (acc.bulk) log(`店员把散卡 ${acc.bulk} 张卖给同行`, 'gain', acc.bulkV);
    if (acc.listed) log(`店员把 ${acc.listed} 张闪卡挂进了展示柜`);
    if (dt > 30 && n) { // long absence: one summary instead of a log line per customer
      const o = state.offline ||= { secs: 0, sales: 0, revenue: 0, lost: 0 };
      o.secs += dt; o.sales += sales; o.revenue += revenue; o.lost += state.lost - lost0;
      for (const e of pending) { if (e.type === 'bill_paid') o.bills = (o.bills || 0) + e.amount!; if (e.type === 'loan_taken') o.borrowed = (o.borrowed || 0) + e.amount!; }
      log(`打烊期间成交 ${sales} 位顾客`, 'gain', revenue);
    }
    const rescued = bailout();
    if (flush()) return;
    if (n || dt > 30 || acc.packs || acc.bulk || acc.listed || rescued) emit(); else save();
  }
  // ---------- 债务: weekly bills, loans, bankruptcy (numbers at WEEK above) ----------
  const debtScale = () => 1 + DEBT_STEP * state.branch.n;
  const debt0 = () => Math.round(DEBT0 * debtScale());
  const loanRate = () => LOAN_RATE + LOAN_MARK * Math.min(3, state.branch.broke || 0);
  const creditLimit = () => Math.round(Math.max(LOAN_FLOOR * debtScale(), LOAN_K * state.best));
  const credit = () => Math.max(0, creditLimit() - state.loan);
  const cents = (v: number) => Math.round(v * 100) / 100;
  const setDebt = () => { state.owe = Math.max(0, cents(state.owe)); state.loan = Math.max(0, cents(state.loan)); state.debt = cents(state.owe + state.loan); };
  const installment = (w: number) => Math.min(state.owe, Math.round(BILL0 * debtScale() * BILL_G ** (w - 1)));
  const dueIn = () => state.week * WEEK - state.shopT; // seconds of shop time until the next bill
  // The next bill as it stands now (the loan part is what the loan has grown past the credit line; it grows again at the week's end).
  function nextBill() {
    if (!state.debt) return null;
    const inst = installment(state.week);
    return { week: state.week, amount: inst + Math.max(0, Math.round(state.loan * (1 + loanRate()) - creditLimit())), inst, dueAt: clock() + dueIn() * 1000 };
  }
  function borrow(amount: number, forced: boolean) {
    amount = cents(amount);
    state.cash += amount; state.loan += amount; setDebt();
    state.loans.unshift({ at: clock(), week: state.week, amount, forced }); state.loans.length = Math.min(state.loans.length, 20);
    pending.push({ type: 'loan_taken', week: state.week, amount, forced });
  }
  // Pays a bill in full from cash: the installment part off what is owed, the rest off the loan.
  function settle(b: { week: number; amount: number; inst: number }) {
    state.cash -= b.amount; state.owe -= b.inst; state.loan -= b.amount - b.inst; state.billsPaid++; state.overdue = null; setDebt();
    log(`第 ${b.week} 周的账付给九姐`, 'loss', -b.amount);
    pending.push({ type: 'bill_paid', week: b.week, amount: b.amount });
    cleared();
  }
  const cleared = () => { if (!state.debt) { state.overdue = null; log('债还清了：这家店从今天起是你的', 'hit'); pending.push({ type: 'story', id: 'debt_cleared', week: state.week }); } };
  // One week of shop time is over: the loan compounds, the week's revenue sets the credit line, the bill falls due.
  function weekEnd() {
    const w = state.week++, made = revenue() - state.weekRev0;
    state.weekRev0 = revenue(); state.best = Math.max(state.best, made);
    if (!state.debt) return;
    state.loan *= 1 + loanRate(); setDebt();
    const inst = installment(w), amount = cents(inst + Math.max(0, state.loan - creditLimit()));
    if (amount <= 0) return;
    pending.push({ type: 'bill_due', week: w, amount });
    if (state.overdue) { state.overdue = { ...state.overdue, week: w, amount: cents(state.overdue.amount + amount), inst: state.overdue.inst + inst }; return; } // piled up while away
    if (state.cash >= amount) settle({ week: w, amount, inst });
    else {
      state.overdue = { week: w, amount, inst, until: state.shopT + GRACE };
      log(`第 ${w} 周的账 ${'$' + amount.toFixed(0)} 付不上：${GRACE / 60} 分钟内凑齐，不然就借`, 'loss');
      pending.push({ type: 'bill_missed', week: w, amount });
    }
  }
  // Grace is over (or the shop is away and cannot be asked): borrow what cash does not cover, or go bankrupt.
  function lapse() {
    const o = state.overdue!, short = cents(o.amount - state.cash);
    if (short > credit()) { bankrupt(); return; }
    borrow(short, true); log(`宽限到了：九姐替你把第 ${o.week} 周的账垫上，借 $${short.toFixed(0)}`, 'loss', short);
    settle(o);
  }
  function debtWork(len: number, away: boolean) {
    state.shopT += len;
    while (state.shopT >= state.week * WEEK) weekEnd();
    const o = state.overdue; if (!o) return;
    if (state.cash >= o.amount) settle(o);
    else if (state.shopT >= o.until || (away && o.amount - state.cash <= credit())) lapse();
  }
  // Pays an overdue bill now (if cash covers it).
  function payBill() { const o = state.overdue; if (!o || state.cash < o.amount) return false; settle(o); flush(); return true; }
  // Borrows up to the credit line (what is left of it). Not revenue: it never counts toward unlocking a set or the credit line.
  function takeLoan(amount: number) {
    amount = Math.min(amount, credit()); if (!(amount > 0) || !state.debt && !state.overdue) return false;
    borrow(amount, false); log(`向九姐借了 $${amount.toFixed(0)}，每周利息 ${Math.round(loanRate() * 100)}%`, 'loss', amount);
    if (state.overdue && state.cash >= state.overdue.amount) settle(state.overdue);
    flush(); return true;
  }
  // Pays debt down early: the loan first (it is the part that grows), then what is owed (later bills end sooner).
  function repay(amount: number) {
    amount = cents(Math.min(amount, state.cash, state.debt)); if (!(amount > 0)) return false;
    const toLoan = Math.min(amount, state.loan);
    state.cash -= amount; state.loan -= toLoan; state.owe -= amount - toLoan; setDebt();
    log(`提前还给九姐`, 'loss', -amount);
    cleared(); if (!flush()) emit(); return true;
  }
  const missed = (id: string) => (state.miss[id] || []).filter(t => t > clock() - MISS_WINDOW * 1000).length;
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

  // A one-off cash grant from outside the shop (成就奖金). Not revenue: it never counts toward unlocking a set.
  function bonus(cash: number, text: string) { state.cash += cash; log(text, 'hit', cash || undefined); emit(); }

  // ---------- 开分店 ----------
  const fameFor = (rev = revenue()) => Math.floor(Math.sqrt(rev / FAME_UNIT));
  const handFame = () => HAND_FAME * (SETS.filter(s => handDone(s.id)).length - (state.branch.hands || 0)); // 亲手开齐 名气 waiting for the next 开分店
  const canBranch = () => !state.debt; // the debt is paid: 九姐 has no claim on you, and backs the next shop

  const perkCost = (k: string) => perk(k) < PERKS[k].max ? PERKS[k].base + perk(k) : undefined;
  // A new shop from zero, with what carries over: the 欧气 record and 图鉴 (one unit: all of it or none), achievements, 名气
  // and its perks. It owes this shop number's opening debt.
  function restart(branch: Branch, singles: State['singles']) {
    const old = state;
    state = { ...fresh(), singles, opened: old.opened, tally: old.tally, pulled: old.pulled, costOpened: old.costOpened, hits: old.hits, dex: old.dex, dexPacks: old.dexPacks, dexSeen: old.dexSeen, packsBy: old.packsBy,
      ach: old.ach, feat: old.feat, branch };
    state.cash = START_CASH + SEED_STEP * perk('seed'); state.owe = debt0(); setDebt();
    if (perk('fit')) state.up.racks = state.up.depth = perk('fit');
    if (perk('hire')) { state.up.clerk = 1; for (const s of SETS) state.auto[s.id] = true; }
    luckCache = null; lastTick = vnow = clock();
    return old;
  }
  function branch() {
    if (!canBranch()) return false;
    const fame = fameFor() + handFame(), b = state.branch, singles = { ...state.singles }, hands = SETS.filter(s => handDone(s.id)).length;
    for (const c of state.trophy ? [...state.shown, state.trophy] : state.shown) { const { key, pct, ...o } = c as Shown; (singles[key] ||= { ...o, count: 0 }).count++; } // the case comes along, back in the binder
    restart({ ...b, n: b.n + 1, fame: b.fame + fame, got: b.got + fame, life: b.life + revenue(), hands }, singles);
    log(`开了第 ${state.branch.n + 1} 家店，带来名气 ${fame}。九姐出的本钱：$${state.debt.toLocaleString('en-US')}`, 'hit');
    pending.push({ type: 'story', id: 'branch', week: 1, amount: state.debt }); flush(); return true;
  }
  // 破产: 九姐 takes the shop and everything in it (cash, stock, the binder and the case), this shop's revenue earns no 名气, and
  // you start the same shop number over, owing its opening debt again, with a mark that raises every later loan's interest.
  // What you learned stays: 图鉴, achievements, the 欧气 record, 名气 already earned and its perks.
  function bankrupt() {
    const o = state, goods = SETS.reduce((a, x) => a + ((o.stock[x.id] || 0) + shelfQty(x.id)) * wholesale(x.id), 0);
    const cards = Object.values(o.singles).reduce((a, c) => a + c.price * c.count, 0) + [...o.shown, ...(o.trophy ? [o.trophy] : [])].reduce((a, c) => a + c.price, 0);
    const wreck: Wreck = { at: clock(), week: o.week, shop: o.branch.n, debt: o.debt, cash: o.cash, goods: cents(goods), cards: cents(cards), revenue: cents(revenue()) };
    restart({ ...o.branch, broke: (o.branch.broke || 0) + 1 }, {});
    state.wreck = wreck; pending = [];
    log(`破产：九姐收走了店、货和卡。从第 1 周重新开始，欠 $${state.debt.toLocaleString('en-US')}`, 'loss');
    pending.push({ type: 'bankrupt', week: wreck.week, amount: wreck.debt });
    flush(); return true;
  }
  function ackWreck() { state.wreck = null; emit(); }
  function learnPerk(k: string) {
    const cost = perkCost(k);
    if (cost == null || state.branch.fame < cost) return false;
    state.branch.fame -= cost; state.branch.perks[k] = perk(k) + 1;
    if (k === 'fit') for (const u of ['racks', 'depth']) state.up[u] = Math.max(lvl(u), perk(k));
    if (k === 'hire' && !lvl('clerk')) { state.up.clerk = 1; for (const s of SETS) state.auto[s.id] ??= true; }
    log(`名气：${PERKS[k].name} Lv${perk(k)}（${PERKS[k].fx(perk(k))}）`);
    emit(); return true;
  }

  function reset() { state = fresh(); luckCache = null; dexN = handN = null; emit(); }

  return {
    get state() { return state; }, on: (f: (ev?: GameEvent) => void) => listeners.push(f), now: clock, bonus,
    buy, shelve, unshelve, place, setPrice, setCardPrice, open, sell, collect, missing, master, setAuto, dexCount, dexTotal, dexBonusOf, handCount, handDone, handMissing, handFame, cardOdds, HAND_FAME, dexBonus, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    list, unlist, fillCase, setCasePct, casePct, setTrophy, clearTrophy, upgrade, upgradeCost, canUpgrade, peek, ackOffline, learn, skill, skillCost, skillMax, canLearn, luckMult, offlineCap,
    nextBill, payBill, takeLoan, repay, bankrupt, ackWreck, credit, creditLimit, loanRate, debt0, dueIn, installment,
    WEEK, GRACE, DEBT0, BILL0, BILL_G, DEBT_STEP, LOAN_RATE, LOAN_MARK, LOAN_K, LOAN_FLOOR, NOCLERK_CAP,
    branch, canBranch, fameFor, learnPerk, perk, perkCost, PERKS, FAME_UNIT, START_CASH, SEED_STEP, REG_STEP, ACCESS_STEP,
    demand, lineup, crowdRaw, crowdMult, crowdCap, room, sealedPrice, ask, cardAsk, shelfQty, facings, missed, shelves, racks, depth, pctOf, cardPct, slots, revenue, unlocked, unlockAt, rate, trophyBonus, wholesaleRate, lvl,
    UPGRADES, SKILLS, TYPES, DEMAND, SEEK, BIG_CARD, FLIP_COOLDOWN, DEX_TIERS, MASTER, BUY_R, BAILOUT, BUYLIST, WHOLESALE, WHOLESALE_STEP, ARRIVAL, SIGN_STEP, OFFLINE_CAP, HEAT_EVERY, CLERK_ROUND, CLERK_KEEP, MISS_WINDOW, CROWD_KNEE, CROWD_ROOM, ROOM_STEP, RACK_BASE, DEPTH_BASE, DEPTH_STEP, CASE_BASE, CASE_STEP, WAREHOUSE, MIN_PCT, MAX_PCT, PCT_STEP, DEFAULT_PCT, CASE_PCT,
  };
}
