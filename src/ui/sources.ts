// Footer: data sources with links, the game settings in plain words, and 价格口径 (what each number means, what is not modelled).
import { html, render } from 'lit-html';
import { SETS, DATA, packsUpdated } from '../sets.ts';
import * as S from '../sim.ts';
import { G, $, money } from './common.ts';
import { ACH } from '../achievements.ts';

// A street's numbers in words, for 游戏设定 (game.ts STREETS): customer types, pack buyers' ceiling and budget, walk-ins, per set.
const x = (v: number) => `×${+v.toFixed(2)}`;
function streetFx(st: ReturnType<typeof G.street>) {
  const TY = st.types ? Object.entries(st.types).map(([t, w]) => `${G.TYPES[t].name}${x(w)}`) : [];
  const sets = st.sets ? Object.entries(st.sets).map(([id, o]) => `${G.setById(id).name}${o.w != null ? ` 买整包的人${x(o.w)}` : ''}${o.tol ? ` 肯付上限 +${Math.round(o.tol * 100)} 个百分点` : ''}`) : [];
  return [...TY, st.crowd && `进店人数${x(st.crowd)}`, st.tol && `拆包玩家肯付上限 ${st.tol > 0 ? '+' : '−'}${Math.round(Math.abs(st.tol) * 100)} 个百分点`, st.budget && `拆包玩家预算${x(st.budget)}`, ...sets].filter(Boolean).join('、');
}
const maxM = () => S.roundM(1 + G.SKILLS.luck.step * (G.SKILLS.luck.max + G.PERKS.luck.max)); // the ceiling: 手气 maxed plus 名气「手气底子」maxed

