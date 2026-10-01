# ptcg-shop（欧气卡铺）

宝可梦卡牌（PTCG）开包模拟 + 卡店经营放置游戏 + 欧气检测。Vite + TypeScript + lit-html，构建产物是单个自带全部代码和数据的 `dist/index.html`。

## 命令

| 做什么 | 命令 |
|---|---|
| 装依赖（新 worktree 由 `.rove/init.sh` 自动跑） | `npm ci` |
| 开发 | `npm run dev` → http://localhost:5173 ，卡图直接出仓库根的 `assets/tcg/` |
| 测试 | `npm test`（就是 `node test/sim.test.mjs`，node 22 直接跑 `.ts`） |
| 构建 | `npm run build`：先 `tsc` 类型检查，再出 `dist/index.html`。双击能玩（卡图走 TCGdex CDN）；`npm run preview` 或任何静态服务器开 `dist/` 用本地镜像 |
| CodePen 单文件 | `npm run pen` → `dist/pen.html`，超过 1,000,000 字符构建直接失败 |
| 成长曲线 | `node scripts/autoplay.mjs [小时] [开包比例] [标价]` |
| 配色约束 | `node scripts/contrast.mjs`（对比度、胶垫明度差、黄/金色相差，不过就退出 1） |
| 像素字 | `node scripts/pixel-font.mjs`（加了新文案后重切字体子集，要 `uv`：用户已同意，用 uvx 跑 fonttools，不进 package.json）；`--check` 列出源码里有、字体里没有的字，缺就退出 1 |

根目录的 `index.html` 是 Vite 的入口（引用 `/src/main.ts`），不能再双击打开；双击入口是 `dist/index.html`。

## 规矩（每个 worker 必读）

- **依赖白名单：运行时只有 `three`、`lit-html`；开发时只有 `vite`、`typescript`、`vite-plugin-singlefile`。** 框架、组件库、CSS 框架、测试框架、i18n 层一律不加；确实要加，先问用户。版本在 package.json 里写死，改版本连 package-lock.json 一起提交。
- **TypeScript 只写可擦除语法**（tsconfig 开了 `erasableSyntaxOnly`）。测试和 autoplay 让 node 直接跑 `src/*.ts`，所以不许用 enum、namespace、构造函数参数属性；import 带 `.ts` 后缀；只导入类型写 `import type`。唯一的例外是 `src/table3d.js`：3D 场景保持纯 JS（tsconfig 的 `allowJs`，引用方拿到推断出的类型，文件本身不做类型检查）。
- **three.js 只用于开包台的 3D 场景（`src/table3d.js`），一律动态 `import('three')` / `import('three/addons/…')`，写字面量路径。** 构建时它不进包（压缩后约 800 KB，会撑爆 pen），由 `vite.config.ts` 注入的 import map 从 jsdelivr 加载和 node_modules 同一版本（package.json 钉死 0.176.0，3D 场景就是按这个版本做的，升级要重新看一遍效果）；dev 用 node_modules 里的。动态加载保证 CDN 挂了只丢 3D，页面照常能玩。WebGL 不可用、`prefers-reduced-motion`、three 还没加载到或加载失败时，`mountTable` 返回 null，`mat.ts` 退回 2D 开包台。
- **面板用 lit-html 的 `html` 模板 + `render()` 渲染，不用 `innerHTML` 拼字符串。** lit 自己转义文本和属性，别再套 escape；条件属性写 `?disabled=${…}`，表单状态写 `.checked=${…}`。例外：开包台 `#mat`（含 2D 的 `#stage` 和 3D 的 `#scene3d`）、分享弹窗与 `inspect.ts` 卡片欣赏窗口是命令式 DOM；模板通过 `toHTML()` 转换，不拼入未经转义的数据。弹窗用原生 `<dialog>` / `popover`。
- **需要图片素材时可以生成（用户已同意，走 OpenAI）**：用 `gpt-image` skill（先查它的 gallery / craft 提示词库），或 `uvx --from git+https://github.com/wuyoscar/gpt_image_2_skill gpt-image -p "…" -f out.png`（key 在 `~/.env` 的 `OPENAI_API_KEY`）。用途：桌面/柜台/胶垫等 3D 贴图、道具、成就徽章、插画、背景这类 UI 素材。规矩：只在开发时生成，游戏运行时不调任何 API；草稿 `--quality low`，定稿才 `high`，不要 `-n` 批量刷；转成体积小的 webp 放进 `public/gen/`（或各自模块旁）并提交，文件名旁写一行生成用的提示词（`public/gen/PROMPTS.md`）；不生成仿冒宝可梦官方卡面、卡背、logo 或角色的图；pen 仍须 < 1,000,000 字符，大图不内联，pen 里缺图要有降级。
- **界面只有中文**，不做多语言（全局 i18n 规则不适用于本项目）。
- **数据要公正，这是产品的底线：**
  - `data/cards-*.json` 由 `node scripts/fetch-data.mjs [系列 id…]` 生成，**不许手改**。要刷新价格就删 `data/raw/` 重跑。整包价 `data/packs.json` 由 `node scripts/fetch-packs.mjs` 从各系列的 `priceSource`（PriceCharting）抓，同样不许手改。
  - 新系列必须有 TCGplayer 实开统计文章（正文用 `https://infinite-api.tcgplayer.com/content/article/<uuid>/?source=infinite-content` 拿）；有稀有度没测出概率的系列（如黑闪/白焰的 BWR）不加，不许估。
  - `src/sets.ts` 里的 `rates` 是 TCGplayer 实开统计的百分比，**不许为了手感改概率**。改动必须附来源链接（写在 `rateSource` 或注释里）。
  - 技能「手气」是标明的游戏加成：只在开包时把闪卡概率乘系数（`sim.ts` 的 `openPack(id, r, m)`），`rates` 本身不动；每包按 `rateKey(set, m)` 记进 `state.packsBy`，欧气检测、期望、尾概率都按开包时的概率算。m = 1 的输出由测试里的哈希锁定，别往这条路径加随机数调用。
  - 游戏设定（进货折扣、收卡价、客流、升级数值等）可以自由设计，但要在 `src/game.ts` 里标明是游戏设定，并在页脚「游戏设定」里向玩家说明。
