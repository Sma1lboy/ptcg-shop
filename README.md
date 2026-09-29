# 欧气卡铺

宝可梦卡牌开包模拟器 + 卡店放置经营 + 欧气检测器。

先 `node scripts/fetch-images.mjs` 把卡图镜像到本地（约 90 MB，只需一次），再 `python3 -m http.server 8765` 后打开 http://127.0.0.1:8765 。直接双击 `index.html` 也能玩，但卡图会走 TCGdex CDN。

- 开包概率：TCGplayer 实开统计（每个系列 1,200–8,000 包），模拟结果由 `node test/sim.test.mjs` 校验落在其 95% 置信区间内。
- 单卡价格：TCGplayer 市价，经 TCGdex API 抓取（`node scripts/fetch-data.mjs`）。
- 整包价格：PriceCharting。
- 欧气检测：拿你开出的总市值，和开了同样包数的 400 个模拟玩家比，给出百分位。
- 口径：欧气检测按当前单卡市价重算你开出的每张卡，再和模拟玩家比；期望市值只有整包标价的四成多，原因和没建模的神包见页脚「价格口径」。

单文件版：`node scripts/pack-pen.mjs` 生成 `dist/pen.html`（CSS/JS/数据全部内联，可直接粘进 CodePen 的 HTML 面板）。