export function renderSources() {
  const upd = SETS.map(s => DATA[s.id].pricesUpdated).sort().pop()?.slice(0, 10);
  render(html`<p>单卡价：TCGplayer 市价（经 <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a>，${upd}）。
      开包概率：TCGplayer 实开统计 ${SETS.map((s, i) => html`${i ? '、' : ''}<a href="${s.rateSource}" target="_blank" rel="noopener">${s.name}</a>（${s.sample.toLocaleString()} 包）`)}。
      整包市价（${packsUpdated}）：${SETS.map((s, i) => html`${i ? '、' : ''}<a href="${s.priceSource}" target="_blank" rel="noopener">PriceCharting ${s.name}</a>`)}。</p>
      <p>游戏设定（不是市场数据）：进货价 = 市价 × ${Math.round(G.WHOLESALE * 100)}%（进货渠道每级 −${G.WHOLESALE_STEP * 100} 个百分点，最低 ${Math.round((G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length) * 100)}%），同行收卡价 = 市价 × ${Math.round(G.BUYLIST * 100)}%。
      进货先进仓库（每系列 ${G.WAREHOUSE} 包），摆上货架才会卖。店里起始 ${G.RACK_BASE} 个货架（「货架」每级 +1，最多每个系列一个），每个货架摆一个系列、放 ${G.DEPTH_BASE} 包（「加层」每级 +${G.DEPTH_STEP}）；想买的系列不在架上，一半拆包玩家会改买架上别的（占货架多的系列更常被挑中），另一半直接走。
      标价 ${Math.round(G.MIN_PCT * 100)}%–${Math.round(G.MAX_PCT * 100)}% 市价，展示柜 ${G.CASE_BASE} 格起；柜里的卡按各自市价的同一个比例标价（单卡标价，开店时 ${Math.round(G.CASE_PCT * 100)}%，单张可以再调），「补满柜位」和带徒弟都先挂最贵的闪卡。
      单卡生意：手上没上柜的闪卡就是柜台上的卡本（最多 ${G.BINDER} 张），找卡的会翻展示柜和卡本，按单卡标价买，一次最多带走 ${G.SEEK_N} 张同一档稀有度的卡、钱够为止；收藏党只看展示柜。
      买完包的拆包玩家有 ${Math.round(G.COUNTER_OPEN * 100)}% 当场拆开（按实测概率开，和你开的包一样），拆出的闪卡一次全报给你：你的收卡价（开店时 ${Math.round(G.BUY_PCT * 100)}%，${Math.round(G.BUY_MIN * 100)}%–${Math.round(G.BUY_MAX * 100)}%）不低于他心里的最低价（平均 ${Math.round(G.SELLER.tol * 100)}% 市价，每人不同）就整叠卖给你；卡本满了、欠着九姐的账时不收，九姐来收账前 ${G.BILL_KEEP / 60} 分钟收卡不动那张账要的钱。收来的卡不进图鉴。
      平均每 ${Math.round(1 / G.ARRIVAL)} 秒进来一位顾客，每位都有来意和预算：${Object.values(G.TYPES).map(t => `${t.name}最多肯付约 ${Math.round(t.tol * 100)}% 市价`).join('，')}（每人不同，招牌每级 +${G.SIGN_STEP * 100} 个百分点，倒爷不受影响；收藏党还看镇店之宝，只看柜里 $${G.BIG_CARD} 以上的卡）。热销的系列顾客多一倍、滞销的少一半。
      每个系列来买整包的人不一样：${SETS.map(x => { const d = G.DEMAND[x.id], pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}`; return `${x.name}「${d.tag}」（肯付上限 ${pp(d.tol)} 个百分点${d.budget !== 1 ? `、预算 ×${d.budget}` : ''}${d.w !== 1 ? `、来的人 ×${d.w}` : ''}${d.crowd ? `、解锁后全店进店人数 +${Math.round(d.crowd * 100)}%` : ''}）`; }).join('，')}。倒爷扫过一个系列后 ${G.FLIP_COOLDOWN / 60} 分钟内不再收它（手上的要先出掉）。
      图鉴收录一个系列的 ${G.DEX_TIERS.map(([a, b]) => `${a * 100}%→回头客 +${b * 100}%`).join('、')}（每个系列各算，加到进店人数上）。
      客流上限：图鉴口碑和新系列带来的客人相乘（口碑客流），合计 ×${G.CROWD_KNEE} 以内全算；超过的部分递减（多出 x 只算 x ÷ (1 + x ÷ 余量)，余量起始 ${G.CROWD_ROOM}），口碑客流最多是基础的 ×${G.CROWD_KNEE + G.CROWD_ROOM}。「店面扩建」每级余量 +${G.ROOM_STEP}（上限跟着 +${G.ROOM_STEP}），共 ${G.UPGRADES.expand.costs.length} 级，首级 $${G.UPGRADES.expand.costs[0].toLocaleString('en-US')}、每级约 ×1.55，越往后多来的人越少，只有口碑客流超过 ×${G.CROWD_KNEE} 才能扩建。技能「人气」和名气「老主顾」乘在口碑客流外面，不受上限递减，各自有满级；收齐（大师套）后这个系列的拆包玩家再肯多付 ${G.MASTER.tol * 100} 个百分点、专程来买的人 ×${G.MASTER.w}。
      图鉴补卡：${G.BUY_R.join('/')} 可以按当前单卡市价从同行买进图鉴册，只进图鉴，不能再卖、上柜或当镇店之宝；普通、非普通、稀有只能开包收。图鉴下面那条是「亲手开出」：只数自己开包开出来的卡（补的不算），开分店、破产都留着；一个系列每一张都亲手开出过，名气 +${G.HAND_FAME}（每个系列一次，下一次开分店时和营业额的名气一起拿；破产不丢，等到开分店）。每张卡「约多少包出一次」按实测概率和现在的手气算，只是平均数。店员每 ${G.CLERK_ROUND / 60} 分钟巡一次货架，给勾选系列的货架进货（1 级补到半满，2 级补满）；两轮之间随时把这些系列仓库里的货搬上架，每个系列留 ${G.CLERK_KEEP} 包给你拆（打烊时也搬）；不领工资。
      技能用现金升级，第 L+1 级的价格 = 首级价 × 倍数^L：${Object.values(G.SKILLS).map(k => `${k.name}（${k.group}，${k.max} 级，首级 $${k.base}${k.max > 1 ? `、每级 ×${k.grow}` : ''}；1 级 ${k.fx(1)}${k.max > 1 ? `，满级 ${k.fx(k.max)}` : ''}）`).join('；')}。
      手气只改你开包时用的概率：每种闪卡（${S.HITS.join('/')}）的实测概率乘同一个系数，例如${SETS[0].name} SIR ${SETS[0].rates.SIR}% 满级（含名气「手气底子」）变成 ${(SETS[0].rates.SIR * maxM()).toFixed(2)}%；实测概率本身不变，欧气检测按每一包开的时候的概率和模拟玩家比。货架和仓库都空了、钱也不够进一包时，九姐借你 $${G.BAILOUT} 进货（记成借款；额度用完就是破产）。</p>
      <p>债务（游戏设定）：第 1 家店开张欠九姐 ${money(G.DEBT0)}（含开张的 $${G.START_CASH.toLocaleString('en-US')}），第 N 家店欠 ×(1 + ${G.DEBT_STEP}×(N−1))。一周 = 页面开着的 ${G.WEEK / 60} 分钟。离开（切到别的标签页、锁屏、合上电脑、关掉页面都算，从页面被藏起来那一刻算起）不管多久，账期最多再走一周，九姐趁你不在只来一次；店最多替你开 ${G.OFFLINE_CAP / 3600} 小时（没雇店员 ${G.NOCLERK_CAP / 3600} 小时）。离开 ${G.AWAY / 60} 分钟以上，回来有一张离店小票。第 w 周的账 = $${G.BILL0} × ${G.BILL_G}^(w−1)（后面的店同样按比例放大），分期不计息，付到欠款为零为止；到期时收银机里的钱够就直接扣。
      付不上有 ${G.GRACE / 60} 分钟宽限，宽限到了差多少就替你借多少，借不到就破产；宽限只在你看着的时候走：离开期间和开包演出期间它停着，不借也不破产，回来剩多少还是多少（离开时到期的账，回来是满的 ${G.GRACE / 60} 分钟）。借款每周利滚利 ${Math.round(G.LOAN_RATE * 100)}%（每破产一次 +${Math.round(G.LOAN_MARK * 100)} 个百分点，最多 +${Math.round(G.LOAN_MARK * 300)}），额度 = 这家店做到过的最好一周营业额，最少 ${money(G.LOAN_FLOOR)}；借款滚到额度以上的部分并进下一张账；每周付完账，九姐再从收银机里顺手收回借款的三分之一（最少 ${money(G.LOAN_MIN)}，第 n 家店按债同比放大），只拿店员补满货架要的钱（最少 ${money(G.LOAN_FLOAT)}）加下周分期以上的部分，不够就少收或不收，不算逾期。借的钱不算营业额。随时可以提前还，先还借款再还分期。导航「成长」上的数字只数闲钱（现金减去下一张账）买得起的升级和技能；这周买的升级或技能，在现金不够付这周的账时可以退回，拿回 ${Math.round(G.REFUND * 100)}%（扣掉的一成和借一周的利息一样多）。
      破产：现金、仓库和货架上的包、卡册和展示柜里的卡、升级、技能、营业额都被收走，这家店不给名气，同一家店从第 1 周重来、欠同样的钱；图鉴、成就、欧气检测记录、名气和名气加成留下。</p>
      <p>开分店（游戏设定）：这家店的债还清以后可以关掉它去开一家新的，带走名气 = √(本店营业额 ÷ ${G.FAME_UNIT.toLocaleString('en-US')}) 取整（${[5e5, 1e6, 2e6].map(v => `${money(v)} → ${G.fameFor(v)}`).join('，')}）。新店从零开始，欠九姐的本钱多 ${G.DEBT_STEP * 100}%：现金 $${G.START_CASH}、没有货、没有升级和技能、营业额归零（后面的系列要重新解锁）；卡册和展示柜里的卡、图鉴、成就和欧气检测的全部记录都带走，成就奖金不会再发一次。每家店开在一条街上，按店号轮流：${G.STREETS.map((st, i) => `第 ${i + 1}${i ? '' : '、' + (G.STREETS.length + 1)} 家${st.name}（${i ? streetFx(st) : '上面这些数字原样'}）`).join('，')}，往后照此循环；破产重来还在同一条街。
      名气买永久加成，第 L+1 级要 首级价 + L 名气，每项都有上限：${Object.values(G.PERKS).map(p => `${p.name}（${p.max} 级，首级 ${p.base} 名气；满级 ${p.fx(p.max)}）`).join('；')}。老主顾加在基础客流上，不受客流上限递减；手气底子只加「手气」的级数，满级开包仍是负期望（见「价格口径」）。</p>
      <p>成就（游戏设定）：${ACH.length} 个，每个解锁时发一次现金奖金，从 ${money(Math.min(...ACH.filter(a => a.cash).map(a => a.cash)))} 到 ${money(Math.max(...ACH.map(a => a.cash)))}，全部加起来 ${money(ACH.reduce((s, a) => s + a.cash, 0))}；「全图鉴」「全手开图鉴」「满级卡铺」只有标签没有奖金。奖金不算营业额（不提前解锁系列），不改开包概率、价钱和顾客；欧气类成就（欧洲人、欧皇本皇、非酋补贴）开满 30 包后按欧气检测的百分位算，手气加成开的包照旧只和同样加成的模拟玩家比。隐藏成就解锁前只露一句提示。清空存档会连成就一起清掉。</p>`, $('sources'));
}

export function renderBasis() {
  const ev = (id: string) => S.packEV(id);
  const lucky = (id: string) => ev(S.rateKey(id, maxM()));
  const rows = SETS.map(s => html`<tr><td>${s.name}</td><td>${money(s.packPrice)}</td><td>${money(ev(s.id))}</td><td>${Math.round(ev(s.id) / s.packPrice * 100)}%</td><td>${money(lucky(s.id))}（${Math.round(lucky(s.id) / s.packPrice * 100)}%）</td></tr>`);
  render(html`<summary>价格口径与没建模的东西</summary>
      <p>单卡是 TCGplayer 市价（成交均价），整包是 PriceCharting 的散包价，两个来源不同。下表「期望市值」= 每个槽位的概率 × 该稀有度卡池的平均单卡市价，不含任何游戏设定。</p>
      <table class="tally"><thead><tr><th>系列</th><th>整包标价</th><th>期望市值</th><th>占比</th><th>满手气 ×${maxM()}</th></tr></thead><tbody>${rows}</tbody></table>
      <p>期望只有标价的四成多。这个差距是两个口径直接算出来的，不是游戏调的：整包标价里含密封品本身的溢价（收藏、囤货、抽奖的人愿意多付），拆开后只剩单卡的价值。另外单卡市价是成交价，不扣平台费和运费，你在游戏里卖给同行只拿 ${Math.round(G.BUYLIST * 100)}%。
      最后一列是技能「手气」满级（含名气「手气底子」）时的期望（游戏加成，不是市场数据），仍低于最低进货价（市价的 ${Math.round((G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length) * 100)}%），开包还是花钱买乐趣和图鉴。</p>
      <p>欧气检测把你开出的每张卡按<b>当前</b>单卡市价重算再和模拟玩家比，所以刷新价格数据不会让旧存档的百分位错位。只有本功能上线前开的包，无法重算，仍按开包当时的价格。</p>
      <p>没建模：棱镜进化的 Demigod（3 张 SIR）/ God Pack 和 151 的 God Pack。TCGplayer 的文章明说样本里没开出 God Pack，给不出可靠概率，所以不编数字；文章里的 SIR 概率已经包含了这类包的贡献，因此单包期望大体不受影响，只是没有这种「一包全是大货」的极端开局。
      超级进化系列用超级金卡 MHR 取代了金卡 HR，TCGplayer 没写它出在哪个槽位，我们放在 HR 原来的位置（第二张反闪）：这只决定它能不能和 IR/SIR 同包，单包出 MHR 的概率就是实测值。
      黑闪/白焰（黑白稀有 BWR 在 700 多包里一张没开到）、30 周年（RGB 稀有同样没开到）拿不到可靠的实测概率，所以没收录。</p>
      <p>游戏设定（不是市场数据）：展示柜共 ${G.CASE_BASE} 个柜位（展示柜每级 +2），货架 ${G.RACK_BASE} 个起、最多 ${G.RACK_BASE + G.UPGRADES.racks.costs.length} 个，每个 ${G.DEPTH_BASE} 包起（加层每级 +${G.DEPTH_STEP}，最多 ${G.DEPTH_BASE + G.DEPTH_STEP * G.UPGRADES.depth.costs.length} 包），仓库每系列 ${G.WAREHOUSE} 包；每 ${G.HEAT_EVERY / 60} 分钟行情重排一次，一个系列热销（市价 +15%、顾客多一倍）、一个滞销（−10%、顾客少一半）；累计营业额到 ${SETS.filter(s => G.unlockAt(s.id)).map(s => `${s.name} ${money(G.unlockAt(s.id))}`).join('、')} 才能进货（后发售的系列解锁得晚，并各自带来一批新客人）；打烊期间的买卖最多按 ${G.OFFLINE_CAP / 3600} 小时结算（要雇了店员；没店员最多 ${G.NOCLERK_CAP / 3600} 小时，技能「看店」每级 +2 小时）。顾客的来意、预算、肯付的价、图鉴口碑和店员的规则见页面最下方的说明。</p>`, $('basis'));
}
