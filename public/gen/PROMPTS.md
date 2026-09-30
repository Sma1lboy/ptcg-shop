# public/gen 的出图记录

## BW 像素图标（i-* u-* p-*，界面在用）

顶栏读数、页签、现金框、成长页等级、成长树和名气加成的徽章（DESIGN.md「图标」）。三张 sheet，同一段模板，`gpt-image-2 --quality high`，纯品红 #FF00FF 底（色键抠图，模型出的透明底边缘带软光晕，像素图不能要）。草稿 low 出过 i 那张验证了像素画和切法：草稿的卡背徽记画成了上下两半加中间一个圆（像精灵球），顾客戴的是红白鸭舌帽蓝外套（像官方主角），定稿提示词改成四角星和毛线帽，模板加了 no ball-shaped emblems。草稿没提交。

**切法**（`cut.py`，没进仓库，要重出时照做）：品红键（R>170、B>170、G<110）抠掉背景；按网格切格子、各自裁到前景包围盒；从颜色边缘的位置反推模型画的像素格距（在 6–24 px 之间找让边缘最贴整数倍的那个），但格距至少取「包围盒长边 ÷ 24」，保证不超过 24×24；每一格取中间 40% 的前景像素的中位色，前景不到一半的格子透明；居中放进 24×24 透明画布，存无损 webp（每个几百字节）。u-watch 的月亮被画成了黄色，切完把黄像素换成浅灰 / 中灰（黄只给能按的东西）。页面上一律按 24 或 48 px、`image-rendering: pixelated` 显示。

