# 欧气卡铺

宝可梦卡牌开包模拟器 + 卡店放置经营 + 欧气检测器。

```sh
npm ci
node scripts/fetch-images.mjs   # 卡图镜像到 assets/tcg/（约 90 MB，只需一次）
npm run dev                     # http://localhost:5173
```

`npm run build` 生成 `dist/index.html`：一个文件装下全部代码和数据，双击就能玩（卡图走 TCGdex CDN）；`npm run preview` 用本地卡图打开它。`npm test` 跑公平性和经济测试。

- 开包概率：TCGplayer 实开统计（每个系列 1,200–8,000 包），模拟结果由 `npm test` 校验落在其 95% 置信区间内。
- 单卡价格：TCGplayer 市价，经 TCGdex API 抓取（`node scripts/fetch-data.mjs`）。
- 整包价格：PriceCharting。
- 欧气检测：拿你开出的总市值，和开了同样包数的 400 个模拟玩家比，给出百分位。
- 口径：欧气检测按当前单卡市价重算你开出的每张卡，再和模拟玩家比；期望市值只有整包标价的四成多，原因和没建模的神包见页脚「价格口径」。

单文件版：`npm run pen` 生成 `dist/pen.html`（CSS/JS/数据全部内联，three.js 从 jsdelivr 加载；可直接粘进 CodePen 的 HTML 面板）。
