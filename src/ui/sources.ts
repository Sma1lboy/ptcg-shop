// Footer: data sources with links, the game settings in plain words, and 价格口径 (what each number means, what is not modelled).
import { html, render } from 'lit-html';
import { SETS, DATA, packsUpdated } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money } from './common.ts';
import { ACH } from '../achievements.ts';

const maxM = () => S.roundM(1 + G.SKILLS.luck.step * (G.SKILLS.luck.max + G.PERKS.luck.max)); // the ceiling: 手气 maxed plus 名气「手气底子」maxed

export function renderSources() {
  const upd = SETS.map(s => DATA[s.id].pricesUpdated).sort().pop()?.slice(0, 10);
  render(html`<p>单卡价：TCGplayer 市价（经 <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a>，${upd}）。
      开包概率：TCGplayer 实开统计 ${SETS.map((s, i) => html`${i ? '、' : ''}<a href="${s.rateSource}" target="_blank" rel="noopener">${s.name}</a>（${s.sample.toLocaleString()} 包）`)}。
      整包市价（${packsUpdated}）：${SETS.map((s, i) => html`${i ? '、' : ''}<a href="${s.priceSource}" target="_blank" rel="noopener">PriceCharting ${s.name}</a>`)}。</p>
      <p>游戏设定（不是市场数据）：进货价 = 市价 × ${Math.round(G.WHOLESALE * 100)}%（进货渠道每级 −${G.WHOLESALE_STEP * 100} 个百分点，最低 ${Math.round((G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length) * 100)}%），同行收卡价 = 市价 × ${Math.round(G.BUYLIST * 100)}%。
      进货先进仓库（每系列 ${G.WAREHOUSE} 包），摆上货架才会卖。店里起始 ${G.RACK_BASE} 个货架（「货架」每级 +1，最多每个系列一个），每个货架摆一个系列、放 ${G.DEPTH_BASE} 包（「加层」每级 +${G.DEPTH_STEP}）；想买的系列不在架上，一半拆包玩家会改买架上别的（占货架多的系列更常被挑中），另一半直接走。
      标价 ${Math.round(G.MIN_PCT * 100)}%–${Math.round(G.MAX_PCT * 100)}% 市价，展示柜 ${G.CASE_BASE} 格起。
      平均每 ${Math.round(1 / G.ARRIVAL)} 秒进来一位顾客，每位都有来意和预算：${Object.values(G.TYPES).map(t => `${t.name}最多肯付约 ${Math.round(t.tol * 100)}% 市价`).join('，')}（每人不同，招牌每级 +${G.SIGN_STEP * 100} 个百分点，倒爷不受影响；收藏党还看镇店之宝，只看柜里 $${G.BIG_CARD} 以上的卡）。热销的系列顾客多一倍、滞销的少一半。
      每个系列来买整包的人不一样：${SETS.map(x => { const d = G.DEMAND[x.id], pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}`; return `${x.name}「${d.tag}」（肯付上限 ${pp(d.tol)} 个百分点${d.budget !== 1 ? `、预算 ×${d.budget}` : ''}${d.w !== 1 ? `、来的人 ×${d.w}` : ''}${d.crowd ? `、解锁后全店进店人数 +${Math.round(d.crowd * 100)}%` : ''}）`; }).join('，')}。倒爷扫过一个系列后 ${G.FLIP_COOLDOWN / 60} 分钟内不再收它（手上的要先出掉）。
      图鉴收录一个系列的 ${G.DEX_TIERS.map(([a, b]) => `${a * 100}%→回头客 +${b * 100}%`).join('、')}（每个系列各算，加到进店人数上）。
      客流上限：图鉴口碑、技能人气、新系列带来的客人三者相乘，合计 ×${G.CROWD_KNEE} 以内全算；超过的部分递减（多出 x 只算 x ÷ (1 + x ÷ 余量)，余量起始 ${G.CROWD_ROOM}），进店人数最多是基础的 ×${G.CROWD_KNEE + G.CROWD_ROOM}。「店面扩建」每级余量 +${G.ROOM_STEP}（上限跟着 +${G.ROOM_STEP}），共 ${G.UPGRADES.expand.costs.length} 级，首级 $${G.UPGRADES.expand.costs[0].toLocaleString('en-US')}、每级约 ×1.6，越往后多来的人越少，只有加成超过 ×${G.CROWD_KNEE} 才能扩建；收齐（大师套）后这个系列的拆包玩家再肯多付 ${G.MASTER.tol * 100} 个百分点、专程来买的人 ×${G.MASTER.w}。
      图鉴补卡：${G.BUY_R.join('/')} 可以按当前单卡市价从同行买进图鉴册，只进图鉴，不能再卖、上柜或当镇店之宝；普通、非普通、稀有只能开包收。店员每 ${G.CLERK_ROUND / 60} 分钟巡一次货架，给勾选系列的货架进货（1 级补到半满，2 级补满），不领工资。
      技能用现金升级，第 L+1 级的价格 = 首级价 × 倍数^L：${Object.values(G.SKILLS).map(k => `${k.name}（${k.group}，${k.max} 级，首级 $${k.base}${k.max > 1 ? `、每级 ×${k.grow}` : ''}；1 级 ${k.fx(1)}${k.max > 1 ? `，满级 ${k.fx(k.max)}` : ''}）`).join('；')}。
      手气只改你开包时用的概率：每种闪卡（${S.HITS.join('/')}）的实测概率乘同一个系数，例如${SETS[0].name} SIR ${SETS[0].rates.SIR}% 满级变成 ${(SETS[0].rates.SIR * maxM()).toFixed(2)}%；实测概率本身不变，欧气检测按每一包开的时候的概率和模拟玩家比。货架空了、钱花光了、也没有卡可卖时，亲戚周济 $${G.BAILOUT}。</p>
      <p>成就（游戏设定）：${ACH.length} 个，每个解锁时发一次现金奖金，从 ${money(Math.min(...ACH.filter(a => a.cash).map(a => a.cash)))} 到 ${money(Math.max(...ACH.map(a => a.cash)))}，全部加起来 ${money(ACH.reduce((s, a) => s + a.cash, 0))}；「全图鉴」「满级卡铺」只有标签没有奖金。奖金不算营业额（不提前解锁系列），不改开包概率、价钱和顾客；欧气类成就（欧洲人、欧皇本皇、非酋补贴）开满 30 包后按欧气检测的百分位算，手气加成开的包照旧只和同样加成的模拟玩家比。隐藏成就解锁前只露一句提示。清空存档会连成就一起清掉。</p>`, $('sources'));
}

export function renderBasis() {
  const ev = (id: string) => S.packEV(id);
  const lucky = (id: string) => ev(S.rateKey(id, maxM()));
  const rows = SETS.map(s => html`<tr><td>${s.name}</td><td>${money(s.packPrice)}</td><td>${money(ev(s.id))}</td><td>${Math.round(ev(s.id) / s.packPrice * 100)}%</td><td>${money(lucky(s.id))}（${Math.round(lucky(s.id) / s.packPrice * 100)}%）</td></tr>`);
  render(html`<summary>价格口径与没建模的东西</summary>
      <p>单卡是 TCGplayer 市价（成交均价），整包是 PriceCharting 的散包价，两个来源不同。下表「期望市值」= 每个槽位的概率 × 该稀有度卡池的平均单卡市价，不含任何游戏设定。</p>
      <table class="tally"><thead><tr><th>系列</th><th>整包标价</th><th>期望市值</th><th>占比</th><th>满手气 ×${maxM()}</th></tr></thead><tbody>${rows}</tbody></table>
      <p>期望只有标价的四成多。这个差距是两个口径直接算出来的，不是游戏调的：整包标价里含密封品本身的溢价（收藏、囤货、抽奖的人愿意多付），拆开后只剩单卡的价值。另外单卡市价是成交价，不扣平台费和运费，你在游戏里卖给同行只拿 ${Math.round(G.BUYLIST * 100)}%。
      最后一列是技能「手气」满级时的期望（游戏加成，不是市场数据），仍低于最低进货价（市价的 ${Math.round((G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length) * 100)}%），开包还是花钱买乐趣和图鉴。</p>
      <p>欧气检测把你开出的每张卡按<b>当前</b>单卡市价重算再和模拟玩家比，所以刷新价格数据不会让旧存档的百分位错位。只有本功能上线前开的包，无法重算，仍按开包当时的价格。</p>
      <p>没建模：棱镜进化的 Demigod（3 张 SIR）/ God Pack 和 151 的 God Pack。TCGplayer 的文章明说样本里没开出 God Pack，给不出可靠概率，所以不编数字；文章里的 SIR 概率已经包含了这类包的贡献，因此单包期望大体不受影响，只是没有这种「一包全是大货」的极端开局。
      超级进化系列用超级金卡 MHR 取代了金卡 HR，TCGplayer 没写它出在哪个槽位，我们放在 HR 原来的位置（第二张反闪）：这只决定它能不能和 IR/SIR 同包，单包出 MHR 的概率就是实测值。
      黑闪/白焰（黑白稀有 BWR 在 700 多包里一张没开到）、30 周年（RGB 稀有同样没开到）拿不到可靠的实测概率，所以没收录。</p>
      <p>游戏设定（不是市场数据）：展示柜共 ${G.CASE_BASE} 个柜位（展示柜每级 +2），货架 ${G.RACK_BASE} 个起、最多 ${G.RACK_BASE + G.UPGRADES.racks.costs.length} 个，每个 ${G.DEPTH_BASE} 包起（加层每级 +${G.DEPTH_STEP}，最多 ${G.DEPTH_BASE + G.DEPTH_STEP * G.UPGRADES.depth.costs.length} 包），仓库每系列 ${G.WAREHOUSE} 包；每 ${G.HEAT_EVERY / 60} 分钟行情重排一次，一个系列热销（市价 +15%、顾客多一倍）、一个滞销（−10%、顾客少一半）；累计营业额到 ${SETS.filter(s => G.unlockAt(s.id)).map(s => `${s.name} ${money(G.unlockAt(s.id))}`).join('、')} 才能进货（后发售的系列解锁得晚，并各自带来一批新客人）；离线收益最多按 ${G.OFFLINE_CAP / 3600} 小时结算（技能「看店」每级 +2 小时）。顾客的来意、预算、肯付的价、图鉴口碑和店员的规则见页面最下方的说明。</p>`, $('basis'));
}