- **改完必须跑** `npm test`（20 万包/系列，每个稀有度都要落在 TCGplayer 95% 置信区间内）。改了模拟逻辑就在这个文件里加断言，不要另起测试框架。`src/game.ts` 不直接碰 `Date.now` / `Math.random` / `localStorage`，一律走 `createGame({ now, random, storage })` 的参数，测试和 autoplay 靠它注入假时钟和种子随机数。
- 视觉：先读 `DESIGN.md`（每个 token 对应柜台上哪件实物、管什么、不许干什么）。颜色全部走 `style.css` 顶部的 token，浅色/深色两套都要对，改了颜色 token 跑 `node scripts/contrast.mjs`。强调色只有卡框黄（玩家定的价签 + 每组一个主按钮），稀有度用银/金（对应卡面上的银星/金星），钱用 gain/loss（进账红、出账冷灰）。不许圆角卡片加左侧彩条，别往 AI 默认审美上靠（紫蓝渐变、emoji 当图标、全部居中、每块都加圆角阴影）。
- **卡图和 Logo 从本地服务器出，不要直连 TCGdex**（用户要求：别把 API 打爆）。`node scripts/fetch-images.mjs` 把全部卡图（low/high webp）和 logo 镜像到仓库根的 `assets/tcg/`（约 90 MB，gitignored；新 worktree 由 `.rove/init.sh` 软链到主仓库的镜像）。**别挪进 `public/`**，那样每次构建都往 `dist/` 拷 88 MB；dev 服务器直接出根目录下的它（`vite.config.ts` 让 watcher 忽略这个目录），`npm run build` 在 `dist/assets/tcg` 放一个指回去的软链。代码里一律用 `src/assets.ts` 的 `card(set, n, size)` / `logo(set)`，不要自己拼 URL。只有 `file://` 打开和 pen（`--mode pen` 把 `__REMOTE_ASSETS__` 定为 true）会退回 CDN；CDN 地址不许带 query string。本地同源的图做 canvas / WebGL 贴图没有 CORS 问题，所以要看 3D/分享效果请用 `npm run dev` 或 `npm run preview`。

