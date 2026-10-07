// Shop state + actions. No DOM in here: the ui renders state and calls these.
// createGame() takes its clock, random source and storage as arguments so node (test/, scripts/autoplay.mjs) can drive it
// on a fake clock with a seeded rng; the browser uses the defaults.
import { DATA, SETS } from './sets.ts';
import * as S from './sim.ts';
import type { Pull } from './sim.ts';
import { GROWTH_KEYS, GROWTH_PARENTS, GROWTH_TREES } from './growth.ts';
import type { GrowthKey } from './growth.ts';

export interface Single extends Pull { count: number }
export interface Shown extends Pull { key: string; pct: number }
export interface Exhibit extends Pull { key: string } // a card in the 收藏室 (state.gallery): the one copy it stands for, with the binder key it came from
// One walk-in customer, as the 顾客 panel and 店内动态 show them. t = TYPES key, r = 'sold' | 'pricey' | 'none'; set = the set they
// looked at (openers, flippers) or asked for (seekers; absent = any set); miss = the set an opener came for that was not on the shelf;
// tier = seeker's SEEK row; card = the case card bought or balked at; price = that pack's or card's market price then; pct = its
// asking price and max = the most this customer would pay, both as shares of that market price; why = 'budget' (fine price, not
// enough money on them) | 'cool' (flipper still holding that set). A pack buyer who tore their packs open at the counter (收卡):
// offer = hits they pulled, floor = the least they take (share of market), took / paid = what you bought; sell = why you bought
// none or not all: 'low' (your 收卡价 under their floor) | 'full' (binder full) | 'cash' (the till holds no more than the next bill) | 'owe' (a bill is overdue).
export interface Visit { at: number; t: string; r: string; set?: string; miss?: string; tier?: number; card?: string; n?: number; price?: number; pct?: number; max?: number; gain?: number; why?: string; offer?: number; took?: number; paid?: number; floor?: number; sell?: string }
export interface Shelf { id: string | null; qty: number } // one set per shelf; id stays after it sells out (the clerk refills it), null = empty
export interface State {
  cash: number; stock: Record<string, number>; singles: Record<string, Single>; opened: Record<string, number>; tally: Record<string, number>;
  pulled: number; costOpened: number; hits: (Pull & { t: number })[]; earned: { sealed: number; singles: number }; customers: number;
  log: { t: number; text: string; tone: string; amt?: number }[]; shelves: Shelf[]; price: Record<string, number>; // price: asking price per set, share of market
  cust: { visits: number; sold: number; pricey: number; none: number }; recent: Visit[];
  up: Record<string, number>; dex: Record<string, { c: number; p: number }>; dexPacks: number; dexSeen: Record<string, 1>; auto: Record<string, boolean>;
  shown: Shown[]; casePct?: number; buyPct?: number; intake?: { n: number; cost: number }; heat: Record<string, number>; heatT: number; lost: number; savedAt: number; flipT: Record<string, number>; clerkT: number; // clerkT: when the clerk's next round is due
  skills: Record<string, number>; packsBy: Record<string, number>; // packsBy: packs opened per S.rateKey (set + the 手气 odds they were opened at)
  miss: Record<string, number[]>; // per set: when a pack buyer came for it and it was on no shelf (last MISS_WINDOW only), so the shelf page can say who to make room for
  cardSales?: { seeker: number; collector: number }; // paying seeker / collector visits this shop (a visit may take several cards), counted as they happen. Absent in a save from before it existed: counting starts when it loads, the past is not guessed
  cardFirst?: Partial<Record<'seeker' | 'collector', Visit>>; // first paid visits stay until their teaching note is acknowledged, even after recent expires
  offline: Receipt | null; // the 打烊小票 still on screen: what absences of AWAY seconds or more took in, added up until put away
  away: (Receipt & { at: number }) | null; // the absence going on now (at = when the player left), null while they are here
  ach: Record<string, number>; feat: Record<string, number>; // 成就 (src/achievements.ts owns both): id → when stamped; its counters (streaks, bests)
  branch: Branch;
  // 债务 (GAMEPLAY.md): owe = what is left of the opening debt (paid in weekly installments, no interest), loan = what was
  // borrowed (compounds weekly), debt = owe + loan (the one number the story reads). week = the week whose bill comes next;
  // shopT = the bill clock, seconds since this shop opened (a closed stretch adds one week at most); overdue = a bill that fell due short of cash, with
  // the shop time its grace runs out; wreck = the 破产 statement, shown until acknowledged.
  // clerkRound: the clerk's last round (at = when, need = what filling the shelves cost, spent = what the till let him buy; need > spent
  // is the 店员没本钱 pit). 现在补货 adds to spent.
  clerkRound?: { at: number; need: number; spent: number };
  debt: number; owe: number; loan: number; week: number; shopT: number; billsPaid: number; loans: Loan[];
  overdue: { week: number; amount: number; inst: number; until: number } | null; best: number; weekRev0: number; wreck: Wreck | null;
  bought?: { k: string; cost: number; week: number }[]; // upgrades / skills bought this shop, newest last (退回: see refundable)
  // 收藏室 (gallery): ROOM_SLOTS places for cards the player owns and shows: index PEDESTAL is the 镇店台 (the 镇店之宝: its card also draws collectors, see trophyBonus), the other GALLERY_SLOTS are the 展位 (第 1–5 格).
  // galleryAcc = visitors admitted so far but not yet counted (a fraction of one; no random draw). v = the save format: 2 = the pedestal is gallery[0]; a save without it has a separate `trophy` and five slots (load() merges them).
  // extra = this shop's money that is not product sales: ticket money, 挂机加成 and 离线加成. It is never part of earned, so it never unlocks a set, earns 名气 or lifts the credit line.
  gallery: (Exhibit | null)[]; galleryAcc: number; extra: { tickets: number; idle: number; offline: number }; v: number;
  // 找卡委托 (game setting, see COMM_GAP): the one open request, null when nobody is asking; commAt = shopT when the last one ended (delivered, dismissed or expired), the cooldown's start;
  // commPaid = what this shop has been paid for requests so far (already inside earned.singles: it only lets the top bar name 「交付」 as the source of a jump in the till).
  comm: Commission | null; commAt: number; commPaid: number;
}
// secs = seconds the shop traded (up to offlineCap), sales = paying visits; bills / borrowed: paid to 九姐 / borrowed meanwhile
// detail = the same absence taken apart, added up visit by visit as each is generated (state.recent keeps only MISS_WINDOW, an
// absence lasts up to hours). packs / seeker / collector = paying visits (sales), what they paid (revenue, gross) and walk-ins who
// found nothing (lost) by customer type; 倒爷 count under packs even when one took a case card. intake = what 收卡 paid at the
// counter, restock = what the clerk bought, bulk = what the clerk's bulk sale to peers brought in. cash = the till's actual change
// over the absence's ticks, bills, 顺手还 and all: 顺手还 has no field of its own, so with a loan cash is not the parts added up.
// Absent only on a receipt from a save before it existed, and on any receipt merged with one: a breakdown that misses part of the
// absence is never passed off as all of it.
export interface Takings { sales: number; revenue: number; lost: number }
export interface ReceiptDetail { packs: Takings; seeker: Takings; collector: Takings; intake: number; restock: number; bulk: number; cash: number }
// Tickets and offline bonus are separate from revenue and the sales breakdowns. detail.cash already includes both; never add them again.
export interface Receipt { secs: number; sales: number; revenue: number; lost: number; bills?: number; borrowed?: number; tickets?: number; bonus?: number; detail?: ReceiptDetail }
// A 找卡委托: one specific hit (set + number, kind = its rarity) a customer will pay reward for until shopT reaches due. price = the card's market price when it was asked for, reward = price × COMM_PAY, both frozen.
export interface Commission { set: string; n: string; name: string; r: string; kind: string; price: number; reward: number; due: number }
export interface Loan { at: number; week: number; amount: number; forced: boolean }
export interface Wreck { at: number; week: number; shop: number; debt: number; cash: number; goods: number; cards: number; revenue: number; gallery?: { n: number; value: number } } // gallery = what 九姐 did not take
// 开分店 (prestige): n = shops opened after the first; fame = 名气 not yet spent, got = all ever earned; life = revenue of the
// shops before this one; perks = 名气 perk levels. Survives every branch; only 清空存档 clears it.
export interface Branch { n: number; fame: number; got: number; life: number; perks: Record<string, number>; broke?: number; hands?: number } // broke = bankruptcies, ever (征信); hands = 亲手开齐 sets already paid in 名气
export interface Luck { packs: number; pct: number | null; title: string; value: number; live: boolean; expected: number; cost: number; listEV: number; boosted: number }
export interface GameEnv { now?: () => number; random?: () => number; storage?: Pick<Storage, 'getItem' | 'setItem'> | null; commissions?: boolean } // storage null = never saved (autoplay: stringifying the save was 70% of its time); commissions false = nobody ever asks for a card (autoplay's before/after switch)
export type Game = ReturnType<typeof createGame>;
// type = a debt event for the story (bill_due / bill_paid / bill_missed / loan_taken / bankrupt / story), with the bill's week and amount.
export interface GameEvent { open?: Pull[][]; type?: string; week?: number; amount?: number; id?: string; forced?: boolean; set?: string } // what happened, for listeners that need more than the new state (achievements.ts)

const SPLITS = ['packs', 'seeker', 'collector'] as const, TAKINGS = ['sales', 'revenue', 'lost'] as const, SUMS = ['intake', 'restock', 'bulk', 'cash'] as const;
// A receipt with nothing on it yet, breakdown included: a new absence, or the 打烊小票 an absence is first added to, is counted whole from its first moment.
const receipt = (): Receipt => ({ secs: 0, sales: 0, revenue: 0, lost: 0, detail: { packs: { sales: 0, revenue: 0, lost: 0 }, seeker: { sales: 0, revenue: 0, lost: 0 }, collector: { sales: 0, revenue: 0, lost: 0 }, intake: 0, restock: 0, bulk: 0, cash: 0 } });
// A saved breakdown counts only if every field is a finite number; a damaged one is treated as absent (never half-filled).
function validDetail(d: unknown): d is ReceiptDetail {
  const r = d as Partial<Record<string, Record<string, unknown>>> | null; // unvalidated JSON: each number is checked below
  return !!r && SPLITS.every(k => TAKINGS.every(f => Number.isFinite(r[k]?.[f]))) && SUMS.every(k => Number.isFinite(r[k]));
}
function addDetail(to: ReceiptDetail, d: ReceiptDetail) { for (const k of SPLITS) for (const f of TAKINGS) to[k][f] += d[k][f]; for (const k of SUMS) to[k] += d[k]; }