> Original pixel-art game menu icons in the style of a 2010 handheld monster-collecting RPG menu (original designs, not copied from any existing game, no logos, no text, no letters, no ball-shaped emblems). A sprite sheet of exactly N icons in a GRID grid, evenly spaced with wide gaps, each icon centered in its own cell and the same size. Every icon is true pixel art drawn on a 24 by 24 pixel grid and scaled up with hard nearest-neighbour edges: every pixel is a crisp solid square, no anti-aliasing, no gradients, no blur, no dithering noise. Style: chunky readable silhouette that still reads at 24 pixels, a 1-pixel dark charcoal outline (#262B33) all around, flat cel shading with one lighter highlight tone on the upper-left and one darker shade tone on the lower-right, light from the upper-left. Palette limited to about 12 colours shared by all icons: charcoal #262B33, white #FFFFFF, light grey #C8CED8, mid grey #8C97A8, sky blue #52B6F2, deep blue #2A74D0, leaf green #3EC06E, coral red #E8483A, and their one-step darker shades. No yellow, no gold, no brown. Background: completely flat pure magenta #FF00FF filling the whole sheet, no shadows on the background.

### sheet-i（landscape，N = eight，4-column by 2-row）→ i-coin i-pack i-shelf i-customer / i-receipt i-card i-rank i-trophy

> Subjects: Row 1: (1) a silver shop token coin seen straight on with a small rectangular card shape stamped in the middle; (2) a sealed trading-card booster pack with crimped top and bottom edges, plain blue foil front with no artwork; (3) a small shop shelf rack with two boards holding tiny coloured packs; (4) a customer: head-and-shoulders bust of a friendly person in a green knit beanie and a grey scarf. Row 2: (5) a paper receipt slip with a zig-zag torn bottom edge and a few grey lines; (6) a single trading card seen face-on, deep blue back with a white border and a simple white four-point star in the middle; (7) an upward double chevron rank badge in green; (8) a silver trophy cup on a small blue base.

### sheet-u（1536x1152，N = twelve，4-column by 3-row）→ u-signage u-racks u-depth u-case / u-supplier u-expand u-clerk u-luck / u-talk u-crowd u-watch u-apprentice

> Subjects: Row 1: (1) a hanging shop signboard on two short chains, blank blue face; (2) a freestanding shop shelf rack with two boards holding tiny packs; (3) three thin shelf boards stacked one above another with a small green upward arrow beside them; (4) a small glass display case cabinet on legs with two blank cards standing inside. Row 2: (5) a small delivery van seen from the side with a closed crate on its roof; (6) a small shopfront with a rolled-up shutter and two outward-pointing arrows on either side showing it widening; (7) a shop clerk bust wearing a blue apron; (8) a green four-leaf clover. Row 3: (9) a white speech bubble with three dots; (10) a group of three overlapping head-and-shoulders bust silhouettes in different colours; (11) a round wall clock with a small crescent moon beside it; (12) a hand placing a single blank trading card upright into a small clear card stand.

### sheet-p（landscape，N = six，3-column by 2-row）→ p-seed p-fit p-regulars / p-access p-hire p-luck

> Subjects: Row 1: (1) a small closed grey cash tin strongbox with a coin slot in its lid and a little latch; (2) a two-wheeled hand truck dolly carrying a small folded shop shelf rack strapped to it; (3) a punched loyalty stamp card, a white rectangle with a row of round punched holes along it and one blank circle, no writing. Row 2: (4) an old-fashioned silver key on a ring with a small blank luggage tag tied to it; (5) a blue shop apron hanging from a single wall hook; (6) a green four-leaf clover with exactly four leaves standing on a small stepped grey plinth.

# 剧情和角色（public/gen/story/，src/ui/story.ts）

BW 风格的像素画：三张训练家式半身立绘（阿豆、九姐、店主）和两张场景（雨夜的街、倒闭的卡店）。全是原创角色和地方，不像任何官方角色，不画球形物体和宝可梦。同一段模板 + 立绘 / 场景各一句 + 各自的 SUBJECT，`gpt-image-2`，立绘 `--size portrait`、纯品红 #FF00FF 底，场景 `--size landscape`。草稿 `--quality low` 五张都出过一轮，画风、构图、调色板一次就对，没改提示词就出 high 定稿；草稿没提交。

**还原成真像素**（`cut2.py`，没进仓库，要重出时照做；和图标的 `cut.py` 同一个取样法）：立绘先按品红键抠掉背景，从颜色边缘反推模型画的像素格距（4–24 px 之间最贴整数倍的那个，三张都在 8.6–9 左右），每格取中间 40% 的前景中位色，得到约 110×170 的真像素图；场景按 256 格宽强制取样（模型画场景时格距不够稳，反推不出来），得到 256×171。都存无损 webp（立绘约 17–20 KB，场景约 50–65 KB），页面上 `image-rendering: pixelated` 放大。

**减色**（发布前评审：取样后的图每张还有 4–19k 种颜色，读起来是「现代高清像素画」，不像掌机的有限调色板）：Pillow `quantize(FASTOCTREE, dither=NONE)`，场景 48 色、立绘 32 色，半透明像素按 128 阈值归到全透或全实，存无损 webp（场景 11–15 KB，立绘 3–4 KB）。八叉树留得住口红、手帕、路灯这些小面积的点缀色（中位切分会把它们吃掉）。要重出时取样完照做。

## 模板

> Original pixel-art game art in the style of 2010 handheld monster-collecting RPGs (Nintendo DS era): original character and places, not copied from any existing game, not resembling any official character, no logos, no text, no letters, no numbers, no ball-shaped objects, no creatures. True pixel art: every pixel a crisp solid square scaled up with hard nearest-neighbour edges, no anti-aliasing, no gradients, no blur, no painterly texture. Light from the upper-left. Shared palette for every image in this game: charcoal #262B33 for outlines, off-white #F4F6F9, cool greys #C8CED8 #8C97A8 #59606D, sky blue #52B6F2, deep blue #2A74D0, navy #1D3F86, leaf green #3EC06E, coral red #E8483A, dark red #9A2A20, warm skin tones #F2C9A0 #D9A27A, dark hair #3A3030; no purple, no neon, no gold.

立绘加：

> A trainer battle sprite style half-body portrait (cut at the waist) on a 96 by 128 pixel grid: bold 1-pixel charcoal outline around the whole figure, flat cel shading with exactly two tones per material, big readable shapes, slightly chibi-leaning anime proportions like handheld RPG trainer sprites, expressive face. The figure fills the frame height. Background: completely flat pure magenta #FF00FF, nothing else behind the figure.

场景加：

> A full-screen background scene on a 256 by 160 pixel grid, like a handheld RPG town or indoor map shown from a low three-quarter angle, clean pixel clusters, no characters, the middle of the frame calm and uncluttered for people to stand in.

## SUBJECT

### jiu.webp 九姐（站右边）

> Jiu-jie, an original loan-shark boss woman in her late forties, stern and dry: sharp black bob with one grey streak, navy double-breasted coat draped over her shoulders, dark turtleneck, small red earrings, holding a small old desk calculator in one hand, thin unimpressed half-smile, half-lidded eyes, three-quarter view facing the left of the frame.

### adou.webp 阿豆（站左边）

> A-Dou, an original loan-shark henchman in his twenties: very large and burly, buzz cut, small round sunglasses pushed up on his forehead, tight navy tracksuit with white side stripes, an empty burlap sack over one shoulder, a clear card sleeve with a blank card peeking from his chest pocket, a gentle worried expression that contradicts his size, three-quarter view facing the right of the frame.

### owner.webp 店主（玩家）

> the shopkeeper, an original young adult card-shop owner in their early twenties, friendly and a bit tired, messy short brown hair, a green shop apron with a pocket over a white t-shirt, a pencil behind one ear, holding one sealed blank booster pack, three-quarter view facing the right of the frame.

### street.webp

> a rainy night street in an old East Asian city block: small shop fronts with blank unlettered signboards, air-conditioner units and overhead wires, one small card shop with its rolling steel shutter half down and a dim light inside, a dark unmarked van parked at the curb with its headlights on, puddles reflecting one streetlamp, rain streaks drawn as short pixel lines, deep navy night palette.

### shop.webp

> the inside of a small bankrupt trading-card shop at night seen from behind the counter: empty metal shelves on the back wall, a dusty glass display case, a counter with a worn play mat, a few plain sealed booster packs in blank silver foil, cardboard boxes, one hanging lamp casting a warm cone of light, cobwebs, dim navy shadows.

# 店里走动的像素小人（public/gen/walk/，src/ui/walk.ts）

八个人各一条 4 帧横条（站、迈步、站、另一步，朝右；页面上朝左时镜像）：店主、店员、九姐、阿豆和四类顾客（拆包玩家、找卡的、收藏党、倒爷）。两张 sheet，每张 4 行 × 3 帧，`gpt-image-2 --size 1024x1024`，纯品红底。长相和剧情立绘、像素图标对上：店主绿围裙、店员蓝围裙（同 u-clerk）、拆包玩家绿毛线帽灰围巾（同 i-customer）。草稿 `--quality low` 两张都出过，人物对，但像素边缘软、格距找不准；定稿 high 的像素硬。草稿没提交。

**切法**（`cut3.py`，没进仓库）：按品红间隙找人（先找行带、再在每行里找三帧），不按固定格子切——高个子会越过四分之一线；整张用同一个格距 6 px（模型按 32 格画，一个人约 190 px 高；边缘自动反推会落到半格 4.5，所以写死）；每行三帧共用一个高度框，脚和头对齐，每帧按自己的框居中；每格取中间一半的前景中位色，漏过色键的品红边色丢掉；拼成 站-迈-站-迈 四帧，无损 webp（2.4–7.6 KB）。帧尺寸写在 `walk.ts` 的 `SPRITE` 表里。

## 模板

> Original pixel-art overworld character sprites in the style of 2010 handheld monster-collecting RPG town maps (Nintendo DS era): original characters, not copied from any existing game, not resembling any official character, no logos, no text, no ball-shaped objects, no creatures. True pixel art: every pixel a crisp solid square scaled up with hard nearest-neighbour edges, no anti-aliasing, no gradients, no blur. A sprite sheet with exactly 4 rows and 3 columns on a flat pure magenta #FF00FF background, wide magenta gaps between cells, nothing else on the sheet. Each row is one character; the three cells of a row are that same character walking to the RIGHT, seen from the side (profile facing right): column 1 standing, column 2 mid-step with the front leg forward, column 3 mid-step with the other leg forward. Every sprite is drawn on a 32 by 32 pixel grid in chibi proportions (big head about 40% of the height), a 1-pixel charcoal #262B33 outline, flat cel shading with two tones per material, light from the upper-left, feet on the same baseline in every cell. Shared palette: charcoal #262B33, off-white #F4F6F9, greys #C8CED8 #8C97A8 #59606D, sky blue #52B6F2, deep blue #2A74D0, navy #1D3F86, leaf green #3EC06E, coral red #E8483A, dark red #9A2A20, skin #F2C9A0 #D9A27A, dark hair #3A3030, brown hair #7A5238; no purple, no gold.

### sheet-a → w-owner w-clerk w-jiu w-adou

> Rows: Row 1: the shopkeeper, a young adult with messy short brown hair, a green shop apron over a white t-shirt, dark trousers. Row 2: a shop clerk, a young adult with short black hair, a blue apron over a white shirt, grey trousers. Row 3: Jiu-jie, a stern woman in her late forties, sharp black bob with one grey streak, a long navy coat over a dark turtleneck, dark trousers, small red earrings. Row 4: A-Dou, a very large burly young man, buzz cut, small round sunglasses pushed up on his forehead, a navy tracksuit with white side stripes, a burlap sack over one shoulder.

### sheet-b → w-opener w-seeker w-collector w-flipper

> Rows: Row 1: a pack-opening player, a teenager in a green knit beanie and a grey scarf, a dark grey jacket, jeans. Row 2: a card seeker, a young woman with round glasses, a red hoodie and a small blue backpack, holding a card list. Row 3: a collector, an older man with grey hair, a grey knitted vest over a white shirt, holding a thick blue binder under one arm. Row 4: a reseller, a man in a dark grey bucket hat and a black windbreaker carrying a big bulging navy duffel bag.
