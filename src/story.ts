// 剧情: the opening (why you run this shop: you owe 九姐, a loan shark, and her man 阿豆 dropped you in a dead card shop) and the
// short beats the debt economy and a few milestones trigger. Pure data and choice, no DOM: src/ui/story.ts plays it, test/ checks it.
// It never changes a number in the game; the economy is read through src/debt.ts only. The player is only ever 你 (no pronoun).
import type { DebtBeat } from './debt.ts';

export type Who = 'jiu' | 'adou' | 'you' | ''; // '' = narration
export type Bg = 'street' | 'shop' | 'dark';
// Context the ui fills in before playing, already formatted: bill = the next bill's amount, week = its week, card/price = a pull, set = a set name;
// for 还清 / 开分店: bills = bills paid in this shop, fame = 名气 branching now would take, debt = what the (next) shop owes, shop = its number (1-based)
export interface Ctx { bill?: string; week?: number; card?: string; price?: string; set?: string; bills?: number; fame?: number; debt?: string; shop?: number }
export interface Line { who: Who; t: string | ((c: Ctx) => string) }
export interface Scene { bg: Bg; lines: Line[] }

export const NAMES: Record<Who, string> = { jiu: '九姐', adou: '阿豆', you: '你', '': '' };

const L = (who: Who, t: Line['t']): Line => ({ who, t });
// the terms line: exact numbers when the economy gives a bill, else the rule in words (the numbers are the economy's, not ours)
const terms = (c: Ctx) => (c.bill ? `第 ${c.week} 周的账是 ${c.bill}。往后每周多一点——多多少，看账本，不看心情。` : '往后每周多一点——多多少，看账本，不看心情。');

