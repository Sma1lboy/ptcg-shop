// 成就: which achievements the shop has earned, judged from the game's state plus a few counters kept from pack-open events.
// Owns G.state.ach (id → when it was earned) and G.state.feat (the counters). Rewards are one-off cash via G.bonus; nothing
// here touches pack odds, prices or any other game number. Browser and node alike: the ui wires it up (src/ui/ach.ts), tests call it directly.
import type { Game } from './game.ts';
import { DATA, SETS } from './sets.ts';
import * as S from './sim.ts';
import type { Pull } from './sim.ts';

export interface Ach {
  id: string; group: string; seal: string; name: string; desc: string; cash: number;
  hint?: string;                         // hidden until earned: this vague line is all the label shows
  money?: boolean;                       // progress is in dollars
  prog: (G: Game) => [number, number];   // [now, goal]; earned once now >= goal
}

export const GROUPS: [string, string][] = [['open', '开包'], ['luck', '欧气'], ['dex', '收藏'], ['shop', '经营'], ['hidden', '隐藏']];
// The medal an achievement is struck in (DESIGN.md「奖章」, BW2's medal box): read off the reward, which is already paced by how
// hard the achievement is. 荣誉 are the honour-only ones (a whole collection done), the rarest there are.
export const TIERS: [string, string][] = [['black', '荣誉'], ['gold', '金牌'], ['silver', '银牌'], ['white', '铜牌']];
export const tier = (a: Ach) => (!a.cash ? 'black' : a.cash >= 300 ? 'gold' : a.cash >= 50 ? 'silver' : 'white');
const GOLD = ['IR', 'SIR', 'HR', 'MHR'];   // the gold-star rarities (and the Mega series' four-pointed star)
const LUCK_MIN = 30;                        // packs before 欧气检测 titles count: fewer and one lucky pull decides it
const cards = (test: (name: string, r: string) => boolean) => new Set(SETS.flatMap(s => DATA[s.id].cards.filter(c => test(c.en, c.r)).map(c => `${s.id}|${c.n}`)));
const PIKACHU = cards(n => n.startsWith('Pikachu')), CHARIZARD = cards(n => n.includes('Charizard')), MOON = cards((n, r) => n === 'Umbreon ex' && r === 'SIR');

const f = (G: Game, k: string) => G.state.feat[k] || 0;
const yes = (ok: boolean): [number, number] => [ok ? 1 : 0, 1];
const packs = (G: Game) => Object.values(G.state.opened).reduce((a, b) => a + b, 0);
const tally = (G: Game, kinds: string[]) => kinds.reduce((a, k) => a + (G.state.tally[k] || 0), 0);
const pulled = (G: Game, keys: Set<string>) => Object.keys(G.state.dex).some(k => keys.has(k.slice(0, k.lastIndexOf('|'))));
const luck = (G: Game, ok: (pct: number) => boolean): [number, number] => { const n = packs(G); return n < LUCK_MIN ? [n, LUCK_MIN] : yes(ok(G.luck().pct!)); };
const bestDex = (G: Game) => Math.max(0, ...SETS.map(s => G.dexCount(s.id) / G.dexTotal(s.id)));
const masters = (G: Game) => SETS.filter(s => G.master(s.id)).length;
const hands = (G: Game) => SETS.filter(s => G.handDone(s.id)).length;
const level = (G: Game) => Object.keys(G.UPGRADES).reduce((a, k) => a + G.lvl(k), 0) + Object.keys(G.SKILLS).reduce((a, k) => a + G.skill(k), 0);
const maxLevel = (G: Game) => Object.values(G.UPGRADES).reduce((a, u) => a + u.costs.length, 0) + Object.values(G.SKILLS).reduce((a, s) => a + s.max, 0);