export function createGame({ now: clock = Date.now, random = Math.random, storage, commissions = true }: GameEnv = {}) {
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
  // 单卡生意 (game setting, GAMEPLAY §14). Real card shops live on the hits their customers pull at the counter: COUNTER_OPEN of
  // pack buyers tear what they just bought open on the spot (measured odds, S.openPack) and offer you every hit at once; they take
  // your 收卡价 (share of market, BUY_PCT before you touch it) if it is at least their own floor (SELLER: a peer shop pays 70% but is
  // another trip). The hits you hold (bought or pulled) sit in the counter binder, for sale to seekers at the 单卡标价 (the case tag);
  // the case itself is what collectors look at. A seeker takes up to SEEK_N cards of the tier they came for (a deck needs several).
  // 收卡 stops while the binder holds BINDER hits, and in the BILL_KEEP seconds before a bill never spends the cash it needs.
  const COUNTER_OPEN = 0.5, SELLER = { tol: 0.6, sd: 0.08 }, BUY_PCT = 0.6, BINDER = 60, SEEK_N = 3, BILL_KEEP = 300;
  const DEFAULT_PCT = 0.95; // a set's tag before you touch it: under market, because the cheapest-shopping set (sv08, mean ceiling 100%) loses half its buyers at 100% on a cold day
  // Customer types. tol = the most a customer will pay, as a share of market (mean; sd is the spread between individuals).
  const TYPES: Record<string, { name: string; w: number; tol: number; sd: number }> = {
    opener:    { name: '拆包玩家', w: 50, tol: 1.06, sd: 0.08 }, // buys 1–5 packs of a set to open; budget-limited
    seeker:    { name: '找卡的', w: 22, tol: 1.12, sd: 0.10 },   // wants one card of a given rarity
    collector: { name: '收藏党', w: 10, tol: 1.22, sd: 0.12 },   // wants the priciest card in the case; the 镇店台 and signage draw more of them
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
  // 街口 (game setting): shop n stands on STREETS[n % 4]. The first shop (老街) is the numbers above exactly; every later shop
  // tilts who walks in and which sets they come for, so a new shop asks for different stock and prices instead of replaying the
  // last one. Only pack buyers and set demand tilt (the case is fed by the hits you pull, too few to carry a street; GAMEPLAY §6.2).
  // types = weight × per customer type; budget / tol = on every pack buyer; crowd = × walk-ins (outside the cap, like 人气);
  // sets = per-set w / tol / budget on top of DEMAND, tag = what the 货柜 card says about that set on this street.
  interface Street { name: string; say: string; types?: Record<string, number>; budget?: number; tol?: number; crowd?: number; sets?: Record<string, { w?: number; tol?: number; budget?: number; tag?: string }> }
  const STREETS: Street[] = [
    { name: '老街', say: '什么人都有一点' },
    { name: '城东学校旁', say: '放学的学生多：来拆包的多，零花钱少，便宜的系列好卖、贵的难走',
      types: { opener: 1.3, flipper: 0.5 }, budget: 0.75, tol: -0.03,
      sets: { sv09: { w: 2, tag: '学生最爱' }, me03: { w: 1.8, tag: '学生最爱' }, me01: { w: 1.3 }, 'sv03.5': { w: 0.4, tag: '学生买不起' }, 'sv08.5': { w: 0.7 } } },
    { name: '火车站夜市', say: '人来人往：进店的人多一成，倒爷多一倍，标价高了扭头就走',
      types: { flipper: 2 }, crowd: 1.1, tol: -0.02 },
    { name: '旧货街', say: '老玩家扎堆：进店的人少，绝版和抢手的系列有人肯多付、带的钱也多',
      types: { opener: 0.9, collector: 1.5 }, crowd: 0.85, budget: 1.2,
      sets: { 'sv03.5': { w: 2.2, tol: 0.08, tag: '老粉专程来' }, 'sv08.5': { w: 1.6, tol: 0.05 }, sv09: { w: 0.6 }, me03: { w: 0.6 } } },
  ];
  const FLIP_COOLDOWN = 600;              // seconds: after a flipper buys a set's packs, nobody flips that set again until they resold
  // 开张期 (game setting): the first ten packs the guide has a new player buy sold to one flipper in ~40 s at the default tag, leaving
  // a bare shelf and about $1,030 in the till. So until the shop has traded OPENING seconds (shop time: stands still while a story plays,
  // starts over with a new shop) no 倒爷 comes; until OPENING_CAP (the first bill) one takes at most FLIP_SHARE of what is on the
  // shelf, rounded up. After that flippers are as before.
  const OPENING = 10 * 60, OPENING_CAP = 20 * 60, FLIP_SHARE = 0.5;
  const SEEK = [['RR', 'ACE', 'PB'], ['UR', 'IR', 'MB'], ['SIR', 'HR', 'MHR']]; // what seekers ask for: one card of a rarity tier, from a given set (or any)
  const SEEK_W = [50, 35, 15];
  const BIG_CARD = 12;                    // collectors only look at case cards worth at least this much
  const SIGN_STEP = 0.04;                 // signage: customers pay +4% more per level, and more seekers/collectors come
  // 统一货架: the shop has RACK_BASE shelves (+1 per 货架 level, up to one per set), each holds one set, DEPTH_BASE packs deep
  // (+DEPTH_STEP per 加层 level). More shelves = more sets on sale at once (openers who find their set buy it; the rest only
  // settle half the time); deeper shelves = longer before a shelf sells out, while you are away or between the clerk's rounds.
  const RACK_BASE = 3, DEPTH_BASE = 40, DEPTH_STEP = 40;
  const CASE_BASE = 3, CASE_STEP = 2;     // display-case slots; CASE_GAINS: slots each 展示柜 level adds (the old Lv 3, +2 for $2,920, is two levels of +1: ROADMAP loop 30)
  const CASE_GAINS = [2, 2, 1, 1, 2];
  const OFFLINE_CAP = 6 * 3600;           // seconds of closed-shop time credited on return, with a clerk minding the shop (看店 adds more)
  const NOCLERK_CAP = 3600;               // without a clerk nobody minds the shop: at most an hour is credited (sales and the bill clock alike)
  // 离开 (game setting): the page hidden (another tab, a locked screen, a closed lid) or closed is one absence, from the moment
  // the player left to the moment they are back, however the browser spaced the ticks in between. An absence trades for at most
  // offlineCap() and moves the bill clock at most one WEEK, both counted from when it began; a bill short of cash waits (grace
  // only runs while the player is here). The UI reports leaving and coming back (leave / back); without it (node, a machine that
  // slept with the page open) a gap between two ticks longer than AWAY is an absence of its own. Absences of AWAY or longer
  // print a 打烊小票; shorter ones are just the shop carrying on.
  const AWAY = 120;
  // 收藏室 (game setting, GAMEPLAY): a 镇店台 and five slots of cards the player owns, shown and not for sale. Visitors walk in at GALLERY_RATE a second of
  // trading time, no random draw, each paying the ticket: floor(sqrt(total market value of every card in the room, the pedestal's too) / 5) dollars, TICKET_MIN…TICKET_MAX, nothing for an empty room.
  // Ticket money is not sales (see State.extra). 挂机加成 (game setting): the shop earns IDLE_BONUS more on every automatic sale (customers, the clerk's
  // bulk sale) while the player has the 货柜 page (货架 or 展示柜) open and in view; 看店 earns OFFLINE_BONUS a level on the same sales while they are away. Never both, never on
  // tickets or 成就奖金, and never on a card the player sells by hand.
  const GALLERY_SLOTS = 5, ROOM_SLOTS = GALLERY_SLOTS + 1, PEDESTAL = 0, SAVE_V = 4, GALLERY_RATE = 2 / 60, TICKET_MIN = 1, TICKET_MAX = 20, IDLE_BONUS = 0.25, OFFLINE_BONUS = 0.05;
  // 债务 (game setting, derivation in GAMEPLAY.md). A week is WEEK seconds of shop time while the page is open; a closed stretch
  // (sales credited up to offlineCap) moves the bill clock one week at most: 九姐 calls once while you are away. Shop n (0 = the first) owes
  // DEBT0 × (1 + DEBT_STEP·n); week w's bill is BILL0 × (1 + DEBT_STEP·n) × BILL_G^(w−1), capped at what is left, plus whatever
  // the loan has grown past the credit line. A bill short of cash gets GRACE seconds; then it is borrowed, or the shop goes bankrupt.
  // Loans compound LOAN_RATE a week (+LOAN_MARK per past bankruptcy, up to 3); the credit line is LOAN_K × the shop's best
  // week of revenue, at least LOAN_FLOOR × (1 + DEBT_STEP·n).
  const WEEK = 20 * 60, GRACE = 5 * 60;
  const DEBT0 = 40000, BILL0 = 300, BILL_G = 1.12, DEBT_STEP = 0.5;
  const LOAN_RATE = 0.1, LOAN_MARK = 0.05, LOAN_K = 1, LOAN_FLOOR = 3000;
  // 顺手还 (game setting, GAMEPLAY §4.5): once a week's bill is paid, 九姐 also takes LOAN_PAY of the loan (at least LOAN_MIN × the
  // shop's scale, or all of it) out of the till — only from cash beyond the money to fill the shelves plus next week's installment (loanFloat),
  // never making the bill late, never borrowed for, never a bankruptcy. A loan left alone used to climb to the credit line and sit
  // there for good, a tenth of it paid every week as interest (autoplay 冲动新手: ~$50k at 16 h, 0/20 ever cleared; now 10/20).
  const LOAN_PAY = 1 / 3, LOAN_MIN = 1000, LOAN_FLOAT = 1000;
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
  // 找卡委托 (game setting; the idea is TCG Card Shop Simulator 0.50's optional counter request, ROADMAP 竞品拆解): now and then a customer asks for ONE
  // specific hit (a card of BUY_R, by set + number) of a set that has a shelf, pays COMM_PAY × its market price for it and waits COMM_LEN seconds of shop time.
  // The player can serve it from the counter binder (state.singles; 补卡 never counts: those cards only go into the 图鉴) or let it lapse or turn it down: nothing
  // is lost either way. At most one is open; the next one comes COMM_GAP after the last ended, once the shop has a clerk or has traded COMM_OPEN seconds.
  // The card is drawn among the hits of the shelved sets whose market price lies in COMM_FLOOR × cap … cap (never under COMM_MIN), cap = commCap(): COMM_CAP0 dollars growing with the
  // shop's revenue (one dollar per COMM_CAP_REV of it) up to COMM_CAP1. Each card is weighted by the square of the chance one pack pulls it (cardOdds), so what is asked for is mostly what 收卡
  // and 开包 really bring in (a flat draw: the model found the card in its binder for 11% of the requests, this one for 23%, ROADMAP loop 17). The pay counts as card sales revenue
  // (earned.singles) like a sale to a seeker: at most COMM_PAY × COMM_CAP1 a request, 0.01% of the first hour's revenue in the model (ROADMAP loop 17).
  // The draw uses its own mulberry32 (seeded from the clock, the shop number and the shop time), never random(): the walk-in stream, and so every seeded
  // test and every autoplay run, stays exactly what it was unless the player serves a request. COMM_GAP is 5 minutes, not 4: with 4 the 店员没本钱 gate (普通 seed 3 blind, 30 h)
  // drew its third 开分店 after 30 h instead of at 26 h. That gate is a knife edge: a plain $3–$19 of extra cash at hour 3, with no commission in sight, flips two of the six blind seeds the same way (ROADMAP loop 17).
  const COMM_GAP = 5 * 60, COMM_LEN = 10 * 60, COMM_OPEN = 20 * 60, COMM_PAY = 1.6, COMM_MIN = 2, COMM_FLOOR = 0.2, COMM_CAP0 = 5, COMM_CAP1 = 40, COMM_CAP_REV = 1000, COMM_HELD = 0.5;
  const MASTER = { tol: 0.1, w: 1.5 };    // 大师套 (a set's dex at 100%): its pack buyers pay +10% more, and 1.5× as many come for it
  const BAILOUT = 300;                    // a shop with no cash, stock or cards to sell is lent this much (soft-lock guard; bankrupt if there is no credit left)
  const CLERK_SLICE = 30;                 // seconds per catch-up step while a clerk is restocking (so a closed shop keeps being restocked)
  const MISS_WINDOW = 600;                // 货柜 page: walk-ins (state.recent) and pack buyers who found their set missing (state.miss) are both kept for exactly this long, by time, so the two counts cover the same customers
  const CLERK_KEEP = 10;                  // packs of a set the clerk leaves in the back room for the player to open (one 开 10 包)
  const CLERK_ROUND = 120;                // the clerk goes round the shelves every 2 minutes (was 5, then 3: at 40 walk-ins a minute a half shelf ran dry a minute into a 3-minute round, and the sold-out box sent the player back to 补货); a shelf has to last until the next round (why 加层 pays late)
  // 店员 has three levels (game setting): 1 = 帮工, a half shift — a round every CLERK_ROUND_1 seconds, half full; 2 = 店员, every CLERK_ROUND, a
  // 热销 set to the top; 3 = 老手, everything full and the bulk sold. 帮工 + 店员 cost what the one 店员 did ($2,000): it was the first
  // hour's wall (a reviewer and the model, every round since loop 1), and split in two the half-way step lands near minute 15 (ROADMAP loop 28).
  const CLERK_ROUND_1 = 240, CLERK_EMPTY = 30; // CLERK_EMPTY: the 帮工 also goes round when a shelf stands empty, at most this often (clerkWork)
  // 客流上限: the word-of-mouth multiplier (图鉴口碑 × 新系列) counts in full up to CROWD_KNEE, and past it with diminishing
  // returns toward CROWD_KNEE + room(), room = CROWD_ROOM + ROOM_STEP per 店面扩建 level. Game setting, so the late shop keeps
  // growing without traffic running away; 店面扩建 is the open-ended place late cash goes (cost ×1.45 a level, the gain shrinks).
  // 人气 multiplies outside the cap, like 老主顾: it has a max level, and a level bought is the walk-ins it says (inside the cap,
  // a collector's 人气 Lv6 added +0.7%).
  const CROWD_KNEE = 1.4, CROWD_ROOM = 1, ROOM_STEP = 0.15;
  // Game settings: cheaper early shelves, supply and traffic help the first shop grow without
  // bringing the clerk's large restocking rounds forward. Every new shop uses the same prices.
  // Pack/card market prices are unchanged; of the series unlock thresholds only me01 moved (below).
  const COST_X = 4, EARLY_DISCOUNT = 0.65;
  // me01 (超级进化) at 15000 ×4 = $60,000 (was $100,000): the first hour's shop makes about that much, so its unlock — a new set, a story beat, new customers —
  // lands near minute 55, where the half hour after the clerk had only $2–3k upgrades left to wait for (ROADMAP loop 29).
  const UNLOCK: Record<string, number> = { 'sv08.5': 400, 'sv03.5': 2000, sv09: 10000, me01: 15000, me02: 60000, me03: 100000, me04: 160000, me05: 250000 }; // ×COST_X below // lifetime revenue needed before a set can be stocked
  const UPGRADES: Record<string, { name: string; desc: string; costs: number[] }> = {
    signage:  { name: '招牌', desc: `顾客肯多付 +${Math.round(SIGN_STEP * 100)} 个百分点 / 级，更多收藏党和找卡的`, costs: [120, 260, 570, 1250, 2750].map(c => c * COST_X) },
    racks:    { name: '货架', desc: '多一个货架，可以多摆一个系列', costs: SETS.slice(RACK_BASE).map((_, i) => Math.round(Math.round(200 * 1.6 ** i / 10) * 10 * COST_X * (i < 2 ? EARLY_DISCOUNT : 1))) }, // up to one per set: a second shelf of a set is only more depth
    depth:    { name: '加层', desc: `每个货架多放 ${DEPTH_STEP} 包`, costs: [80, 160, 320, 640].map(c => c * COST_X) },
    case:     { name: '展示柜', desc: `多 ${CASE_STEP} 个柜位（3、4 级各多 1 个）`, costs: [150, 330, 360, 370, 1600].map(c => c * COST_X) },
    supplier: { name: '进货渠道', desc: `进货价再低 ${WHOLESALE_STEP * 100} 个百分点`, costs: [300, 750, 1900, 4700].map((c, i) => Math.round(c * COST_X * (i === 0 ? EARLY_DISCOUNT : 1))) },
    expand:   { name: '店面扩建', desc: `口碑客流的上限 +${ROOM_STEP}`, costs: Array.from({ length: 12 }, (_, i) => Math.round(2000 * 1.55 ** i / 100) * 100 * COST_X) },
    clerk:    { name: '店员', desc: `替你巡货架、用现金进货（含打烊时；钱不够时每架按缺的比例分；账单前 ${BILL_KEEP / 60} 分钟不动账款），仓库里的货随时搬上架（留 ${CLERK_KEEP} 包给你拆）。1 级帮工：每 ${CLERK_ROUND_1 / 60} 分钟一轮，有货架卖空就马上来一轮（至少隔 ${CLERK_EMPTY} 秒），补到半满；2 级：每 ${CLERK_ROUND / 60} 分钟一轮，热销的系列补满；3 级：全部补满，并把散卡卖给同行`, costs: [240, 260, 2600].map(c => c * COST_X) }, // ponytail: no wage; add one if cash piles up unspent
  };
  // Skills: base is the regular first-level price; early counts discounted levels.
  // 手气 multiplies the hit rates a pack is opened with; the measured rates in sets.ts are never touched, and every pack is
  // recorded with the odds it was opened at, so 欧气检测 compares it with packs opened at the same odds.
  const SKILLS: Record<string, { name: string; group: string; desc: string; max: number; base: number; grow: number; early?: number; step: number; fx: (lv: number) => string }> = {
    luck: { name: '手气', group: '幸运', desc: '游戏加成：自己开包时给闪卡概率乘系数，TCGplayer 实测基础数据不变', max: 5, base: 400 * COST_X, grow: 2.2, step: 0.05, fx: lv => `闪卡概率 ×${S.roundM(1 + 0.05 * lv).toFixed(2)}` },
    talk: { name: '口才', group: '经营', desc: '顾客肯付的上限（倒爷除外）', max: 10, base: 250 * COST_X, grow: 1.5, step: 0.02, fx: lv => `肯多付 +${Math.round(2 * lv)} 个百分点` },
    crowd: { name: '人气', group: '经营', desc: '进店人数，乘在口碑客流外面，不受客流上限递减', max: 10, base: 300 * COST_X, grow: 1.5, early: 2, step: 0.1, fx: lv => `进店 +${Math.round(10 * lv)}%` },
    watch: { name: '看店', group: '经营', desc: `离线销售奖励每级 +${Math.round(OFFLINE_BONUS * 100)}%；雇店员后每级另延长 2 小时经营，没店员最多 ${NOCLERK_CAP / 3600} 小时`, max: 3, base: 600 * COST_X, grow: 2.5, step: 2, fx: lv => `最多 ${lvl('clerk') ? OFFLINE_CAP / 3600 + 2 * lv : NOCLERK_CAP / 3600} 小时，离线销售奖励 +${Math.round(OFFLINE_BONUS * 100 * lv)}%` },
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
    hire: { name: '老店员', group: '经营', desc: '新店开张就有 2 级店员，所有系列勾好自动补货', max: 1, base: 3, fx: lv => lv ? '开张就有店员' : '要自己雇' },
    luck: { name: '手气底子', group: '幸运', desc: '技能「手气」的上限多一级，实测基础概率不变', max: 2, base: 4, fx: lv => `手气最高 ×${S.roundM(1 + SKILLS.luck.step * (SKILLS.luck.max + lv)).toFixed(2)}` },
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
  const slots = () => CASE_BASE + CASE_GAINS.slice(0, lvl('case')).reduce((a, b) => a + b, 0);
  const revenue = () => state.earned.sealed + state.earned.singles;
  const unlockAt = (id: string) => Math.round((UNLOCK[id] || 0) * COST_X * (1 - ACCESS_STEP * perk('access')));
  const unlocked = (id: string) => revenue() >= unlockAt(id);
  const trophyBonus = () => { const t = state.gallery[PEDESTAL]; return t ? t.price / (t.price + 150) * 0.5 : 0; }; // 0..0.5, more for pricier cards: the card on the 镇店台
  const shelfQty = (id: string) => shelves().reduce((a, s) => a + (s.id === id ? s.qty : 0), 0);
  const facings = (id: string) => shelves().filter(s => s.id === id && s.qty > 0).length;
  const pctOf = (id: string) => state.price[id] ?? DEFAULT_PCT;
  const ask = (id: string) => Math.round(sealedPrice(id) * pctOf(id) * 100) / 100;
  const cardPct = (c: { pct?: number }) => c.pct ?? 1;
  const casePct = () => state.casePct ?? CASE_PCT;
  const buyPct = () => state.buyPct ?? BUY_PCT;
  const binderN = () => Object.values(state.singles).reduce((a, c) => a + (S.HITS.includes(c.kind) ? c.count : 0), 0);
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
  const street = (n = state.branch.n) => STREETS[n % STREETS.length]; // derived from the shop number: a bankruptcy keeps the street, old saves need nothing
  const demand = (id: string) => {
    const d0 = DEMAND[id] || { tag: '', w: 1, tol: 0, budget: 1 }, st = street(), x = st.sets?.[id];
    const d = st === STREETS[0] ? d0 : { ...d0, tag: x?.tag ?? d0.tag, w: d0.w * (x?.w ?? 1), tol: d0.tol + (st.tol ?? 0) + (x?.tol ?? 0), budget: d0.budget * (st.budget ?? 1) * (x?.budget ?? 1) };
    return master(id) ? { ...d, tol: d.tol + MASTER.tol, w: d.w * MASTER.w } : d;
  };
  const dexBonusOf = (id: string) => DEX_TIERS.reduce((a, [at, b]) => a + (dexShare(id) >= at - 1e-9 ? b : 0), 0);
  const dexBonus = () => SETS.reduce((a, s) => a + dexBonusOf(s.id), 0);
  const lineup = () => SETS.reduce((a, s) => a + (unlocked(s.id) ? DEMAND[s.id]?.crowd || 0 : 0), 0);
  const crowdRaw = () => (1 + dexBonus()) * (1 + lineup()); // 图鉴 word of mouth × new sets, before the cap
  const room = () => CROWD_ROOM + ROOM_STEP * lvl('expand');
  const crowdCap = () => CROWD_KNEE + room();
  const crowdMult = (raw = crowdRaw()) => raw <= CROWD_KNEE ? raw : CROWD_KNEE + (raw - CROWD_KNEE) / (1 + (raw - CROWD_KNEE) / room());
  const rate = () => ARRIVAL * (street().crowd ?? 1) * (1 + REG_STEP * perk('regulars')) * (1 + SKILLS.crowd.step * skill('crowd')) * crowdMult(); // walk-ins per second; 老主顾 and 人气 sit outside the cap (each has its own max)
  const fresh = (): State => ({ cash: START_CASH, stock: {}, singles: {}, opened: {}, tally: {}, pulled: 0, costOpened: 0, hits: [], earned: { sealed: 0, singles: 0 }, customers: 0, log: [], shelves: [], price: {}, cust: { visits: 0, sold: 0, pricey: 0, none: 0 }, recent: [],
    up: {}, dex: {}, dexPacks: 0, dexSeen: {}, auto: {}, shown: [], heat: {}, heatT: 0, lost: 0, savedAt: clock(), offline: null, away: null, flipT: {}, clerkT: 0, skills: {}, packsBy: {}, miss: {}, ach: {}, feat: {}, branch: { n: 0, fame: 0, got: 0, life: 0, perks: {} },
    debt: DEBT0, owe: DEBT0, loan: 0, week: 1, shopT: 0, billsPaid: 0, loans: [], overdue: null, best: 0, weekRev0: 0, wreck: null, gallery: Array(ROOM_SLOTS).fill(null), galleryAcc: 0, extra: { tickets: 0, idle: 0, offline: 0 }, comm: null, commAt: 0, commPaid: 0, v: SAVE_V });

  let migrated = false, state = load(), luckCache: Luck | null = null, lastTick = state.savedAt, vnow = lastTick, dexN: Record<string, number> | null = null, handN: Record<string, Set<string>> | null = null; // dexN: per-set dex counts, cleared when dexSeen changes // first tick after load credits the time the tab was closed
  // 暂停 (pause): while a story scene plays the shop clock stands still (no walk-ins, no sales, no bill clock, no clerk round, no 行情
  // reroll), unlike 离开, which is the shop trading without you. Set by pause(true) and read only by tick(); not saved.
  let pausedAt: number | null = null;
  let idle = false; // 挂机: the player has the 货柜 page open and in view (setIdle); not saved
  let listedRun = 0, listedLogAt = 0; // 带徒弟's listings not yet in 店内动态, and when the last line went in; not saved
  const listeners: ((ev?: GameEvent) => void)[] = [];
  const emit = (ev?: GameEvent) => { save(); listeners.forEach(f => f(ev)); };
  // Debt events raised inside tick() wait here and go out one emit each once the tick is done.
  let pending: GameEvent[] = [];
  let reveal = false; // tick(busy): packs are being revealed, so their cards (already in singles) are not in the binder yet
  const flush = () => { const evs = pending; pending = []; evs.forEach(emit); return evs.length > 0; };
  // A pre-债务 save's first tick credits the closed time as usual, but its bill clock starts now: the first bill is a full week away.
  if (migrated) state.shopT = -Math.max(0, Math.min((clock() - state.savedAt) / 1000, offlineCap()));

  // A saved request counts only if it still names a real hit card of a real set, with finite positive amounts and a reward no bigger than COMM_PAY × the price; a
  // damaged one is no request (null), never half of one. Its deadline can't lie further out than a fresh request's.
  function commCard(x: unknown, shopT: number): Commission | null {
    try {
      const c = x as Partial<Commission> | null; if (!c || typeof c.set !== 'string' || typeof c.n !== 'string' || !Object.hasOwn(DATA, c.set)) return null;
      const d = DATA[c.set].cards.find(k => k.n === c.n);
      if (!d || !BUY_R.includes(d.r) || c.kind !== d.r || c.r !== d.r || !(typeof c.price === 'number' && c.price > 0 && Number.isFinite(c.price)) || !(typeof c.reward === 'number' && c.reward > 0 && c.reward <= c.price * COMM_PAY + 0.01) || !(typeof c.due === 'number' && Number.isFinite(c.due))) return null;
      return { set: c.set, n: c.n, name: d.name, r: d.r, kind: d.r, price: c.price, reward: c.reward, due: Math.min(c.due, shopT + COMM_LEN) };
    } catch { return null; }
  }
  // A saved gallery card counts only if it still is a whole card whose key is its own identity (set|n|kind, as every singles key is); a damaged
  // one is an empty slot, never half a card: a card without its kind would come home to the binder as bulk and be sold by the clerk.
  function galleryCard(x: unknown): Exhibit | null {
    const c = x as Partial<Exhibit> | null;
    return c && typeof c.set === 'string' && typeof c.n === 'string' && typeof c.kind === 'string' && typeof c.r === 'string' && typeof c.name === 'string' && c.key === `${c.set}|${c.n}|${c.kind}` && Number.isFinite(c.price) && c.price! >= 0 ? c as Exhibit : null;
  }
  function fin(v: unknown) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0; } // a saved amount of money: a finite number from zero up, or nothing. A declaration: load() runs before any const below it
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
        for (const r of [st.offline, st.away]) if (r) {
          if (!validDetail(r.detail)) delete r.detail; // a receipt from before the breakdown has none, and a damaged one is no better: neither is ever half-filled
          for (const f of ['tickets', 'bonus'] as const) if (f in r) { const v = fin(r[f]); if (v) r[f] = v; else delete r[f]; } // a damaged amount would break the sums and the 离开 line: it counts as none
        }
        // 收藏室 (state.v): a save without v has the old two-part room, a separate `trophy` and five slots. The trophy becomes the 镇店台 (gallery[0]) and the
        // five slots follow it as 第 1–5 格, so every card keeps standing; the trophy field goes. Each card is validated alone (a damaged one is an empty place),
        // the room is padded or cut to ROOM_SLOTS, and a whole card that no longer fits goes home to the binder: nothing is lost on the way.
        const kept: unknown[] = Array.isArray(s.gallery) ? s.gallery : [], places = s.v >= 2 ? kept : [galleryCard(s.trophy), ...kept];
        st.gallery = Array.from({ length: ROOM_SLOTS }, (_, i) => galleryCard(places[i]));
        for (const x of places.slice(ROOM_SLOTS)) { const c = galleryCard(x); if (c) { const { key, ...card } = c; (st.singles[key] ||= { ...card, count: 0 }).count++; } }
        delete st.trophy;
        // v3: 店员 got a first level below the old one (帮工), so an old save's 店员 Lv 1 / Lv 2 is Lv 2 / Lv 3 now: the same clerk, same rounds
        if (!(s.v >= 3) && st.up?.clerk > 0) st.up = { ...st.up, clerk: Math.min(UPGRADES.clerk.costs.length, st.up.clerk + 1) };
        // v4: the old 展示柜 Lv 3 (+2 slots) is Lv 3 + Lv 4 (+1 each) now, so an old Lv 3 / Lv 4 loads as Lv 4 / Lv 5: the same slots
        if (!(s.v >= 4) && st.up?.case >= 3) st.up = { ...st.up, case: Math.min(UPGRADES.case.costs.length, st.up.case + 1) };
        st.v = SAVE_V;
        st.extra = { tickets: fin(s.extra?.tickets), idle: fin(s.extra?.idle), offline: fin(s.extra?.offline) }; st.galleryAcc = fin(s.galleryAcc) < 1 ? fin(s.galleryAcc) : 0;
        { const t = Number.isFinite(st.shopT) ? st.shopT : 0; st.comm = commCard(s.comm, t); st.commAt = Math.min(fin(s.commAt), Math.max(0, t)); st.commPaid = fin(s.commPaid); } // a save from before 找卡委托: nobody asking, cooldown 0, nothing paid
        for (const c of [...st.hits, ...Object.values(st.singles), ...st.shown, ...st.gallery.filter(Boolean)] as { set: string; n: string; name: string }[]) { const d = DATA[c.set]?.cards.find(x => x.n === c.n); if (d) c.name = d.name; } // saves from before the Chinese card names carry the English one
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

  // 大师套 is also a story beat (the binder closes and its cover is stamped, ui/story.ts); a pull that finishes the set by hand
  // plays only 'hand' (pushed right after, in open())
  const dexLog = (id: string, before: number) => { if (dexBonusOf(id) > before && master(id) && !handDone(id)) pending.push({ type: 'story', id: 'master', set: id }); if (dexBonusOf(id) > before) log(master(id)
    ? `大师套：${setById(id).name} 收齐了！回头客 +${Math.round(dexBonusOf(id) * 100)}%${crowdRaw() > CROWD_KNEE ? `（全店客流过 ×${CROWD_KNEE} 后递减，现在 ×${crowdMult().toFixed(2)}）` : ''}，这个系列的拆包玩家肯多付 ${Math.round(MASTER.tol * 100)} 个百分点`
    : `图鉴：${setById(id).name} 收录 ${Math.round(dexShare(id) * 100)}%，客流加成 +${Math.round(dexBonusOf(id) * 100)}%${crowdRaw() > CROWD_KNEE ? `（全店过 ×${CROWD_KNEE} 后递减，现在 ×${crowdMult().toFixed(2)}）` : ''}`, 'hit'); };

  // 图鉴补卡: missing hits of a set, cheapest first, at today's market price.
  const missing = (id: string) => DATA[id].cards.filter(c => BUY_R.includes(c.r) && !state.dexSeen[`${id}|${c.n}`])
    .map(c => ({ n: c.n, name: c.name, r: c.r, price: S.cardPrice(id, c.n, c.r)! })).sort((a, b) => a.price - b.price);
  // Buys the cheapest missing hit (all of them, or the cheapest n) into the binder. Never into singles/case/收藏室, so it cannot be resold.
  function collect(id: string, all: boolean | number = false) {
    const miss = missing(id), buy = typeof all === 'number' ? miss.slice(0, all) : all ? miss : miss.slice(0, 1), cost = buy.reduce((a, c) => a + c.price, 0);
    if (!unlocked(id) || !buy.length || state.cash < cost) return false;
    const before = dexBonusOf(id);
    state.cash -= cost; for (const c of buy) state.dexSeen[`${id}|${c.n}`] = 1; dexN = null;
    log(`图鉴补卡：${buy.length > 1 ? `${setById(id).name}闪卡 ${buy.length} 张` : buy[0].name}`, '', -cost);
    dexLog(id, before);
    emit(); flush(); return true; // flush: the 大师套 beat dexLog may have queued
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

  // ---------- shop: customers, display case, upgrades ----------
  function toCase(key: string, pct = casePct()) { // one copy of a hit from singles into the case, no log or save
    const c = state.singles[key];
    if (!c || state.shown.length >= slots() || !S.HITS.includes(c.kind)) return false;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    state.shown.push({ key, ...card, pct });
    return true;
  }
  function list(key: string) { if (!toCase(key)) return false; emit(); return true; }
  // 补满柜位 (and 带徒弟, every tick): the case shows the priciest hits the shop holds, at the case tag. Free slots take the priciest
  // hits in the binder; then, while a binder card is worth more than the cheapest card in the case, the two swap (the cheaper one
  // goes back to the binder, where seekers still find it). With the binder on the counter the case is what collectors look at, so
  // it should hold the big cards (GAMEPLAY §14). Returns how many cards went in.
  const binderHits = () => Object.entries(state.singles).filter(([, c]) => S.HITS.includes(c.kind)).sort((a, b) => b[1].price - a[1].price);
  function stockCase() {
    let n = 0;
    for (const [k] of binderHits()) { if (state.shown.length >= slots()) break; while (state.shown.length < slots() && toCase(k)) n++; }
    for (let top = binderHits()[0]; top && state.shown.length; top = binderHits()[0]) {
      const low = state.shown.reduce((a, c, i) => (c.price < state.shown[a].price ? i : a), 0);
      if (top[1].price <= state.shown[low].price) break;
      const { key, pct, ...card } = state.shown.splice(low, 1)[0]; (state.singles[key] ||= { ...card, count: 0 }).count++;
      toCase(top[0]); n++;
    }
    return n;
  }
  // How many cards 补满柜位 would put in (free slots, then swaps), without touching state.
  function caseMoves() {
    const bind = binderHits().flatMap(([, c]) => Array(c.count).fill(c.price) as number[]), free = Math.min(slots() - state.shown.length, bind.length);
    const inCase = [...state.shown.map(c => c.price), ...bind.slice(0, free)].sort((a, b) => a - b), rest = bind.slice(free);
    let swaps = 0; while (swaps < rest.length && swaps < inCase.length && rest[swaps] > inCase[swaps]) swaps++;
    return free + swaps;
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
  // 收卡价: what you pay a counter seller, share of market, BUY_MIN…BUY_MAX (at BUY_MIN hardly anyone sells: that is 不收).
  const BUY_MIN = 0.3, BUY_MAX = 1;
  function setBuyPct(pct: number, commit = true) { state.buyPct = Math.round(Math.round(Math.min(BUY_MAX, Math.max(BUY_MIN, pct)) / PCT_STEP) * PCT_STEP * 100) / 100; if (commit) emit(); }
  function setCasePct(pct: number, commit = true) { state.casePct = clampPct(pct); for (const c of state.shown) c.pct = state.casePct; if (commit) emit(); }
  // ---------- 收藏室 ----------
  // The player's own collection on show. Not for sale and not offered to anyone: customers, the case, 带徒弟 and the clerk's bulk sale all look
  // only at singles and the case. Each place holds one physical copy; moving between here and the binder never makes or loses one.
  // Place PEDESTAL is the 镇店台: its card is the 镇店之宝 (trophyBonus), and it counts toward 藏品总值 and the ticket like any other exhibit.
  // The room survives 开分店 and 破产 (restart); only 清空存档 clears it. Every move returns false, changing and saving nothing, when it is refused.
  const galleryCards = () => state.gallery.filter((c): c is Exhibit => !!c);
  const galleryValue = () => cents(galleryCards().reduce((a, c) => a + c.price, 0)); // the prices the cards are shown at
  const ticketPrice = () => galleryCards().length ? Math.max(TICKET_MIN, Math.min(TICKET_MAX, Math.floor(Math.sqrt(galleryValue()) / 5))) : 0;
  const slotOk = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < ROOM_SLOTS;
  const revealing = () => reveal;
  // The binder's copy of a card → one place, out of its pocket. Refused during a reveal: the cards just pulled are already in singles and not flipped yet.
  function takeSingle(key: string): Exhibit | null {
    if (reveal || typeof key !== 'string' || !Object.hasOwn(state.singles, key)) return null;
    const c = state.singles[key]; if (!(c.count > 0)) return null;
    if (!--c.count) delete state.singles[key];
    const { count, ...card } = c;
    return { key, ...card };
  }
  // Singles → an empty place (the pedestal is place 0, the 展位 are 1–5).
  function collectToGallery(key: string, slot: number) {
    if (!slotOk(slot) || state.gallery[slot]) return false;
    const card = takeSingle(key); if (!card) return false;
    state.gallery[slot] = card;
    log(`收藏室：${card.name} 摆${slot === PEDESTAL ? '上镇店台' : `进第 ${slot} 格`}，门票 $${ticketPrice()}`);
    emit(); return true;
  }
  // Singles → the 镇店台, in one call: whatever stood there goes home to the binder (the 卡本 镇店 button). The collectors it drew follow the new card.
  function toPedestal(key: string) {
    const old = state.gallery[PEDESTAL], card = takeSingle(key); if (!card) return false;
    state.gallery[PEDESTAL] = card;
    if (old) { const { key: k, ...o } = old; (state.singles[k] ||= { ...o, count: 0 }).count++; } // after the take: the same card swapping with its own copy leaves the pocket as it was
    log(`镇店之宝：${card.name}，来的收藏党 +${Math.round(trophyBonus() * 300)}%`);
    emit(); return true;
  }
  function uncollect(slot: number) { // back to singles, whatever the binder holds (BINDER only limits 收卡)
    const g = slotOk(slot) ? state.gallery[slot] : null; if (!g) return false;
    const { key, ...card } = g; state.gallery[slot] = null;
    (state.singles[key] ||= { ...card, count: 0 }).count++;
    log(`收藏室：${card.name} 放回卡本`);
    emit(); return true;
  }
  function moveCollect(from: number, to: number) { // an occupied slot and an empty one: moves; two occupied: swap
    if (!slotOk(from) || !slotOk(to) || from === to || (!state.gallery[from] && !state.gallery[to])) return false;
    [state.gallery[from], state.gallery[to]] = [state.gallery[to], state.gallery[from]];
    emit(); return true;
  }
  // ---------- 找卡委托 (rules at COMM_GAP) ----------
  const commKey = (c: Commission) => `${c.set}|${c.n}|${c.kind}`; // its card's key in singles
  const commLeft = () => state.comm ? Math.max(0, state.comm.due - state.shopT) : 0; // seconds of shop time (the story pauses it, an absence moves it)
  const commCap = () => Math.min(COMM_CAP1, COMM_CAP0 + revenue() / COMM_CAP_REV);
  const commCards: Record<string, { n: string; name: string; r: string; price: number }[]> = {}; // per set, market data that never changes while the page is open: listed once
  const commList = (id: string) => (commCards[id] ||= DATA[id].cards.filter(c => BUY_R.includes(c.r)).map(c => ({ n: c.n, name: c.name, r: c.r, price: S.cardPrice(id, c.n, c.r) ?? 0 })));
  function commDraw(): Commission | null {
    const cap = commCap(), ids = [...new Set(shelves().flatMap(s => s.id && unlocked(s.id) ? [s.id] : []))];
    const pool = ids.flatMap(id => commList(id).filter(c => c.price >= Math.max(COMM_MIN, cap * COMM_FLOOR) && c.price <= cap).map(c => ({ id, c, w: cardOdds(id, c.n) ** 2 })));
    const total = pool.reduce((a, p) => a + p.w, 0); if (!(total > 0)) return null;
    const seed = [Math.floor(clock() / 1000), state.branch.n, state.branch.broke || 0, Math.round(state.shopT)].reduce((a, v) => Math.imul(a ^ v, 0x9E3779B1) + 0x7F4A7C15 | 0, 0x811C9DC5);
    // half the requests (when the binder holds a fitting card) ask for one the player already has: a choice to make now — hand it over at
    // ×COMM_PAY, or keep it for the case — rather than a lottery on packs (a reviewer got three requests and could serve none)
    const r = S.rng(seed), held = pool.filter(p => state.singles[`${p.id}|${p.c.n}|${p.c.r}`]?.count > 0), from = held.length && r() < COMM_HELD ? held : pool;
    let x = r() * from.reduce((a, p) => a + p.w, 0); const { id, c } = from.find(p => (x -= p.w) < 0) ?? from[from.length - 1];
    return { set: id, n: c.n, name: c.name, r: c.r, kind: c.r, price: c.price, reward: cents(c.price * COMM_PAY), due: state.shopT + COMM_LEN };
  }
  // Once per tick, while the player is here: the open request lapses at its deadline (commAt = the deadline itself, however late the tick that saw it), or a new one is asked
  // for when the cooldown is over and the shop has a clerk or COMM_OPEN seconds behind it. True when that changed the request, so tick() tells the panels.
  // 店内动态 says each turn of a request: asked for, its card in the binder (from a pack or 收卡: a reviewer's arrived with no line naming it), lapsed.
  let commHeld = false; // the open request's card was in the binder at the last look; not saved
  function commWork() {
    if (!commissions) return false;
    const c = state.comm;
    if (c) {
      if (state.shopT >= c.due) { state.comm = null; state.commAt = c.due; commHeld = false; log(`找卡委托过期：${c.name}`); return true; }
      if (!reveal) { const held = (state.singles[commKey(c)]?.count ?? 0) > 0; if (held && !commHeld) log(`委托要的${c.name}进了卡本，可以交付`, 'hit'); commHeld = held; } // not mid-reveal: the line would give away the pull before its card is flipped
      return false;
    }
    if (state.shopT - state.commAt < COMM_GAP || !(lvl('clerk') || state.shopT >= COMM_OPEN)) return false;
    state.comm = commDraw(); if (!state.comm) return false;
    commHeld = !reveal && (state.singles[commKey(state.comm)]?.count ?? 0) > 0; log(`有人来找卡：${state.comm.name}，报酬 $${state.comm.reward.toFixed(2)}${commHeld ? '（卡本里就有）' : ''}`);
    return true;
  }
  // Serves the request: one copy of its card leaves the binder (takeSingle: nothing while packs are being revealed, and none from the case or the 收藏室) and the reward comes in.
  function deliverCommission() {
    const c = state.comm; if (!c || !takeSingle(commKey(c))) return false;
    state.cash += c.reward; state.earned.singles += c.reward; state.commPaid = cents(state.commPaid + c.reward);
    log(`交付找卡委托：${c.name}`, 'gain', c.reward);
    state.comm = null; state.commAt = state.shopT;
    emit(); return true;
  }
  function dismissCommission() { // 不接: no penalty, the cooldown starts now
    if (!state.comm) return false;
    state.comm = null; state.commAt = state.shopT;
    emit(); return true;
  }
  const upgradeCost = (k: string): number | undefined => UPGRADES[k].costs[lvl(k)];  // undefined once maxed
  const skillCost = (k: string) => skill(k) < skillMax(k) ? Math.round(SKILLS[k].base * SKILLS[k].grow ** skill(k) * (skill(k) < (SKILLS[k].early || 0) ? EARLY_DISCOUNT : 1)) : undefined;
  // 成长树 (src/growth.ts, game setting): the first level of a node needs Lv 1 of its parent, and the 柜台 roots (展示柜, 手气) need a
  // card the shop really has. Only the first level asks: levels already owned (a save from before the tree, the 旧货架 perk) stay
  // effective and keep upgrading, so there is no marker or migration to keep. growthLock is the one answer canUpgrade / canLearn /
  // upgrade / learn and the 成长 page share ('' = open, otherwise what is missing); 店面扩建 also keeps its 客流上限 condition at every level.
  const owned = (k: string) => k in UPGRADES ? lvl(k) : skill(k);
  const growthName = (k: string) => (UPGRADES[k] || SKILLS[k]).name;
  // A card the shop really has: a pack opened (the lifetime counter, kept by every restart), a card taken at the counter, held, shown or kept in
  // the 收藏室. 图鉴补卡 only marks the 图鉴 and 战利品 is a record, so neither is a card. A legacy shop that already owns 展示柜 or 手气 stays open.
  const cardBranchReady = () => state.pulled > 0 || !!state.intake?.n || lvl('case') > 0 || skill('luck') > 0
    || state.shown.length > 0 || state.gallery.some(Boolean) || Object.values(state.singles).some(c => c.count > 0);
  function growthLock(k: string): string {
    if (!owned(k)) {
      const p = GROWTH_PARENTS[k as GrowthKey];
      if (p && !owned(p)) return `先${p in UPGRADES ? '买' : '学'}「${growthName(p)}」Lv 1`;
      if (GROWTH_TREES.some(t => t.milestone === 'cards' && t.roots.some(r => r.k === k)) && !cardBranchReady()) return '先开一包，或收进一张卡';
    }
    return k === 'expand' && crowdRaw() <= CROWD_KNEE ? `图鉴收录和新系列解锁的客流加成超过 ×${CROWD_KNEE} 后可扩建` : ''; // 扩建 only lifts a cap the shop has reached
  }
  const canUpgrade = (k: string) => !growthLock(k), canLearn = canUpgrade;
  function learn(k: string) {
    const cost = skillCost(k);
    if (cost == null || state.cash < cost || !canLearn(k)) return false;
    const r0 = rate();
    state.cash -= cost; state.skills[k] = skill(k) + 1; bought(k, cost);
    log(`技能：${SKILLS[k].name} Lv${skill(k)}（${SKILLS[k].fx(skill(k))}${walkIns(r0)}）`, '', -cost);
    emit(); return true;
  }
  // 闲钱: cash left once the bill 九姐 collects next (or the overdue one) is set aside. The 成长 badge and 下一步 only count what this
  // covers: a first-timer who spends the till on growth before the first bill borrows every week after and never clears the debt
  // (autoplay 冲动新手, GAMEPLAY.md §8). Game setting.
  const REFUND = 1 - LOAN_RATE;
  const spare = () => { const b = nextBill(); return Math.max(0, state.cash - (state.overdue?.amount ?? (b ? b.amount + b.loanPay : 0))); }; // 顺手还 is set aside too: spending it keeps the loan growing
  const bought = (k: string, cost: number) => { (state.bought ||= []).push({ k, cost, week: state.week }); };
  // 退回 (game setting): a level bought in the week whose bill the till now can't cover goes back for REFUND of its price — the way
  // back for buying before the bill. Only the top level of each, only while short. REFUND = 1 − LOAN_RATE: buying after a bill and
  // returning before the next costs what borrowing that week would, so it is never a free rental (at full price autoplay did it
  // every week), yet unlike a loan nothing compounds.
  // What 退回 could return if nothing depended on it: this week's last buy of each k, while the till is short of the bill.
  function refundRows() {
    const o = state.overdue, b = nextBill(), short = o ? state.cash < o.amount : !!b && state.cash < b.amount;
    if (!short) return [];
    const wk = o?.week ?? state.week, top = new Map<string, { k: string; cost: number; week: number }>();
    for (const x of state.bought || []) top.set(x.k, x); // the last buy of each k is its top level
    return [...top.values()].filter(x => x.week >= wk);
  }
  // Levels a 名气 perk keeps in every shop: 旧货架 holds 货架 and 加层, 老店员 holds 店员. A level paid for and then covered by the perk
  // is the perk's now: its 退回 returns the money (the record is used up once) but the level stays, so the perk is never refunded away.
  const permanent = (k: string) => k === 'racks' || k === 'depth' ? perk('fit') : k === 'clerk' && perk('hire') ? 2 : 0;
  // The level k stands at once its last paid level goes back; never below the perk's floor, never above what it has.
  const refundTo = (k: string) => Math.min(owned(k), Math.max(owned(k) - 1, permanent(k)));
  // A parent's last level never goes back while a level of its child stands on it: growthLock only asks at a first level, so
  // returning the parent first would be a way round it. The child goes back first (its own rule), then the parent.
  function depBlock(k: string): string {
    if (refundTo(k) > 0) return '';
    const kid = GROWTH_KEYS.find(c => GROWTH_PARENTS[c] === k && owned(c) > 0);
    return kid ? `先退回「${growthName(kid)}」，才能退回「${growthName(k)}」的第 1 级` : '';
  }
  const refundable = () => refundRows().filter(x => !depBlock(x.k));
  const refundBlock = (k: string) => refundRows().some(x => x.k === k) ? depBlock(k) : ''; // '' unless k would be refundable but for its child
  function refund(k: string) {
    const x = refundable().find(x => x.k === k); if (!x) return false;
    const o = k in UPGRADES ? state.up : state.skills, got = cents(x.cost * REFUND), was = owned(k); o[k] = refundTo(k);
    state.bought!.splice(state.bought!.lastIndexOf(x), 1); state.cash += got;
    if (k === 'racks') for (const sh of state.shelves.splice(racks())) if (sh.id) state.stock[sh.id] = (state.stock[sh.id] || 0) + sh.qty; // back room may go past WAREHOUSE; buying waits
    if (k === 'depth') for (const sh of state.shelves) if (sh.id && sh.qty > depth()) { state.stock[sh.id] = (state.stock[sh.id] || 0) + sh.qty - depth(); sh.qty = depth(); }
    if (k === 'case') for (const c of state.shown.splice(slots())) { const { key, pct, ...card } = c; (state.singles[key] ||= { ...card, count: 0 }).count++; }
    log(o[k] < was ? `退回：${growthName(k)} Lv${was}，扣一成` : `退回：${growthName(k)} 这一笔，扣一成（名气已送这一级，等级不变）`, 'gain', got);
    if (state.overdue && state.cash >= state.overdue.amount) settle(state.overdue);
    if (!flush()) emit(); return true;
  }
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
    state.cash -= cost; state.up[k] = lvl(k) + 1; bought(k, cost);
    if (k === 'clerk' && lvl(k) === 1) for (const s of SETS) if (shelves().some(o => o.id === s.id) || state.stock[s.id] || state.opened[s.id]) state.auto[s.id] = true;
    log(`升级：${UPGRADES[k].name} Lv${lvl(k)}${walkIns(r0)}`, '', -cost);
    emit(); return true;
  }

  // ---------- customers ----------
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const lognorm = (median: number, sigma: number) => median * Math.exp(sigma * gauss());
  const pickW = <T,>(items: T[], w: (it: T) => number) => { let x = random() * items.reduce((a, it) => a + w(it), 0); return items.find(it => (x -= w(it)) < 0) || items[0]; };
  const typeWeight = (t: string) => t === 'flipper' && state.shopT < OPENING ? 0 : TYPES[t].w * (street().types?.[t] ?? 1) * (t === 'collector' ? 1 + 0.15 * lvl('signage') + 3 * trophyBonus() : t === 'seeker' ? 1 + 0.15 * lvl('signage') : 1);
  // Highest share of market this customer will pay: the type's mean, plus signage, plus (collectors) the 镇店台 card, plus personal spread.
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
  // One card to a seeker, from the case (marked in `gone`, taken out after the loop) or the binder; v adds up what they took.
  const gone = new Set<Pull>();
  const sellFit = (f: { c: Pull; ask: number; pct: number; key: string }, v: Visit) => {
    if (f.key) { const c = state.singles[f.key]; if (!--c.count) delete state.singles[f.key]; } else gone.add(f.c);
    if (v.r !== 'sold') { v.r = 'sold'; v.card = f.c.name; v.price = f.c.price; v.pct = f.pct; v.n = 0; v.gain = 0; }
    v.n!++; v.gain = cents(v.gain! + f.ask); state.cash += f.ask; state.earned.singles += f.ask;
  };
  // 收卡: a pack buyer opens the n packs they just bought at the counter and offers every hit in them at your 收卡价 (if it clears
  // their floor), priciest first, while the binder has room and the till can pay. Records offer / took / paid on the visit.
  function counterBuy(id: string, n: number, v: Visit) {
    const floor = Math.max(0.2, SELLER.tol + SELLER.sd * gauss()), pct = buyPct(), got: Pull[] = [];
    for (let i = 0; i < n; i++) for (const c of S.openPack(id, random)) if (S.HITS.includes(c.kind)) got.push(c);
    v.offer = got.length; v.floor = floor; // offer 0: tore them open, nothing to sell
    if (!got.length) return;
    if (pct < floor - 1e-9) { v.sell = 'low'; return; }
    if (state.overdue) { v.sell = 'owe'; return; } // owing 九姐, the till keeps its cash for her
    let room = BINDER - binderN(), took = 0, paid = 0;
    const keep = dueIn() < BILL_KEEP ? nextBill()?.amount || 0 : 0; // the last minutes before a bill: the till keeps what it takes, 收卡 never spends 九姐's money
    for (const c of got.sort((a, b) => b.price - a.price)) {
      const cost = cents(c.price * pct); if (room <= 0 || state.cash - cost < keep) continue;
      room--; took++; paid += cost; state.cash -= cost; (state.singles[`${c.set}|${c.n}|${c.kind}`] ||= { ...c, count: 0 }).count++;
    }
    if (took < got.length) v.sell = room <= 0 ? 'full' : 'cash';
    if (!took) return;
    v.took = took; v.paid = cents(paid); const b = (state.intake ||= { n: 0, cost: 0 }); b.n += took; b.cost = cents(b.cost + paid);
  }
  const balk = (v: Visit, c: Shown, max: number) => { v.r = 'pricey'; v.card = c.name; v.price = c.price; v.pct = cardPct(c); if (v.pct <= max) v.why = 'budget'; };

  // One walk-in customer: picks an errand, looks at what is on the shelf/in the case at what price, buys or leaves, and is
  // kept in state.recent (see Visit). Returns the visit (what it took in is v.gain). r: 'sold' | 'pricey' (something matched but too dear, or they
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
        if (n >= 1 && pctOf(id) <= v.max) { sellPacks(id, n, v); if (random() < COUNTER_OPEN) counterBuy(id, n, v); } else { v.r = 'pricey'; v.price = sealedPrice(id); v.pct = pctOf(id); if (v.pct <= v.max) v.why = 'budget'; }
      }
    } else if (type === 'flipper') {
      const under = onShelf.filter(id => pctOf(id) <= tol), cheap = under.filter(id => !(state.flipT[id] > vnow)).sort((a, b) => pctOf(a) - pctOf(b))[0];
      const budget = lognorm(300, 0.5);
      if (cheap) { // a low price empties the shelf: they take up to 4–15 packs, then that set is off their list until resold
        const n = Math.min(shelfQty(cheap), Math.floor(budget / ask(cheap)), 4 + Math.floor(random() * 12), state.shopT < OPENING_CAP ? Math.ceil(shelfQty(cheap) * FLIP_SHARE) : Infinity);
        if (n >= 1) { sellPacks(cheap, n, v); state.flipT[cheap] = vnow + FLIP_COOLDOWN * 1000; }
      }
      if (v.r !== 'sold') {
        const i = hits.findIndex(c => cardPct(c) <= tol && cardAsk(c) <= budget);
        if (i >= 0) sellCard(i, v);
        else if (under.length) { v.r = 'pricey'; v.why = 'cool'; v.set = under[0]; }
        else if (onShelf.length || hits.length) v.r = 'pricey';
      }
    } else if (type === 'seeker') { // looks through the case and the counter binder (shut while packs are being revealed: the cards not flipped yet are in singles), cheapest first; takes up to `want` cards within budget
      const tier = pickW([0, 1, 2], i => SEEK_W[i]), any = random() < 0.4, sid = pickW(SETS.filter(s => unlocked(s.id)), () => 1).id;
      const ok = (c: Pull) => SEEK[tier].includes(c.kind) && (any || c.set === sid);
      // the binder copy an open 找卡委托 asks for is put aside: a reviewer's commission card was bought in at the counter and sold to a seeker 23 s later
      const held = state.comm ? commKey(state.comm) : '';
      const fits = [...hits.filter(ok).map(c => ({ c, ask: cardAsk(c), pct: cardPct(c), key: '' })),
        ...(reveal ? [] : Object.entries(state.singles)).filter(([, c]) => ok(c)).flatMap(([key, c]) => Array.from({ length: c.count - (key === held ? 1 : 0) }, () => ({ c, ask: Math.round(c.price * casePct() * 100) / 100, pct: casePct(), key })))].sort((a, b) => a.ask - b.ask);
      let budget = lognorm(60, 0.7), want = SEEK_N;
      v.tier = tier; if (!any) v.set = sid;
      if (!fits.length) { /* nothing of that rarity in the case or the binder */ }
      else if (fits[0].pct <= tol && fits[0].ask <= budget) {
        for (const f of fits) { if (!want || f.pct > tol || f.ask > budget) break; want--; budget -= f.ask; sellFit(f, v); }
        state.shown = state.shown.filter(c => !gone.has(c)); gone.clear();
      } else balk(v, { ...fits[0].c, pct: fits[0].pct } as Shown, tol);
    } else { // collector
      const budget = lognorm(150, 0.8), big = hits.map((c, i) => [c, i] as const).filter(([c]) => c.price >= BIG_CARD).sort((a, b) => b[0].price - a[0].price);
      const ok = big.find(([c]) => cardPct(c) <= tol && cardAsk(c) <= budget);
      if (ok) sellCard(ok[1], v);
      else if (big.length) balk(v, big[0][0], tol);
    }
    const c = state.cust; c.visits++;
    if (v.r === 'sold') {
      c.sold++; state.customers++;
      if (type === 'seeker' || type === 'collector') {
        const sales = state.cardSales ||= { seeker: 0, collector: 0 };
        if (!sales[type]) (state.cardFirst ||= {})[type] = v;
        sales[type]++;
      }
    } else if (v.r === 'pricey') c.pricey++; else { c.none++; state.lost++; }
    state.recent.unshift(v); while (state.recent.at(-1)!.at < vnow - MISS_WINDOW * 1000) state.recent.pop(); // bounded by rate() × MISS_WINDOW, and rate() is capped
    return v;
  }

  // The clerk (upgrade): once a round, tops up every shelf whose set has auto-restock on (buying straight onto it; half full at
  // level 1, full at level 2); at level 2 also sells the bulk to peers (every tick, like 带徒弟's listing).
  // Between rounds (every tick, and every catch-up slice while closed) the clerk also carries back-room stock of those sets onto
  // their shelves, keeping CLERK_KEEP packs back for the player to open: late in the game a shelf sells out in a minute or two,
  // so a back room the player keeps full is what keeps the shelves from standing empty until the next round. Game setting.
  function clerkWork(acc: { packs: number; spent: number; bulk: number; bulkV: number; listed: number; short: number }, t: number) {
    const L = lvl('clerk'); if (!L) return;
    if (skill('apprentice') && !reveal) acc.listed += stockCase(); // 带徒弟: 补满柜位 on every tick (not mid-reveal: those cards are not flipped yet)
    for (const id of new Set(shelves().filter(sh => sh.id && state.auto[sh.id] && sh.qty < depth() && state.stock[sh.id] > CLERK_KEEP).map(sh => sh.id!))) fill(id, state.stock[id] - CLERK_KEEP);
    // 帮工 (level 1) also goes round as soon as a shelf of his sets stands empty, at most every CLERK_EMPTY seconds: on 4-minute rounds
    // to half a 40-pack shelf sold out a minute in, and the first hire barely changed the 卖空→补到满 loop (a fresh-save reviewer, loop 30)
    const emptyNow = L === 1 && t - (state.clerkRound?.at ?? 0) >= CLERK_EMPTY * 1000 && shelves().some(sh => sh.id && state.auto[sh.id] && unlocked(sh.id) && !sh.qty);
    if (t >= state.clerkT || emptyNow) {
      state.clerkT = t + clerkRoundSecs() * 1000;
      const need = clerkNeed(), b = clerkBuy(); acc.packs += b.packs; acc.spent += b.spent; acc.short = clerkNeed();
      state.clerkRound = { at: t, need, spent: cents(need - acc.short) };
    }
    if (L >= 3) { const b = dumpBulk(); acc.bulk += b.n; acc.bulkV += b.v; }
  }
  // The clerk's buying (a round, or 现在补货): every shelf of a set he restocks, up to half full (levels 1–2) or full (level 3), in
  // shelf order, with the cash there is. clerkNeed = what that would still cost. Late in a shop the shelves sell out in a minute or
  // two, so a round made with the till emptied by an upgrade leaves them bare until the next one: the 店员没本钱 pit (GAMEPLAY §12).
  // per set: level 2 fills a hot (行情 热销) set to the top too — at twice the buyers half a shelf ran dry inside one round (a reviewer: five sell-outs in 13 minutes)
  const clerkGoal = (id?: string | null) => lvl('clerk') >= 3 || (lvl('clerk') >= 2 && id && (state.heat[id] || 1) > 1) ? depth() : Math.ceil(depth() / 2);
  const clerkRoundSecs = () => (lvl('clerk') === 1 ? CLERK_ROUND_1 : CLERK_ROUND);
  const clerkNeed = () => lvl('clerk') ? cents(shelves().reduce((a, sh) => a + (sh.id && state.auto[sh.id] && unlocked(sh.id) ? Math.max(0, clerkGoal(sh.id) - sh.qty) * wholesale(sh.id) : 0), 0)) : 0;
  // The bill is left in the till in its last BILL_KEEP seconds, as 收卡 does. Looking further ahead (10 minutes on every round, or only
  // on the first round after hiring) cost the long-run regressions (街口 fourth shop past 34 h; 店员没本钱 blind player down to 2 shops).
  const clerkKeep = () => (dueIn() < BILL_KEEP ? nextBill()?.amount || 0 : 0);
  // When the till can't cover every shelf, each gets the same share of what it lacks first, then what is left goes emptiest first:
  // in shelf order the first sets were filled and the last stayed at 0 round after round (a reviewer's 151 shelf, twice).
  function clerkBuy() {
    let packs = 0, spent = 0;
    const keep = clerkKeep(), want = shelves().filter(sh => sh.id && state.auto[sh.id] && unlocked(sh.id) && sh.qty < clerkGoal(sh.id));
    const need = want.reduce((a, sh) => a + (clerkGoal(sh.id) - sh.qty) * wholesale(sh.id!), 0), f = need > 0 ? Math.min(1, Math.max(0, state.cash - keep) / need) : 1;
    const buy = (sh: Shelf, n: number) => { const cost = n > 0 ? stockUp(sh.id!, n, sh) : 0; if (cost) { packs += n; spent += cost; } };
    if (f < 1) for (const sh of want) buy(sh, Math.floor((clerkGoal(sh.id) - sh.qty) * f));
    for (const sh of [...want].sort((a, b) => a.qty - b.qty)) buy(sh, Math.min(clerkGoal(sh.id) - sh.qty, Math.floor(Math.max(0, state.cash - keep) / wholesale(sh.id!))));
    return { packs, spent };
  }
  // What the clerk's last round left unbought for lack of cash (0 = he filled every shelf), while the shelves still lack it.
  const clerkShort = () => { const r = state.clerkRound; return r && lvl('clerk') ? Math.max(0, Math.min(r.need - r.spent, clerkNeed())) : 0; };
  // What a round takes to fill the shelves: now, or what the last round needed if more (right after a round the shelves are full,
  // but they sell down again by the next one). The 成长 page's buy buttons warn when a buy leaves less than this.
  const clerkBudget = () => lvl('clerk') ? Math.max(clerkNeed(), state.clerkRound?.need || 0) : 0;
  // 现在补货: the clerk's buying now, with the cash in the till, without waiting for (or moving) his next round.
  function clerkNow() {
    if (!lvl('clerk')) return 0;
    const b = clerkBuy(); if (!b.packs) return 0;
    if (state.clerkRound) state.clerkRound.spent = cents(state.clerkRound.spent + b.spent);
    log(`店员提前补货 ${b.packs} 包`, '', -b.spent);
    emit(); return b.packs;
  }
  // Dead end guard: no cash for the cheapest pack and nothing on the shelves or in the back room. Game setting.
  function bailout() {
    const cheapest = Math.min(...SETS.filter(s => unlocked(s.id)).map(s => wholesale(s.id)));
    if (state.cash >= cheapest || Object.values(state.stock).some(n => n > 0) || shelves().some(o => o.qty > 0)) return false; // cards in the binder don't count: a new player may not think of selling them
    if (credit() < BAILOUT) { bankrupt(); return true; }
    borrow(BAILOUT, true); log('货架空了、钱也花光了：九姐借你进货钱，记在账上', 'loss', BAILOUT); return true;
  }

  // Advances the shop by the wall-clock time since the last call, so background tabs and closed tabs both catch up. While the
  // player is away (see AWAY) the shop trades until offlineCap() after they left and the bill clock runs until one WEEK after.
  // busy = the player is watching packs being revealed (the UI holds the ledger and the story until it is done, up to ~3 minutes
  // of 连开): the shop and the bill clock run as usual, only an overdue bill's grace waits, as it does while they are away.
  // Paused (see pause): nothing runs and lastTick stays put; the pause hands the gap back on resume, so it is never credited.
  const tick = (busy = false) => advance(busy, idle);
  // idleMode = whether the time since the last tick counts as 挂机; setIdle settles it under the mode the player was in, then flips.
  function advance(busy: boolean, idleMode: boolean) {
    if (pausedAt !== null) { save(); return; } // keeps savedAt fresh: a tab closed mid-scene is credited only what it was closed for
    const now = clock(), from = lastTick; lastTick = now; reveal = busy;
    const gap = !state.away && now - from > AWAY * 1000; // nobody said the player left, but the page did not run: that was an absence
    if (gap) state.away = { ...receipt(), at: from };
    const a = state.away, end = a ? Math.min(now, a.at + offlineCap() * 1000) : now, billEnd = a ? a.at + WEEK * 1000 : Infinity, dt = (end - from) / 1000;
    if (dt <= 0) return;
    if (now - state.heatT > HEAT_EVERY * 1000) rollHeat(now);
    // d: the breakdown of the absence going on, counted here as the visits and the clerk's rounds happen. A legacy absence (a save from
    // before it existed) has none and gets none: starting it mid-absence would pass a part for the whole.
    const acc = { packs: 0, spent: 0, bulk: 0, bulkV: 0, listed: 0, short: 0 }, lost0 = state.lost, slice = CLERK_SLICE, d = a?.detail, cash0 = state.cash;
    const bonusRate = a ? OFFLINE_BONUS * skill('watch') : idleMode ? IDLE_BONUS : 0; // an absence (told or found as a gap) earns the offline rate and never the idle one; a paused shop never gets here
    let n = 0, revenue = 0, sales = 0, tickets = 0, bonus = 0;
    for (let left = dt; left > 0; left -= slice) {
      const len = Math.min(slice, left), x = rate() * len, m = Math.floor(x) + (random() < x % 1 ? 1 : 0), t0 = end - left * 1000, t1 = t0 + len * 1000;
      n += m; let take = 0; // take: what this slice's customers paid and the clerk's bulk sale brought in, the base of the bonus
      for (let i = 0; i < m; i++) {
        vnow = t0 + (i + 0.5) / m * len * 1000; const v = visit(), got = v.gain || 0; revenue += got; take += got; if (got) sales++; // spread over the slice
        if (d) { const k = d[v.t === 'seeker' || v.t === 'collector' ? v.t : 'packs']; if (got) { k.sales++; k.revenue += got; } else if (v.r === 'none') k.lost++; d.intake += v.paid || 0; } // 拆包玩家 and 倒爷 are the pack trade
      }
      const bulk0 = acc.bulkV; clerkWork(acc, t1); take += acc.bulkV - bulk0;
      // Not product sales: ticket money and the bonus go into the till (never into earned) before the bill clock looks at the till.
      if (ticketPrice()) {
        state.galleryAcc += GALLERY_RATE * len; const k = Math.floor(state.galleryAcc + 1e-9); state.galleryAcc = Math.max(0, state.galleryAcc - k);
        if (k) { const t = k * ticketPrice(); state.cash += t; tickets += t; state.extra.tickets = cents(state.extra.tickets + t); } // booked as it happens: a bankruptcy mid-tick wipes this shop's books with its till
      } else state.galleryAcc = 0; // nobody queues for an empty room
      const b = bonusRate && take ? cents(take * bonusRate) : 0; if (b) { const ledger = a ? 'offline' : 'idle'; state.cash += b; bonus += b; state.extra[ledger] = cents(state.extra[ledger] + b); }
      debtWork(Math.max(0, Math.min(t1, billEnd) - t0) / 1000, !!a || busy); // past the week, still called: a bill that fell due is paid once sales cover it
    }
    if (acc.packs || acc.short) log(`店员进货 ${acc.packs} 包${acc.short ? `，钱不够，货架还差 $${Math.round(acc.short).toLocaleString('en-US')} 的货` : ''}`, acc.short ? 'loss' : '', acc.packs ? -acc.spent : undefined);
    if (acc.bulk) log(`店员把散卡 ${acc.bulk} 张卖给同行`, 'gain', acc.bulkV);
    // 带徒弟's listings go in 店内动态 at most once a CLERK_ROUND, summed: one line a tick buried the clerk's rounds and the bill (a reviewer, minutes 57–60)
    listedRun += acc.listed; if (listedRun && clock() - listedLogAt >= CLERK_ROUND * 1000) { log(`店员把 ${listedRun} 张闪卡挂进了展示柜`); listedRun = 0; listedLogAt = clock(); }
    if (a) {
      a.secs += dt; a.sales += sales; a.revenue += revenue; a.lost += state.lost - lost0;
      if (tickets) a.tickets = cents((a.tickets || 0) + tickets);
      if (bonus) a.bonus = cents((a.bonus || 0) + bonus);
      for (const e of pending) { if (e.type === 'bill_paid') a.bills = (a.bills || 0) + e.amount!; if (e.type === 'loan_taken') a.borrowed = (a.borrowed || 0) + e.amount!; }
      if (d) { d.restock += acc.spent; d.bulk += acc.bulkV; d.cash += state.cash - cash0; } // the till as it stands before home(), bailout() or a listener (成就奖金) touch it
    }
    const asked = !a && commWork(); // 找卡委托: lapses or asked for, only while the player is here
    if (gap) home(now);
    const rescued = !state.away && bailout(); // nobody is lent money, or goes bankrupt, while away
    if (flush()) return;
    if (n || a || tickets || acc.packs || acc.short || acc.bulk || acc.listed || rescued || asked) emit(); else save();
  }
  // The player is back: the absence ends. One of AWAY or longer goes on the 打烊小票 (added to one still on screen, breakdown and all
  // when both have one) and gets one line in 店内动态 saying how long they were gone and, if longer than the shop could trade, for how long it did.
  function home(at: number) {
    const a = state.away; if (!a) return;
    state.away = null;
    const gone = (at - a.at) / 1000, dur = (s: number) => s >= 3600 ? `${(s / 3600).toFixed(1)} 小时` : `${Math.round(s / 60)} 分钟`;
    if (gone < AWAY || !a.secs) return;
    const o = state.offline ||= receipt();
    o.secs += a.secs; o.sales += a.sales; o.revenue += a.revenue; o.lost += a.lost;
    if (o.detail && a.detail) addDetail(o.detail, a.detail); else delete o.detail; // totals only on either side: the merged receipt claims no breakdown
    if (a.bills) o.bills = (o.bills || 0) + a.bills;
    if (a.borrowed) o.borrowed = (o.borrowed || 0) + a.borrowed;
    if (a.tickets) o.tickets = cents((o.tickets || 0) + a.tickets);
    if (a.bonus) o.bonus = cents((o.bonus || 0) + a.bonus);
    const cut = gone - a.secs > 60 ? `，店开了 ${dur(a.secs)}（${lvl('clerk') ? `店员看店最多 ${offlineCap() / 3600} 小时` : '没雇店员，最多开 1 小时'}）` : '';
    log(`离开 ${dur(gone)}${cut}：成交 ${a.sales} 位顾客${a.tickets ? `，收藏室门票 $${a.tickets.toFixed(0)}` : ''}${a.bonus ? `，看店奖励 $${a.bonus.toFixed(2)}` : ''}`, 'gain', a.revenue);
  }
  function leave() { if (state.away) return; tick(); state.away = { ...receipt(), at: clock() }; save(); }
  function back() { if (!state.away) return; tick(); home(clock()); if (!flush()) emit(); }
  // pause(true) settles the shop up to now, then freezes it; pause(false) moves everything the shop timed by the wall clock
  // (last tick, 行情, the clerk's next round, 倒爷 cooldowns, the start of an absence) forward by the frozen time, so the shop
  // resumes exactly where it stopped. Idempotent: scenes queued back to back may pause twice. Shop time (bill clock, grace,
  // OPENING) is counted in ticks and needs no shifting. A page closed while paused is credited like any closed page (see AWAY).
  function pause(on: boolean) {
    if (on === (pausedAt !== null)) return;
    if (on) { tick(); pausedAt = clock(); return; }
    const d = clock() - pausedAt!; pausedAt = null;
    lastTick += d; vnow += d;
    if (state.heatT) state.heatT += d;
    if (state.clerkT) state.clerkT += d;
    for (const id of Object.keys(state.flipT)) state.flipT[id] += d;
    if (state.away) state.away.at += d;
  }
  // 挂机: the shop earns the idle bonus while the player has the 货柜 page open and in view. The time since the last tick is settled under the
  // mode the player was in (never retroactively under the new one), and with the reveal state the last tick had, so a mid-reveal flip does not
  // unlock the cards still to be flipped. Paused: nothing is settled and the flag just changes; the pause hands its gap back on resume.
  function setIdle(on: boolean) { on = !!on; if (on === idle) return; const was = idle; idle = on; advance(reveal, was); }
  const idling = () => idle && !state.away && pausedAt === null; // the idle bonus is flowing right now
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
  // loanPay: the 顺手还 part as scheduled (taken only if the till has it beyond the float, so it is not in amount).
  function nextBill() {
    if (!state.debt) return null;
    const inst = installment(state.week), grown = state.loan * (1 + loanRate()), hard = Math.max(0, Math.round(grown - creditLimit()));
    return { week: state.week, amount: inst + hard, inst, loanPay: Math.max(0, Math.round(loanDue(grown) - hard)), dueAt: clock() + dueIn() * 1000 };
  }
  // What 顺手还 leaves in the till: the money to fill every shelf (a clerk's round, or the shelves' gap for a player restocking by
  // hand; at least LOAN_FLOAT) plus the installment of the week after the bill being paid (w; before it falls due, state.week + 1).
  // Without the installment 普通 borrowed a fifth more; without the shelves' gap a clerkless shop's restock money went to the loan (§4.5).
  const loanFloat = (w = state.week + 1) => Math.max(LOAN_FLOAT, clerkBudget(), shelfGap()) + installment(w);
  // what filling every shelf to the top would cost at the wholesale price (a player without a clerk restocks by hand from the same till)
  const shelfGap = () => cents(shelves().reduce((a, sh) => a + (sh.id && unlocked(sh.id) ? Math.max(0, depth() - sh.qty) * wholesale(sh.id) : 0), 0));
  const loanDue = (L: number) => Math.min(L, Math.max(L * LOAN_PAY, LOAN_MIN * debtScale())); // this week's 顺手还 of a loan grown to L, hard part included
  // Weeks until the loan is gone if every 顺手还 is taken in full and nothing more is borrowed (账本 prints it).
  function loanWeeks() { let L = state.loan, w = 0; for (; L >= 1 && w < 99; w++) { const g = L * (1 + loanRate()); L = g - Math.max(loanDue(g), g - creditLimit()); } return w; }
  // 顺手还: after the week's bill is paid, up to `due` of the loan from cash above the float (no event: it is a repayment, not a bill).
  function payDown(due: number) {
    const pay = cents(Math.min(due, state.loan, state.cash - loanFloat(state.week)));
    if (!(pay >= 1)) return;
    state.cash -= pay; state.loan -= pay; setDebt();
    log(`九姐顺手收回借款 $${Math.round(pay).toLocaleString('en-US')}`, 'loss', -pay);
    cleared();
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
    const inst = installment(w), hard = Math.max(0, state.loan - creditLimit()), amount = cents(inst + hard), soft = loanDue(state.loan) - hard;
    if (amount <= 0) { if (!state.overdue) payDown(soft); return; }
    pending.push({ type: 'bill_due', week: w, amount });
    if (state.overdue) { state.overdue = { week: w, amount: cents(state.overdue.amount + amount), inst: state.overdue.inst + inst, until: Math.max(state.overdue.until, state.shopT + GRACE) }; return; } // piled up while away: the new bill gets its own grace
    if (state.cash >= amount) { settle({ week: w, amount, inst }); if (state.debt) payDown(soft); }
    else {
      state.overdue = { week: w, amount, inst, until: state.shopT + GRACE };
      log(`第 ${w} 周的账 ${'$' + amount.toFixed(0)} 付不上：${GRACE / 60} 分钟内凑齐，不然就借`, 'loss');
      pending.push({ type: 'bill_missed', week: w, amount });
    }
  }
  // Grace is over: borrow what cash does not cover, or go bankrupt.
  function lapse() {
    const o = state.overdue!, short = cents(o.amount - state.cash);
    if (short > credit()) { bankrupt(); return; }
    borrow(short, true); log(`宽限到了：九姐替你把第 ${o.week} 周的账垫上，借 $${short.toFixed(0)}`, 'loss', short);
    settle(o);
  }
  function debtWork(len: number, away: boolean) { // away: the player is gone or busy (tick): grace only runs while they can see it, whatever is left of it waits
    if (away && state.overdue) state.overdue.until += len;
    state.shopT += len;
    while (state.shopT >= state.week * WEEK) weekEnd();
    const o = state.overdue; if (!o) return;
    if (state.cash >= o.amount) settle(o);
    else if (!away && state.shopT >= o.until) lapse();
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
  function ackCardSale(buyer: 'seeker' | 'collector') { if (state.cardFirst) delete state.cardFirst[buyer]; emit(); }

  // 行情: every couple of minutes one unlocked set runs hot (+15% price and twice the demand) and another cold (−10% price, half the demand). Game setting.
  function rollHeat(now: number) {
    // two draws, not sort(() => random() - 0.5): how many times sort calls its comparator is the engine's business (Node 22 and 26
    // differ), which made the same seed play a different shop on another Node version
    const ids = SETS.map(s => s.id).filter(unlocked), hot = ids.splice(Math.floor(random() * ids.length), 1);
    ids.unshift(...hot, ...ids.splice(Math.floor(random() * ids.length), 1));
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
  // A new shop keeps the 欧气 record, 图鉴, achievements, 名气/perks and gallery cards in their slots.
  // The caller supplies the binder inventory to carry; the new shop owes its own opening debt.
  function restart(branch: Branch, singles: State['singles']) {
    const old = state;
    state = { ...fresh(), singles, opened: old.opened, tally: old.tally, pulled: old.pulled, costOpened: old.costOpened, hits: old.hits, dex: old.dex, dexPacks: old.dexPacks, dexSeen: old.dexSeen, packsBy: old.packsBy,
      ach: old.ach, feat: old.feat, branch, gallery: old.gallery };
    state.cash = START_CASH + SEED_STEP * perk('seed'); state.owe = debt0(); setDebt();
    if (perk('fit')) state.up.racks = state.up.depth = perk('fit');
    if (perk('hire')) { state.up.clerk = 2; for (const s of SETS) state.auto[s.id] = true; }
    luckCache = null; lastTick = vnow = clock(); if (pausedAt !== null) pausedAt = lastTick; // a new shop starts now, even mid-scene
    return old;
  }
  function branch() {
    if (!canBranch()) return false;
    const fame = fameFor() + handFame(), b = state.branch, singles = { ...state.singles }, hands = SETS.filter(s => handDone(s.id)).length;
    for (const c of state.shown) { const { key, pct, ...o } = c; (singles[key] ||= { ...o, count: 0 }).count++; } // the case comes along, back in the binder; the 收藏室 (the 镇店台 too) stays as it is
    restart({ ...b, n: b.n + 1, fame: b.fame + fame, got: b.got + fame, life: b.life + revenue(), hands }, singles);
    log(`开了第 ${state.branch.n + 1} 家店，带来名气 ${fame}。九姐出的本钱：$${state.debt.toLocaleString('en-US')}`, 'hit');
    pending.push({ type: 'story', id: 'branch', week: 1, amount: state.debt }); flush(); return true;
  }
  // 破产: 九姐 takes cash, stock, binder and sale case; the shop's revenue earns no 名气.
  // Restart the same shop number and debt with a higher loan rate. The 收藏室 (its cards, the 镇店台's too, and their places), 图鉴,
  // achievements, the 欧气 record and previously earned 名气/perks survive.
  function bankrupt() {
    const o = state, goods = SETS.reduce((a, x) => a + ((o.stock[x.id] || 0) + shelfQty(x.id)) * wholesale(x.id), 0);
    const cards = Object.values(o.singles).reduce((a, c) => a + c.price * c.count, 0) + o.shown.reduce((a, c) => a + c.price, 0);
    const wreck: Wreck = { at: clock(), week: o.week, shop: o.branch.n, debt: o.debt, cash: o.cash, goods: cents(goods), cards: cents(cards), revenue: cents(revenue()) };
    if (galleryCards().length) wreck.gallery = { n: galleryCards().length, value: galleryValue() }; // not the shop's: restart keeps it
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
    if (k === 'hire' && lvl('clerk') < 2) { const was = lvl('clerk'); state.up.clerk = 2; if (!was) for (const s of SETS) state.auto[s.id] ??= true; } // 老店员 is the 2-minute clerk: a 帮工 already hired is raised to him
    log(`名气：${PERKS[k].name} Lv${perk(k)}（${PERKS[k].fx(perk(k))}）`);
    emit(); return true;
  }

  function reset() { state = fresh(); luckCache = null; dexN = handN = null; emit(); }

  return {
    get state() { return state; }, on: (f: (ev?: GameEvent) => void) => listeners.push(f), now: clock, bonus,
    ackCardSale,
    buy, shelve, unshelve, place, setPrice, setCardPrice, open, sell, collect, missing, master, setAuto, dexCount, dexTotal, dexBonusOf, handCount, handDone, handMissing, handFame, cardOdds, HAND_FAME, dexBonus, sellBulk, bulkValue, tick, luck, expectedTally, reset, wholesale, setById,
    list, unlist, fillCase, caseMoves, setCasePct, casePct, setBuyPct, buyPct, binderN, BUY_MIN, BUY_MAX, COUNTER_OPEN, SELLER, BUY_PCT, BINDER, SEEK_N, BILL_KEEP, upgrade, upgradeCost, canUpgrade, growthLock, cardBranchReady, peek, spare, refundable, refundBlock, refundTo, refund, REFUND, ackOffline, leave, back, learn, skill, skillCost, skillMax, canLearn, luckMult, offlineCap,
    clerkNeed, clerkNow, clerkShort, clerkKeep, clerkBudget, clerkRoundSecs, loanFloat, loanWeeks, nextBill, payBill, takeLoan, repay, bankrupt, ackWreck, credit, creditLimit, loanRate, debt0, dueIn, installment,
    pause, paused: () => pausedAt !== null, OPENING, OPENING_CAP, FLIP_SHARE,
    deliverCommission, dismissCommission, commKey, commLeft, commCap, COMM_GAP, COMM_LEN, COMM_OPEN, COMM_PAY, COMM_MIN, COMM_FLOOR, COMM_CAP0, COMM_CAP1, COMM_CAP_REV,
    GALLERY_SLOTS, ROOM_SLOTS, PEDESTAL, GALLERY_RATE, TICKET_MIN, TICKET_MAX, IDLE_BONUS, OFFLINE_BONUS, galleryValue, ticketPrice, collectToGallery, toPedestal, uncollect, moveCollect, setIdle, idling, revealing,
    WEEK, GRACE, DEBT0, BILL0, BILL_G, DEBT_STEP, LOAN_RATE, LOAN_MARK, LOAN_K, LOAN_FLOOR, LOAN_PAY, LOAN_MIN, LOAN_FLOAT, NOCLERK_CAP, AWAY,
    branch, canBranch, fameFor, learnPerk, perk, perkCost, PERKS, FAME_UNIT, START_CASH, SEED_STEP, REG_STEP, ACCESS_STEP,
    demand, street, STREETS, lineup, crowdRaw, crowdMult, crowdCap, room, sealedPrice, ask, cardAsk, shelfQty, facings, missed, shelves, racks, depth, pctOf, cardPct, slots, revenue, unlocked, unlockAt, rate, trophyBonus, wholesaleRate, lvl,
    UPGRADES, SKILLS, TYPES, DEMAND, SEEK, BIG_CARD, FLIP_COOLDOWN, DEX_TIERS, MASTER, BUY_R, BAILOUT, BUYLIST, WHOLESALE, WHOLESALE_STEP, ARRIVAL, SIGN_STEP, OFFLINE_CAP, HEAT_EVERY, CLERK_ROUND, CLERK_ROUND_1, CLERK_EMPTY, CLERK_KEEP, MISS_WINDOW, CROWD_KNEE, CROWD_ROOM, ROOM_STEP, RACK_BASE, DEPTH_BASE, DEPTH_STEP, CASE_BASE, CASE_STEP, CASE_GAINS, WAREHOUSE, MIN_PCT, MAX_PCT, PCT_STEP, DEFAULT_PCT, CASE_PCT,
  };
}
