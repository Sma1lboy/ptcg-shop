# 欧气卡铺

宝可梦卡牌开包模拟器 + 卡店放置经营 + 欧气检测器。

打开 `index.html` 即可（需要联网加载卡图）。

- 开包概率：TCGplayer 实开统计（每个系列 1,200–8,000 包），模拟结果由 `node test/sim.test.mjs` 校验落在其 95% 置信区间内。
- 单卡价格：TCGplayer 市价，经 TCGdex API 抓取（`node scripts/fetch-data.mjs`）。
- 整包价格：PriceCharting。
- 欧气检测：拿你开出的总市值，和开了同样包数的 400 个模拟玩家比，给出百分位。
