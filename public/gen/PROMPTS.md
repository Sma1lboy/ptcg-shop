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