// Game settings (rewards are invented, shown in the footer). Paced for a player's first 10 minutes, first hour and first 10 hours.
export const ACH: Ach[] = [
  { id: 'open-1', group: 'open', seal: '开张', name: '开张第一包', desc: '店里拆开的第一包', cash: 5, prog: G => [Math.min(packs(G), 1), 1] },
  { id: 'hit-1', group: 'open', seal: '初闪', name: '第一张闪卡', desc: '开出双稀有或更稀有的卡', cash: 5, prog: G => [Math.min(tally(G, S.HITS), 1), 1] },
  { id: 'ten-1', group: 'open', seal: '十连', name: '第一次十连', desc: '一次开 10 包', cash: 10, prog: G => [Math.min(f(G, 'ten'), 1), 1] },
  { id: 'double', group: 'open', seal: '双闪', name: '一包双闪', desc: '同一包里开出两张双稀有或更稀有的卡', cash: 30, prog: G => [Math.min(f(G, 'dbl'), 2), 2] },
  { id: 'gold-1', group: 'open', seal: '金星', name: '第一张金星', desc: '开出插画稀有、特殊插画或金卡（卡面右下角是金星）', cash: 30, prog: G => [Math.min(tally(G, GOLD), 1), 1] },
  { id: 'sir-1', group: 'open', seal: '特殊插画', name: '特殊插画', desc: '开出第一张特殊插画', cash: 100, prog: G => [Math.min(tally(G, ['SIR']), 1), 1] },
  { id: 'hr-1', group: 'open', seal: '金卡', name: '第一张金卡', desc: '开出金卡或超级金卡', cash: 150, prog: G => [Math.min(tally(G, ['HR', 'MHR']), 1), 1] },
  { id: 'packs-100', group: 'open', seal: '百包', name: '拆了一百包', desc: '累计开 100 包', cash: 50, prog: G => [Math.min(packs(G), 100), 100] },
  { id: 'packs-1000', group: 'open', seal: '千包', name: '拆了一千包', desc: '累计开 1,000 包', cash: 500, prog: G => [Math.min(packs(G), 1000), 1000] },
  { id: 'mhr-1', group: 'open', seal: '超级金卡', name: '超级金卡', desc: '在超级进化系列里开出超级金卡（每包 0.08%）', cash: 1000, prog: G => [Math.min(tally(G, ['MHR']), 1), 1] },

  { id: 'euro', group: 'luck', seal: '欧洲人', name: '欧洲人', desc: `开满 ${LUCK_MIN} 包后，欧气检测超过 90% 的模拟玩家`, cash: 50, prog: G => luck(G, p => p >= 0.9) },
  { id: 'emperor', group: 'luck', seal: '欧皇', name: '欧皇本皇', desc: `开满 ${LUCK_MIN} 包后，欧气检测超过 99% 的模拟玩家`, cash: 300, prog: G => luck(G, p => p >= 0.99) },
  { id: 'unlucky', group: 'luck', seal: '非酋', name: '非酋补贴', desc: `开满 ${LUCK_MIN} 包后，欧气检测低于 10% 的模拟玩家`, cash: 100, prog: G => luck(G, p => p < 0.1) },
  { id: 'dry-30', group: 'luck', seal: '空军', name: '空军', desc: '连续 30 包没出金星卡', cash: 80, prog: G => [f(G, 'dryMax') >= 30 ? 30 : f(G, 'dry'), 30] },
  { id: 'ten-gold', group: 'luck', seal: '十连三金', name: '十连三金', desc: '一次十连开出 3 张金星卡', cash: 100, prog: G => [Math.min(f(G, 'tenGold'), 3), 3] },
  { id: 'pack-100', group: 'luck', seal: '百刀包', name: '一包百刀', desc: '一包开出市值 $100 以上', cash: 100, money: true, prog: G => [Math.min(f(G, 'top'), 100), 100] },

  { id: 'dex-25', group: 'dex', seal: '入册', name: '图鉴入册', desc: '任一系列图鉴收录 25%', cash: 15, prog: G => [Math.min(Math.round(bestDex(G) * 100), 25), 25] },
  { id: 'dex-50', group: 'dex', seal: '半本', name: '半本图鉴', desc: '任一系列图鉴收录 50%', cash: 50, prog: G => [Math.min(Math.round(bestDex(G) * 100), 50), 50] },
  { id: 'master-1', group: 'dex', seal: '大师套', name: '第一套大师套', desc: '收齐一个系列的每一张卡', cash: 500, prog: G => [Math.min(masters(G), 1), 1] },
  { id: 'master-3', group: 'dex', seal: '三套', name: '三套大师套', desc: '收齐三个系列', cash: 1500, prog: G => [Math.min(masters(G), 3), 3] },
  { id: 'master-all', group: 'dex', seal: '全图鉴', name: '全图鉴', desc: `${SETS.length} 个系列全部收齐（只有标签，没有奖金）`, cash: 0, prog: G => [masters(G), SETS.length] },
  { id: 'hand-1', group: 'dex', seal: '亲手开齐', name: '一张没买', desc: '一个系列的每一张卡都是自己开出来的（另有名气奖励）', cash: 1000, prog: G => hands(G) ? [100, 100] : [Math.floor(Math.max(0, ...SETS.map(s => G.handCount(s.id) / G.dexTotal(s.id))) * 100), 100] },
  { id: 'hand-all', group: 'dex', seal: '全手开', name: '全手开图鉴', desc: `${SETS.length} 个系列都亲手开齐（只有标签，没有奖金）`, cash: 0, prog: G => [hands(G), SETS.length] },
  { id: 'trophy', group: 'dex', seal: '镇店', name: '镇店之宝', desc: '第一次摆上镇店之宝', cash: 10, prog: G => yes(!!G.state.trophy) },
  { id: 'case-full', group: 'dex', seal: '满柜', name: '展示柜摆满', desc: '展示柜每一格都有卡', cash: 30, prog: G => [Math.min(G.state.shown.length, G.slots()), G.slots()] },
  { id: 'big-card', group: 'dex', seal: '大货', name: '开出大货', desc: '开出一张市值 $250 以上的卡', cash: 300, money: true, prog: G => [Math.min(G.state.hits[0]?.price || 0, 250), 250] },

  { id: 'sale-1', group: 'shop', seal: '开门红', name: '开门红', desc: '第一位顾客买走东西', cash: 5, prog: G => [Math.min(G.state.customers, 1), 1] },
  { id: 'shelves-full', group: 'shop', seal: '满架', name: '货架全满', desc: '每个货架都摆上一个系列，而且摆满', cash: 20, prog: G => [G.shelves().filter(s => s.id && s.qty >= G.depth()).length, G.racks()] },
  { id: 'day-100', group: 'shop', seal: '客满', name: '一天一百单', desc: '同一天里成交 100 位顾客', cash: 50, prog: G => [Math.min(f(G, 'dayBest'), 100), 100] },
  { id: 'day-1000', group: 'shop', seal: '排长队', name: '一天一千单', desc: '同一天里成交 1,000 位顾客（打烊期间的也算）', cash: 500, prog: G => [Math.min(f(G, 'dayBest'), 1000), 1000] },
  { id: 'rev-1k', group: 'shop', seal: '万元户', name: '万元户', desc: '累计营业额 $10,000', cash: 30, money: true, prog: G => [Math.min(G.revenue(), 1e4), 1e4] },
  { id: 'rev-10k', group: 'shop', seal: '十万', name: '营业额十万', desc: '累计营业额 $100,000', cash: 150, money: true, prog: G => [Math.min(G.revenue(), 1e5), 1e5] },
  { id: 'rev-100k', group: 'shop', seal: '百万', name: '营业额百万', desc: '累计营业额 $1,000,000', cash: 1000, money: true, prog: G => [Math.min(G.revenue(), 1e6), 1e6] },
  { id: 'collector', group: 'shop', seal: '大单', name: '收藏党的大单', desc: '一位收藏党花 $100 以上买走柜里的一张卡', cash: 100, money: true, prog: G => [Math.min(f(G, 'coll'), 100), 100] },
  { id: 'clerk', group: 'shop', seal: '请人', name: '请了店员', desc: '雇第一个店员', cash: 50, prog: G => yes(G.lvl('clerk') > 0) },
  { id: 'offline-1k', group: 'shop', seal: '躺赚', name: '打烊也赚', desc: '一张离店小票入账 $10,000 以上', cash: 100, money: true, prog: G => [Math.min(f(G, 'off'), 1e4), 1e4] },
  { id: 'all-sets', group: 'shop', seal: '全系列', name: '全系列在售', desc: `${SETS.length} 个系列同时摆在货架上`, cash: 500, prog: G => [SETS.filter(s => G.shelfQty(s.id) > 0).length, SETS.length] },
  { id: 'level-20', group: 'shop', seal: '老店', name: '二十级老店', desc: '店铺等级 20（成长页的升级和技能级数之和）', cash: 300, prog: G => [Math.min(level(G), 20), 20] },
  { id: 'level-max', group: 'shop', seal: '满级', name: '满级卡铺', desc: '店铺等级升满（只有标签，没有奖金）', cash: 0, prog: G => [level(G), maxLevel(G)] },

  { id: 'flipped', group: 'hidden', seal: '被扫货', name: '被倒爷扫了货', desc: '标价低到倒爷一口气扫走一个系列', hint: '有人专挑便宜货下手', cash: 20, prog: G => yes(Object.keys(G.state.flipT).length > 0) },
  { id: 'ten-blank', group: 'hidden', seal: '十连空', name: '十连空军', desc: '一次十连一张双稀有以上都没有', hint: '十连也有空手的时候', cash: 100, prog: G => [Math.min(f(G, 'tenBlank'), 1), 1] },
  { id: 'pikachu', group: 'hidden', seal: '皮卡丘', name: '皮卡丘来了', desc: '开出任何一张皮卡丘', hint: '店里的招牌电气鼠', cash: 30, prog: G => yes(pulled(G, PIKACHU)) },
  { id: 'charizard', group: 'hidden', seal: '喷火龙', name: '喷火龙', desc: '开出任何一张喷火龙', hint: '每个世代都有人追它', cash: 50, prog: G => yes(pulled(G, CHARIZARD)) },
  { id: 'moon', group: 'hidden', seal: '月亮', name: '月亮伊布', desc: '在棱镜进化里开出月亮伊布 ex 的特殊插画', hint: '棱镜进化里最贵的那一张', cash: 200, prog: G => yes(pulled(G, MOON)) },
  { id: 'night', group: 'hidden', seal: '夜猫子', name: '夜猫子', desc: '凌晨 1 点到 5 点之间开包', hint: '打烊以后还在拆', cash: 20, prog: G => [Math.min(f(G, 'night'), 1), 1] },
];

