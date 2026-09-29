# ptcg-shop（欧气卡铺）

宝可梦卡牌（PTCG）开包模拟 + 卡店经营放置游戏 + 欧气检测。纯前端，双击 `index.html` 就能玩。

## 规矩（每个 worker 必读）

- **原生 HTML/CSS/JS，没有构建步骤。** 不要引入 npm 包、框架、打包器、TypeScript、i18n 层。本地脚本用经典 `<script src>` + `window.PTCG_*` 全局，因为本地文件的 `type="module"` 在 `file://` 下会被 Chrome 拦。
- **唯一的外部库：three.js，只用于开包台的 3D 场景。** 从 CDN 按固定版本加载（例如 `<script type="importmap">` + jsdelivr/unpkg 的 `three.module.js` 和 `examples/jsm` 附加模块；https CDN 上的 module 在 `file://` 下能用，本地 module 不行）。别的库一律不加。WebGL 不可用或 `prefers-reduced-motion` 时要退回 2D 开包台。
- **界面只有中文**，不做多语言（全局 i18n 规则不适用于本项目）。
- **数据要公正，这是产品的底线：**
  - `data/cards-*.js` 由 `node scripts/fetch-data.mjs` 生成，**不许手改**。要刷新价格就删 `data/raw/` 重跑。
  - `src/sets.js` 里的 `rates` 是 TCGplayer 实开统计的百分比，**不许为了手感改概率**。改动必须附来源链接（写在 `rateSource` 或注释里）。
  - 游戏设定（进货折扣、收卡价、客流、升级数值等）可以自由设计，但要在 `src/game.js` 里标明是游戏设定，并在页脚「游戏设定」里向玩家说明。
- **改完必须跑** `node test/sim.test.mjs`（20 万包/系列，每个稀有度都要落在 TCGplayer 95% 置信区间内）。改了模拟逻辑就在这个文件里加断言，不要另起测试框架。
- 视觉：颜色全部走 `style.css` 顶部的 token，浅色/深色两套都要对；强调色只有价格贴纸橙，稀有度用银/金（对应卡面上的银星/金星），盈亏用 gain/loss 语义色。别往 AI 默认审美上靠（紫蓝渐变、emoji 当图标、全部居中、每块都加圆角阴影）。
- **卡图和 Logo 从本地服务器出，不要直连 TCGdex**（用户要求：别把 API 打爆）。`node scripts/fetch-images.mjs` 把全部卡图（low/high webp）和 logo 镜像到 `assets/tcg/`（约 90 MB，gitignored；新 worktree 由 `.rove/init.sh` 软链到主仓库的镜像）。代码里一律用 `PTCG_ASSETS.card(set, n, size)` / `PTCG_ASSETS.logo(set)`（`src/assets.js`），不要自己拼 URL。只有 `file://` 打开和 CodePen 版（`PTCG_REMOTE_ASSETS`）会退回 CDN；CDN 地址不许带 query string。本地同源的图做 canvas / WebGL 贴图没有 CORS 问题，所以要看 3D/分享效果请用 http 打开（`python3 -m http.server 8765`）。

## 文件分工（并行 worker 按这个认领，动别人的文件要在报告里说明）

| 文件 | 管什么 |
|---|---|
| `src/sets.js` | 系列配置：实测概率、置信区间、整包市价、来源链接 |
| `src/sim.js` | 纯函数：开包、期望值、欧气百分位。浏览器和 node 通用 |
| `src/game.js` | 存档、经济、店铺动作（进货/开包/卖卡/客流）。不碰 DOM |
| `src/ui.js` | 渲染和交互，只读 state、只调 `PTCG_GAME` 的方法 |
| `src/fx.js` | 开包台的音效（WebAudio 合成）、稀有卡爆闪、卡面倾斜。纯演出，不读游戏状态 |
| `style.css` | 全部样式与 token |
| `index.html` | 外壳和脚本加载顺序 |
| `src/assets.js` | 卡图/logo 的地址：本地镜像或 CDN 回退 |
| `scripts/` | 数据抓取（fetch-data）、卡图镜像（fetch-images）、打包单文件 pen（pack-pen）、自动玩家（autoplay） |
| `test/sim.test.mjs` | 唯一的测试 |

## 在 Rove 里干活

- 不要 `git stash`（worktree 共享 stash），用 commit。
- 开工先 `rove api set-branch` 起个说人话的分支名；做完 commit（写清楚为什么），再用裸的 `rove api send --prompt "succeeded: … (branch …)"` 汇报。
- 汇报里写：改了哪些文件、玩家能感知到的变化、测试结果、你觉得下一步最值得做的事。
