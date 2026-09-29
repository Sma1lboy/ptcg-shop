# public/gen 的出图记录

UI 皮肤素材（DESIGN.md「皮肤」）。全部由 `gpt-image-2`（`--quality high --background transparent`）按**同一段模板 + 各自的 SUBJECT** 出成整张 sprite sheet，再切成小图：同一张 sheet 里的部件光源、边、螺丝天然一致，这是「像同一个美术出的」的主要保证，模板只管跨 sheet 的一致。

草稿轮用 `--quality low` 出过按钮、边框、页签三张，套到页面上验证了材质方向，再出 high 定稿（草稿没有提交）。

## 切图

`slice.py`（没进仓库，逻辑如下，要重出时照做）：alpha < 120 的外发光清掉、120–220 线性拉到不透明（去掉模型加的软光晕，留干净边），按不透明像素的行/列投影把 sheet 切成块，各自裁到不透明包围盒、缩放，`cwebp -q 84 -alpha_q 90`。九宫格的 slice 数是量出来的（顶行第一个不透明像素 = 倒角宽），写在 style.css 的 `border-image` 里。

## 模板（每条提示词的前半段）

> Game UI asset for an original trading-card-shop game (premium collectible-card-game HUD quality, original design, not from any existing game). Material language: dark navy anodized aluminium like the trim of a glass display case, finely brushed grain running along each edge, crisp 45-degree chamfered bevels, one cool key light from the upper-left giving a thin bright specular line on top-left edges and a soft shade on bottom-right edges, tiny recessed hex screws at corners. Palette strictly limited to card-back navy (#0E1A33 to #2A3F6E), satin aluminium highlights (#AEB8C8 to #E4E9F0) and, only where stated, POP-label lemon yellow (#FFD500). No gold, no warm brass, no chrome mirror, no purple, no glow unless stated. Orthographic straight-on front view, no perspective, no text, no letters, no numbers, no logos, no characters, no watermark. Clean crisp silhouette isolated on a fully transparent background.

## 各张 sheet 的 SUBJECT

### f-buttons（1024x1536）→ btn-primary / btn-secondary / btn-danger (vertical split, ×0.5)

> a sprite sheet of exactly three game buttons stacked vertically with generous transparent space between them, each the same size: a wide horizontal slab about 4:1 with 45-degree chamfered corners, empty flat face for a text label. Button 1: glossy lemon-yellow enamel face (#FFD500) with a thick navy anodized aluminium rim and a slightly darker yellow lower lip showing the button's thickness. Button 2: deep navy lacquer face (#1C2C52) with a satin aluminium rim and the same lower lip. Button 3: dark oxide-red enamel face (#6E1E1E, muted brick, not bright red) with the same navy aluminium rim. Identical rim, bevel, small corner screws and lighting on all three. The enamel faces are evenly lit and flat in the middle so a label reads on them.

### f-tabs（1536x1024）→ tab / tab-on (horizontal split, ×0.4)

> a sprite sheet of exactly two navigation tab plates side by side with transparent space between them, each a wide horizontal plaque about 3:1 with all four corners chamfered at 45 degrees. Tab 1 (idle): recessed dark navy aluminium plate, matte, quiet, thin aluminium bevel. Tab 2 (selected): the same plate raised and lit from above by a warm-white shop lamp (#FFF3E4) so its face is a lighter navy with a soft warm-white sheen along the top bevel and a thin warm-white light line along the bottom edge. Small corner screws on both. Empty faces for a text label.

### f-frame（1024x1024）→ frame (×0.5)

> a square nine-slice panel frame: a hollow rectangular border of navy anodized aluminium about 6% of the width thick, the center completely empty and transparent. The long straight edges must be perfectly uniform along their entire length (same bevel, same grain, no ornaments, no screws in the middle) so they can be stretched. Each of the four corners carries an identical small squared corner bracket plate with a chamfered 45-degree cut and one recessed hex screw, rotated to fit each corner. A thin inner aluminium hairline runs just inside the border.

### f-plates（1024x1536）→ plate / well / divider (vertical split, ×0.5; divider's yellow dot recoloured to aluminium — yellow is only for things to press)

> a sprite sheet of exactly three separate horizontal pieces stacked vertically with generous transparent space between them. Piece 1: a panel name-plate bar about 8:1, raised navy anodized aluminium with brushed grain, 45-degree chamfered ends, a thin bright aluminium bevel along the top edge and a darker bevel along the bottom, face flat and even for a label. Piece 2: a recessed display window about 4:1: an inset near-black navy glass well (#07101F) set into a navy aluminium bezel with a chamfered inner edge, like the digit window of a shop till; the glass is flat and dark with a faint top reflection. Piece 3: a thin ornamental divider rule about 12:1: a fine aluminium line that thickens toward the center into a small chamfered navy-aluminium diamond boss with a tiny lemon-yellow (#FFD500) enamel dot in its middle; the line tapers to nothing at both ends.

### f-icons（1536x1024）→ i-coin i-pack i-shelf / i-customer i-receipt i-card (3×2 grid, each fitted to 64px)

> a sprite sheet of exactly six small game HUD icons in a 3-column by 2-row grid, evenly spaced with generous transparent gaps, each icon the same size and centered in its cell, all in one consistent style: embossed badges made of satin aluminium with navy enamel inlay, chunky readable silhouettes that still read at 20 pixels, thin dark outline. Row 1: (1) a thick shop token coin seen straight on, aluminium rim, navy enamel center embossed with a simple playing-card outline; (2) a sealed trading-card booster pack, crimped top and bottom edges, blank foil front with no artwork; (3) a small shop display shelf rack with two boards holding tiny blank packs. Row 2: (4) a customer: simple head-and-shoulders bust silhouette; (5) a till receipt slip curling slightly with a torn zigzag bottom edge and blank lines; (6) a single trading card inside a rigid clear top-loader sleeve, the card face blank navy.

### f-crest（1536x1024）→ crest (×0.3)

> a single horizontal shop sign crest plate about 3:1, centered with transparent space around it: a navy anodized aluminium plaque with chamfered corners and a raised bevelled aluminium border, two small fanned blank trading cards (navy card backs with a plain aluminium border, no symbols) tucked behind its left end, and a thin lemon-yellow (#FFD500) enamel pinstripe running just inside the border like the yellow frame of a card. The plaque face is flat, dark and empty, reserved for a shop name to be added later. Lit by the warm shop lamp from above.


### f-buttons-dn（1024x1536，编辑模式）→ btn-primary-dn / btn-secondary-dn / btn-danger-dn（vertical split, ×0.5）

按下态。为了和平时的底逐像素对齐，走编辑模式：把三张 `btn-*.webp` 放大 2 倍、竖排在 1024x1536 透明画布上（各自中心在 y = 256 / 768 / 1280）当 `-i` 参照，`--quality high --background transparent`。草稿 low 出过一版：参照图上的黄被压成了芥末黄（读成金卡），定稿提示词里给每个键面写死了颜色。九宫格 slice 量出来上下都是 34（没有下唇），写在 style.css 的 `:active` 里。

> （模板）+ Redraw exactly these three buttons in their PRESSED state, same size, same position, same rim, same screws, same outline as the reference: the enamel key is pushed down into the aluminium rim. The coloured lower lip strip under each button is gone (the key sits flush, no visible thickness). Each enamel face keeps its hue and is only slightly darker and flatter: button 1 stays clean lemon yellow (#EBC400, never mustard or gold), button 2 deep navy lacquer (#172647), button 3 dark oxide red (#5E1915). A thin dark inner shadow runs along the top and left inner edges of each face where the rim now overhangs it; no bright highlight on the face. The aluminium rim is unchanged. Empty flat face for a label. Fully transparent background, no checkerboard.

### i-rank / i-trophy（来自落选皮肤 #1，分支 ui-skin-card-shop-hud）

那一轮的 3×3 图标 sheet（1024²，切成 72²），材质同是铝 + 深蓝珐琅浮雕，和上面 f-icons 放在一起看不出两套，所以直接拿来用，没有重出。提示词：

> a 3 by 3 grid of nine separate small game HUD icons, evenly spaced with generous empty space between them, each icon the same size, same material (brushed steel emboss with navy enamel inlay and a thin dark outline): 1 a stack of coins, 2 a sealed foil trading-card booster pack, 3 a person silhouette bust, 4 a small store shelf rack, 5 a storage crate box, 6 a handshake, 7 a single trading card in a sleeve (blank face), 8 an upward chevron rank badge, 9 a trophy cup. No text.

### u-icons（1536x1152）→ u-signage u-racks u-depth u-case / u-supplier u-expand u-clerk u-luck / u-talk u-crowd u-watch u-apprentice（4×3 grid，每格 384²，按上面的切法裁到不透明包围盒、放进 96² 透明方块，PIL webp q84）

成长树的徽章图标（DESIGN.md「成长」），每个店铺升级 / 技能一枚。模板同上，但把「only where stated, POP-label lemon yellow」换成 **no yellow anywhere, no brown**：草稿 low 自己给四叶草、月亮、箭头上了黄，而黄只给能按的东西。草稿没提交。

> （模板，黄色一句替换如上）Subject: a sprite sheet of exactly twelve small game HUD icons in a 4-column by 3-row grid, evenly spaced with generous transparent gaps, each icon the same size and centered in its cell, all in one consistent style: embossed badges made of satin aluminium with navy enamel inlay, chunky readable silhouettes that still read at 24 pixels, thin dark outline, no background plate behind each icon. Row 1: (1) a hanging shop signboard on two short chains, blank face; (2) a freestanding shop shelf rack with two boards holding tiny blank packs; (3) three thin shelf boards stacked one above another with a small upward arrow chevron beside them; (4) a small glass display case cabinet on legs with two blank cards standing inside. Row 2: (5) a small delivery van seen from the side with a closed navy crate on its roof; (6) a small shopfront with a rolled-up shutter and two outward-pointing arrow chevrons on either side showing it widening; (7) a shop clerk bust wearing an apron; (8) a four-leaf clover. Row 3: (9) a speech bubble with three dots; (10) a group of three overlapping head-and-shoulders bust silhouettes; (11) a round wall clock with a small crescent moon beside it; (12) a hand placing a single blank trading card upright into a small acrylic card stand. Every icon uses only navy enamel and satin aluminium; the clover, clock and moon are aluminium with navy inlay. Fully transparent background around every icon, no dark backdrop, no vignette, no checkerboard.

# 剧情插画（public/gen/story/，src/ui/story.ts）

开场剧情和债主上门用的两张场景、两张立绘（DESIGN.md「剧情」）。全是原创角色，不像真人，不出现宝可梦的角色、卡面和 logo。同一段模板 + 各自的 SUBJECT；两张立绘前面再加一句 PORTRAIT，让两个人的线条和光一致。草稿（`--quality low`，模板相同）验证了画风和构图后出 high 定稿，草稿没提交。转换：场景 `cwebp -q 62 -resize 1280 0`，立绘 `--background transparent` 出 PNG 再 `cwebp -q 72 -alpha_q 80 -resize 0 900`。

## 模板

> Original noir-comedy graphic-novel illustration for a cutscene in an original trading-card-shop game. Bold confident ink brush linework, flat cel shading in two tones, fine halftone dots in the shadows. Palette strictly limited to card-back navy blues (#0E1A33 to #2A3F6E), warm shop-lamp white (#FFF3E4), desaturated paper grey, and one muted oxide-red accent (#6E1E1E); no purple, no neon, no gold. Single warm lamp key light from the upper-left, deep navy shadows. Slightly exaggerated comedic proportions, expressive, stylized adults, clearly drawn not photorealistic, not resembling any real person. No text, no letters, no numbers, no logos, no signage lettering, no Pokémon or any existing franchise characters or card art, no watermark.

PORTRAIT：

> Both character portraits in this game share one style: thick uniform black ink outlines, flat two-tone cel shading, halftone dots in the shadows, same line weight and same lighting from the upper-left.

## SUBJECT


### p-icons（1536x1024，high）→ p-seed p-fit p-regulars / p-access p-hire p-luck（3×2 grid，切法同上：按不透明投影切块、裁包围盒、放进 96² 透明方块，cwebp q84）

名气加成的徽章（DESIGN.md「成长」开分店），六项各一枚。模板同 u-icons（「no yellow anywhere, no brown」那版）。high 那张的四叶草画成了六瓣，p-luck 用的是同一提示词 low 草稿里切出来的（四瓣）；其余五枚是 high。

> （模板，黄色一句替换如 u-icons）Subject: a sprite sheet of exactly six small game HUD icons in a 3-column by 2-row grid, evenly spaced with generous transparent gaps, each icon the same size and centered in its cell, all in one consistent style: embossed badges made of satin aluminium with navy enamel inlay, chunky readable silhouettes that still read at 24 pixels, thin dark outline, no background plate behind each icon. Row 1: (1) a small closed cash tin strongbox with a coin slot in its lid and a little latch; (2) a two-wheeled hand truck dolly carrying a small folded shop shelf rack strapped to it; (3) a punched loyalty stamp card, a rectangle with a row of round punched holes along it and one blank circle, no writing. Row 2: (4) an old-fashioned key on a ring with a small blank luggage tag tied to it; (5) a shop apron hanging from a single wall hook; (6) a four-leaf clover standing on a small raised stepped plinth base. Every icon uses only navy enamel and satin aluminium; the clover is aluminium with navy inlay. Fully transparent background around every icon, no dark backdrop, no vignette, no checkerboard.

### street.webp（landscape 1536x1024，high）

> rainy night, a narrow old East Asian city side street: small shop fronts with blank unlettered signboards, air-conditioner units and tangled overhead wires, one small card shop with its rolling steel shutter pulled half down and a dim light inside, a dark unmarked van parked at the curb with headlights on and its side door slid open, puddles reflecting one streetlamp, wet asphalt, no people, wide establishing shot, the middle of the frame calm and uncluttered.

### shop.webp（landscape，high）

> interior of a small bankrupt trading-card shop at night, seen from behind the counter at eye level: empty metal shelves on the back wall, a dusty glass display case with navy aluminium trim, a counter with a worn rubber play mat, a few plain sealed booster packs in blank silver foil with no artwork, cardboard boxes, one hanging lamp over the counter casting a warm cone with dust floating in it, cobwebs, no people, the center of the frame left open for characters to stand in.

### jiu.webp 九姐（portrait 1024x1536，high，透明底，站右边）

> Half-body character portrait of Jiu-jie, an original loan-shark boss woman in her late forties, stern and dry rather than glamorous: sharp black bob haircut with one grey streak, faint crow's feet, minimal makeup, oversized navy double-breasted coat draped over her shoulders, dark turtleneck, holding a small old desk calculator in one hand, thin unimpressed half-smile, half-lidded eyes, three-quarter view turned toward the left of the frame, cut at the waist, isolated on a fully transparent background.

### adou.webp 阿豆（portrait，high，透明底，站左边）

> Half-body character portrait of A-Dou, an original loan-shark henchman in his twenties: very large and burly, buzz cut, small round sunglasses pushed up on his forehead, tight navy tracksuit, an empty burlap sack slung over one shoulder, a clear rigid card sleeve with a blank card peeking out of his chest pocket, a gentle worried expression that contradicts his size, three-quarter view turned toward the right of the frame, cut at the waist, isolated on a fully transparent background.