// Counters from one open event (every pack of G.open(id, n), in pack order). Cheap: call it on every open, even mid-reveal.
export function note(G: Game, opened: Pull[][]) {
  const c = G.state.feat, hour = new Date(G.now()).getHours(), bump = (k: string, v: number) => { c[k] = Math.max(c[k] || 0, v); };
  let gold = 0, hits = 0;
  for (const pack of opened) {
    const h = pack.filter(x => S.HITS.includes(x.kind)).length, g = pack.filter(x => GOLD.includes(x.kind)).length;
    hits += h; gold += g; bump('dbl', h); bump('top', S.packValue(pack));
    c.dry = g ? 0 : (c.dry || 0) + 1; bump('dryMax', c.dry);
    if (hour >= 1 && hour < 5) c.night = (c.night || 0) + 1;
  }
  if (opened.length === 10) { c.ten = (c.ten || 0) + 1; bump('tenGold', gold); if (!hits) c.tenBlank = (c.tenBlank || 0) + 1; }
}

// Counters read off the state that may not last until the next check (today's customers, the receipt before it is put away,
// a collector's sale before it leaves state.recent). Cheap: the ui calls it on every emit, even mid-reveal; check() calls it too.
export function watch(G: Game) {
  const st = G.state, c = st.feat, d = new Date(G.now()), day = d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate();
  if (c.day !== day) { c.day = day; c.day0 = st.customers; }
  c.dayBest = Math.max(c.dayBest || 0, st.customers - c.day0);
  c.off = Math.max(c.off || 0, st.offline?.revenue || 0);
  c.coll = Math.max(c.coll || 0, ...st.recent.filter(v => v.t === 'collector' && v.r === 'sold').map(v => v.gain || 0));
}

// Earns every achievement whose goal is now met, pays their rewards in one G.bonus, returns them (empty: nothing new).
// All are marked before the bonus emits, so a listener that calls check() again from that emit finds nothing.
export function check(G: Game): Ach[] {
  watch(G);
  const st = G.state, got = ACH.filter(a => !st.ach[a.id] && done(a, G));
  if (!got.length) return got;
  for (const a of got) st.ach[a.id] = G.now();
  const cash = got.reduce((s, a) => s + a.cash, 0);
  G.bonus(cash, got.length === 1 ? `成就：${got[0].name}` : `成就 ${got.length} 个：${got.map(a => a.name).join('、')}`);
  return got;
}
export const done = (a: Ach, G: Game) => { const [now, goal] = a.prog(G); return now >= goal; };