## 文件分工（并行 worker 按这个认领，动别人的文件要在报告里说明）

| 文件 | 管什么 |
|---|---|
| `src/sets.ts` | 系列配置（实测概率、置信区间、整包市价、来源链接），并载入 `data/cards-*.json` 导出为 `DATA` |
| `src/sim.ts` | 纯函数：开包、期望值、欧气百分位。浏览器和 node 通用 |
| `src/game.ts` | `createGame()`：存档、经济、店铺动作、收藏室实体卡转移及门票、挂机／离线奖励。不碰 DOM；`setIdle()` 由入口按页面与可见性切换，额外收入记 `state.extra`，不计商品营业额 |
| `src/main.ts` | 入口：启动顺序、`renderAll()`。监听器的注册顺序就是旧的脚本加载顺序，别随手调换 |
| `src/ui/common.ts` | 全页唯一的游戏实例 `G`、金额格式、卡图地址、稀有度名字 |
| `src/ui/card.ts` | 卡面：全站唯一的 2D 卡（`face` 卡图 + 闪面 + 加载失败的白卡纸、`cap` 卡下的记号和价、`mark` 印刷的稀有度记号 SVG、`back` / `energy` 卡背和能量卡的 SVG 图，分享图也用）。规格在 DESIGN.md「卡面」；开包台拼字符串的地方用 `toHTML()` |
| `src/ui/inspect.ts` | 共用卡片欣赏：原生 dialog，放大、翻面、指针／触控闪面；复用 `card.ts`，明确关闭键。图鉴未收录的卡不展示原图，翻牌期间卡册入口不得泄露新卡 |
| `src/ui/collection.ts` | 独立收藏室 `#collection`：五个固定展位、纯展示与布置模式、实体卡移入／换位／取回、门票与展品总值；不进入售卖展示柜或店员补柜逻辑 |
| `src/ui/{stats,shelf,log,luck,binder,singles,upgrades,skills,case,notice,guide,goals,sources}.ts` | 每个面板一个文件，各自 `render()` 进 `index.html` 里对应的容器；只读 `G.state`、只调 `G` 的方法。`goals` 是顾客/店员（货柜页），`binder` 是欧气页的卡册（战利品 + 各系列图鉴、补卡、亲手开出），`upgrades` + `skills` 是成长页（店铺等级、开分店和名气加成、升级和技能的口袋、手气的官方/加成后概率对照），`sources` 是页脚的来源、游戏设定和价格口径，`guide` 是新手引导：一个原生 popover（`#coach`）贴在当前步要按的按钮旁，步骤从存档状态推出，页脚「新手引导」重放 |
| `src/ui/mat.ts` | 开包台：撕包、逐张翻、批量开、拖拽／滑动／空格输入及 3D 适配。命令式 DOM；`mat.up` / `mat.cur` 管翻牌进度，`held` 镜像 3D 举牌状态，说明牌和「放回」键跟它走。举牌可用放回键、桌面点击、Esc／X、空格／回车／Z 结束，对话框优先处理自己的键 |
| `src/table3d.js` | 开包台 three.js 场景，纯演出，不读游戏状态。`mountTable(el, { onTear, onFlip, onDone, onPick, onLost, onHold, onLook, reducedMotion })` → `{ showShelf, hover, showPack, showBatch, lookAt, putBack, flip, flipAll, resize, dispose }`。`showShelf(items)` 读 mat.ts 提供的 `{ set, n, off }`；`showBatch(set,packs,picks,{news,quick})` 的重点卡与新卡下标由 mat.ts 决定。`onLook(k)` 在第 k 张举到眼前时触发，放下时为 -1；`putBack()` 放回举着的卡。`ready` 等待 three 加载；静止不渲染，开发时 `window.__t3` 读帧数和 renderer.info |
| `src/series.ts` | 十个系列的演出数据与纯函数：原创图形、出牌顺序、撕口轨迹、晃动幅度；3D 与 2D 共用笔画和节奏，不读取游戏状态，不消耗开包随机数 |
| `src/achievements.ts` | 成就：45 个成就的定义、奖金（游戏设定）和判定。`note(G, packs)` 在每次开包事件记计数（`state.feat`），`check(G)` 按状态判定、记进 `state.ach`、用 `G.bonus` 一次性发奖金。不改任何概率和数值 |
| `src/ui/ach.ts` | 成就页 `#ach`（每个成就一张评级标签）和解锁提示；翻牌没翻完（`hold`）不判成就 |
| `src/story.ts` / `src/ui/story.ts` / `src/debt.ts` | 剧情：台词和触发规则（纯数据，node 能测）/ 过场播放器（全屏 `<dialog>`，排队、开包演出中不插、引导让路）/ 读经济状态和事件的唯一适配层（`bill()` `inDebt()` `debtBeat()`；经济接口改名只改这个文件，字段不存在时返回 null，剧情只放开场）。插画在 `public/gen/story/`，提示词在 `public/gen/PROMPTS.md` |
| `src/ui/share.ts` | 分享图（canvas 绘制）和分享弹窗 |
| `src/ui/events.ts` | 按钮的 `data-act` 点击分发 |
| `src/fx.ts` | 全部声音的合成（WebAudio，不用音频文件）：开包、店里（风铃/收银/倒爷/催账/锤子/卷帘门…）、界面按键、循环的环境声；总线、音量、静音、环境声开关（localStorage `ptcg.mute` `ptcg.vol` `ptcg.amb`）。还有稀有卡爆闪、卡面倾斜。纯演出，不读游戏状态 |
| `src/ui/sound.ts` | 什么时候出声：订阅 `G.on`（顾客走 `state.recent`，债务走 `debt.ts`）、翻页、按键、剧情的 `ptcg:line`；同类声音限频，开包演出和剧情时店里不出声；页脚「声音」弹层。规矩见 DESIGN.md「声音」 |
| `src/ui/menu.ts` | 键盘菜单：方向键在最上面那一层里移 ▶ 光标到最近的控件，Enter/空格/Z 确认，Esc/X 退出；声音走 `ptcg:ui`。规矩见 DESIGN.md「菜单与光标」 |
| `src/ui/walk.ts` | 货柜页顶上的店面地板：店主、店员、每位进店顾客（按 `state.recent`）和收账的九姐阿豆是像素小人，走进来、头顶冒 ♪ … ? 气泡、走出去。纯演出，只读状态。规矩见 DESIGN.md「店里的人」 |
| `src/assets.ts` | 卡图/logo 的地址：本地镜像或 CDN 回退 |
| `style.css` | 全部样式与 token |
| `index.html` | Vite 外壳：六页导航（开包／货柜／欧气／成长／成就／收藏室）与页脚。面板容器 id 是各自 render 的目标 |
| `src/ui/layout.ts` | hash 路由 `#open #shelf #case #luck #grow #ach #collection`；`currentPage()` 是规范化页面值，未知 hash 回退开包，挂机判定共用它。只隐藏不重建页面；`#case` 是货柜的展示柜视图；处理开包前切页和成长／货柜提示点 |
| `src/ui/rail.ts` | 开包页右栏：仓库里的包、手气等级与官方／游戏加成后概率、升级回执、欧气结论。`skills.ts` 提供手气展示数据，`stats.ts` 渲染独立挂机／离线收益面板 |
| `DESIGN.md` | 设计依据：题材、token 角色和约束、字、布局、组件规矩 |
| `ROADMAP.md` | 产品化 loop 的状态：当前里程碑、候选里程碑、待办池（标里程碑、文件、验收）、竞品拆解、完成记录。每轮开始读、结束写 |
| `vite.config.ts` | 构建：单文件、three 走 CDN import map、pen 模式和 1 MB 上限 |
| `scripts/` | 数据抓取（fetch-data 卡表和单卡价、fetch-packs 整包价）、卡图镜像（fetch-images）、自动玩家（autoplay）、配色约束检查（contrast）、像素字子集（pixel-font） |
| `test/sim.test.mjs` | 唯一的测试 |

## 在 Rove 里干活

- 不要 `git stash`（worktree 共享 stash），用 commit。
- 开工先 `rove api set-branch` 起个说人话的分支名；做完 commit（写清楚为什么），再用裸的 `rove api send --prompt "succeeded: … (branch …)"` 汇报。
- 汇报里写：改了哪些文件、玩家能感知到的变化、测试结果、你觉得下一步最值得做的事。
