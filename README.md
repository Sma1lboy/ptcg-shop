# PTCG卡店模拟器

宝可梦卡牌开包模拟器 + 卡店放置经营 + 欧气检测器：开包、卖卡，经营自己的卡店。非官方的玩家自制游戏，与 Nintendo、The Pokémon Company、Game Freak 无关。在线玩：https://pcards.sma1lboy.me （push 到 main 后由 `.github/workflows/pages.yml` 自动发布到 GitHub Pages）。

```sh
npm ci
node scripts/fetch-images.mjs   # 卡图镜像到 assets/tcg/（约 90 MB，只需一次）
npm run dev                     # http://localhost:5173
```

`npm run build` 生成 `dist/index.html`：一个文件装下全部代码和数据，双击就能玩（卡图走 TCGdex CDN）；`npm run preview` 用本地卡图打开它。`npm test` 跑公平性和经济测试。

开包台是 three.js 的 3D 场景（`src/table3d.js`；开发时用 node_modules 里的 three，构建出的页面从 jsdelivr 按同一固定版本加载）：卡店柜台上的胶垫，闲置时每个系列一叠仓库里的包（「今天拆哪包？」，点哪包开哪包，包从那叠上拿起来进手里），撕封口、抽卡、闪卡材质、按稀有度分级的出货演出。开 10 包时十包一起摆上胶垫，一次撕开，只有好卡按价格从低到高飞到前面的扇形里逐张翻，最贵的那张最后翻；翻完点卡能拿起来细看。画面静止时不渲染。没有 WebGL、系统开了「减少动态效果」、或 CDN 加载失败时，自动退回 2D 开包台。

- 开包概率：TCGplayer 实开统计（每个系列 1,200–8,500 包），模拟结果由 `npm test` 校验落在其 95% 置信区间内。
- 单卡价格：TCGplayer 市价，经 TCGdex API 抓取（`node scripts/fetch-data.mjs`）。
- 整包价格：PriceCharting 散包价（`node scripts/fetch-packs.mjs` 刷新到 `data/packs.json`）。
- 欧气检测：拿你开出的总市值，和 4,000 个开了同样这些包（同系列、同包数、同概率）的模拟玩家比，给出百分位；模拟玩家按卡表逐个槽位直接抽，不从固定样本池重抽，开 50 包和开 9 万包都没有系统偏差，只有 ±1.5 个百分点以内的抽样误差。
- 口径：欧气检测按当前单卡市价重算你开出的每张卡，再和模拟玩家比；期望市值只有整包标价的四成多，原因和没建模的神包见页脚「价格口径」。

单文件版：`npm run pen` 生成 `dist/pen.html`（CSS/JS/数据全部内联，three.js 从 jsdelivr 加载；可直接粘进 CodePen 的 HTML 面板）。