export const SCENES: Record<string, Scene[]> = {
  opening: [
    { bg: 'street', lines: [
      L('', '你欠了九姐一笔钱。'),
      L('', '借的时候你说：就开这一箱，出了大卡马上还。'),
      L('', '那一箱开出三十六张普通卡，和一张能量卡。'),
      L('adou', '九姐请你去喝茶。'),
      L('you', '喝茶为什么要带麻袋？'),
      L('adou', '怕你着凉。'),
    ] },
    { bg: 'dark', lines: [L('', '麻袋里有股卡套的味道。车开了很久。')] },
    { bg: 'shop', lines: [
      L('', '麻袋掀开。一间倒闭的卡店：货架空着，柜台落了一层灰，灯管闪了三下才亮。'),
      L('jiu', '这店上一个老板也欠我钱。'),
      L('you', '……那他人呢？'),
      L('jiu', '说是去进货。三年了。'),
      L('jiu', '规矩很简单：店给你，货你自己进，每周我来收一次账。'),
      L('jiu', terms),
      L('jiu', '付不上也行，阿豆会帮你把店里值钱的东西搬走。包括你。'),
      L('adou', '……九姐开玩笑的。'),
      L('adou', '（小声）上次没开玩笑。'),
      L('jiu', '柜台里那点零钱，算开张红包——也记账上。开张吧，老板。'),
    ] },
  ],
  // an old save meeting the debt for the first time: the shop was running before 九姐 showed up
  return: [{ bg: 'shop', lines: [
    L('', '打烊前，门口的风铃响了。'),
    L('jiu', '生意不错嘛，老板。'),
    L('you', '……您哪位？'),
    L('jiu', '开这家店的钱是找谁借的，忘了？'),
    L('adou', '（翻开账本）这有你按的手印。'),
    L('jiu', terms),
    L('jiu', '好好干。你干得越好，我越放心。'),
  ] }],
  due: [{ bg: 'shop', lines: [
    L('jiu', '路过，看看货架。'),
    L('jiu', c => (c.bill ? `这周的账 ${c.bill}，别让我白跑一趟。` : '这周的账，别让我白跑一趟。')),
    L('adou', '九姐说「路过」的时候，一般不是路过。'),
  ] }],
  paid1: [{ bg: 'shop', lines: [
    L('jiu', '（按了两下计算器）准时。'),
    L('jiu', '我喜欢准时的人。他们活得久。'),
    L('adou', '这是在夸你。'),
  ] }],
  paid: [{ bg: 'shop', lines: [L('jiu', '收到。下周见。')] }],
  paid2: [{ bg: 'shop', lines: [L('adou', '（数完钞票）一张不少。九姐让我跟你说声辛苦。'), L('adou', '……她原话是「还行」。')] }],
  missed: [{ bg: 'shop', lines: [
    L('adou', '九姐让我带句话。'),
    L('adou', '……还让我带了把锤子。'),
    L('jiu', '锤子是用来钉新价签的。这次是。'),
    L('jiu', '这周的账我记着。你也记着。'),
  ] }],
  loan: [{ bg: 'shop', lines: [
    L('jiu', '又借？好说。'),
    L('jiu', '利息已经出门了，比你的顾客来得快。'),
  ] }],
  bankrupt: [
    { bg: 'shop', lines: [
      L('', '货架空了，柜台空了，收银机里只剩一枚游戏币。'),
      L('jiu', '行了，店我收回。'),
      L('adou', '（把卷帘门往下拉）'),
    ] },
    { bg: 'street', lines: [
      L('', '卷帘门落下来的声音，和那一箱全是普通卡的声音差不多。'),
      L('jiu', '别这副表情。城西还有一家倒闭的卡店。'),
      L('adou', '麻袋我洗过了。'),
    ] },
  ],
  // the closing stretch: the next bill empties the opening debt (unless the player borrows again, so it is not called 「最后一张」)
  last: [{ bg: 'shop', lines: [
    L('jiu', '（翻了翻账本）下周那张付完，开店的本钱就清了。'),
    L('jiu', '别在最后一周借钱。我见过的人里，最后一周借钱的，都不止借最后一周。'),
    L('adou', '九姐的意思是：加油。'),
  ] }],
  // 债还清 (game.ts emits it once per shop): the payoff, then 九姐's offer, which is the 开分店 button
  debt_cleared: [
    { bg: 'shop', lines: [
      L('', '最后一笔钱塞进九姐的信封。收银机叮了一声，跟卖出一包卡时一样。'),
      L('jiu', '（按了很久的计算器）……对上了。'),
      L('jiu', c => (c.bills ? `${c.bills} 张账，一张没赖。` : '一张没赖。')),
      L('adou', '（从怀里摸出一张纸）你的借条。手印还是红的。'),
      L('jiu', '撕了吧。这店从今天起是你的。'),
      L('you', '……就这样？'),
      L('jiu', '不然呢？放鞭炮？阿豆，把麻袋收起来。'),
      L('adou', '（小声）九姐头一回让我把麻袋收起来。'),
    ] },
    { bg: 'street', lines: [
      L('', '九姐走到门口，又停下来。'),
      L('jiu', '城东有个铺面，比这间大。上一个老板……也说去进货了。'),
      L('jiu', c => `本钱我出${c.debt ? `，${c.debt}` : ''}，照旧记账上。你在这攒的名气带得走${c.fame ? `——现在是 ${c.fame}` : ''}。`),
      L('jiu', '不急。这店多开一天，你带走的就多一点。'),
      L('', '债还清了：这家店不再有账单。「成长」页的「开分店」随时能去，这家店的营业额越高，带走的名气越多。'),
    ] },
  ],
  // 开分店 (game.ts emits it with the new shop's debt): the same deal, but 九姐 knows your name now
  branch: [{ bg: 'shop', lines: [
    L('', c => `第 ${c.shop ?? 2} 家店。卷帘门拉上去，灰比上一家还厚。`),
    L('adou', '这回没用麻袋。九姐说你是自己人了。'),
    L('you', '自己人也要还钱？'),
    L('jiu', c => `自己人也要还。本钱 ${c.debt ?? '照旧'}，还是分期、不算利息。`),
    L('jiu', terms),
    L('jiu', '名气是你的，账也是你的。开张吧，老板。'),
    L('adou', '（小声）她对上一个老板说的是「开张吧」。后面没有「老板」。'),
  ] }],
  // 亲手开齐 (game.ts emits it once per set): every card of a set pulled from packs, none bought
  hand: [{ bg: 'shop', lines: [
    L('adou', c => `${c.set ?? '这一套'}……全是你自己开出来的？一张没买？`),
    L('you', '一张没买。'),
    L('adou', '（翻着卡册，手有点抖）我认识的人里，这么开的都破产了。'),
    L('jiu', '他们是借钱开的。'),
    L('jiu', '同行会传的：这家店的卡册，是一包一包拆出来的。'),
    L('jiu', c => `这名气现在当不了饭吃。等你开下一家店，${c.fame ? `这 ${c.fame} 点` : '它'}跟着你走。`),
  ] }],
  // milestones (no debt needed)
  bigpull: [{ bg: 'shop', lines: [
    L('adou', '等等。'),
    L('adou', c => `${c.card}？市价 ${c.price}？能……能让我摸一下吗？`),
    L('jiu', '阿豆。'),
    L('adou', '……我就看看。'),
    L('jiu', '开得好。记住这种感觉，账单来的时候用得上。'),
  ] }],
  unlock: [{ bg: 'shop', lines: [
    L('jiu', c => `听说你要进「${c.set}」了？`),
    L('jiu', '进货的钱花出去，账可不会少一分。'),
    L('adou', '九姐的意思是：恭喜。'),
  ] }],
};

// the last line's button: what the player does next (default: back to the shop)
export const END: Record<string, string> = { opening: '开张', branch: '开张', debt_cleared: '这店是我的了', bankrupt: '走吧' };

export const BIG_PULL = 100; // a card at least this much (market) is the first 大货 阿豆 comes over for

export type Seen = Record<string, number>;
// Which scene a debt beat plays, or null (already played, or nothing to say). Marks nothing: the ui marks `key` when it plays.
export function sceneFor(b: DebtBeat | null, seen: Seen): string | null {
  if (!b || (b.key && seen[b.key])) return null;
  if (b.kind === 'story') return b.id && SCENES[b.id] ? b.id : null;
  if (b.kind === 'paid') return seen.paid1 ? (b.week ?? 0) % 2 ? 'paid' : 'paid2' : 'paid1';
  return b.kind;
}
