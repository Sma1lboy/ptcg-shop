#!/usr/bin/env python3
"""Cut the generated badge sprite sheets into public/gen/badges/<achievement id>.webp (dev-only, never run by the game or the build).

    uv run --with pillow scripts/slice-badges.py <dir with s1.png … s4.png, fix1.png> [--out public/gen/badges] [--contact contact.png]
    uv run --with pillow scripts/slice-badges.py --one <achievement id> <file.png>   # one badge drawn on its own (1×1 sheet)

Each sheet is round enamel discs on flat magenta #FF00FF (the model's transparent backgrounds come with a soft halo, so: colour key).
Cells are found as connected blobs, not a fixed grid (the model drifts), sorted row-major and checked against the manifest below.
Each disc is cut to a perfect circle a hair inside its edge (no magenta fringe), scaled to 256 px, saved as a small lossy webp with alpha.
The prompts are in public/gen/PROMPTS.md (「成就徽章」); raw sheets are not committed. Order of ids = order of the cells in the prompt.
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

SIZE = 256
SHEETS = {  # file → (columns, rows, ids row-major) — the order of src/achievements.ts, 12 + 12 + 12 + 9, then later additions
    's1.png': (4, 3, ['open-1', 'hit-1', 'ten-1', 'double', 'gold-1', 'sir-1', 'hr-1', 'packs-100', 'packs-1000', 'mhr-1', 'euro', 'emperor']),
    's2.png': (4, 3, ['unlucky', 'dry-30', 'ten-gold', 'pack-100', 'dex-25', 'dex-50', 'master-1', 'master-3', 'master-all', 'hand-1', 'hand-all', 'trophy']),
    's3.png': (4, 3, ['case-full', None, 'sale-1', 'shelves-full', 'day-100', 'day-1000', 'rev-1k', 'rev-10k', 'rev-100k', None, 'clerk', 'offline-1k']),  # big-card, collector: card backs came out looking like a ball emblem
    's4.png': (3, 3, ['all-sets', 'level-20', 'level-max', 'flipped', 'ten-blank', 'pikachu', 'charizard', 'moon', 'night']),
    'fix1.png': (2, 1, ['big-card', 'collector']),
    's5.png': (2, 2, ['rev-25k', 'rev-50k', 'served-500', 'served-2k']),
}


def foreground(im):
    """255 where the pixel is not the magenta key."""
    r, g, b = im.convert('RGB').split()
    key = ImageChops.multiply(ImageChops.multiply(r.point(lambda v: 255 if v > 150 else 0), b.point(lambda v: 255 if v > 150 else 0)), g.point(lambda v: 255 if v < 120 else 0))
    return ImageChops.invert(key)


def blobs(fg, n):
    """The n biggest connected foreground blobs, as full-resolution (x0, y0, x1, y1), found on a 1/4 size copy."""
    k = 4
    small = fg.resize((fg.width // k, fg.height // k), Image.NEAREST)
    w, h = small.size
    px = small.load()
    seen = [[False] * w for _ in range(h)]
    found = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] < 128 or seen[y0][x0]:
                continue
            q = deque([(x0, y0)]); seen[y0][x0] = True
            area, bx0, by0, bx1, by1 = 0, x0, y0, x0, y0
            while q:
                x, y = q.popleft(); area += 1
                bx0, by0, bx1, by1 = min(bx0, x), min(by0, y), max(bx1, x), max(by1, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] >= 128:
                        seen[ny][nx] = True; q.append((nx, ny))
            found.append((area, (bx0 * k, by0 * k, (bx1 + 1) * k, (by1 + 1) * k)))
    found.sort(reverse=True)
    return [b for _, b in found[:n]]


def grid_order(boxes, cols):
    by_y = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    return [b for i in range(0, len(by_y), cols) for b in sorted(by_y[i:i + cols], key=lambda b: b[0])]


def disc(im, fg, box):
    """One badge: the disc inside box (tightened on the full-resolution mask), cut to a circle and scaled to SIZE."""
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = max(0, x0 - 6), max(0, y0 - 6), min(im.width, x1 + 6), min(im.height, y1 + 6)
    tight = fg.crop((x0, y0, x1, y1)).point(lambda v: 255 if v > 128 else 0).getbbox()
    bx0, by0, bx1, by1 = x0 + tight[0], y0 + tight[1], x0 + tight[2], y0 + tight[3]
    w, h = bx1 - bx0, by1 - by0
    if not 0.9 < w / h < 1.1:
        print(f'  warning: blob {w}x{h} is not round', file=sys.stderr)
    cx, cy, d = (bx0 + bx1) / 2, (by0 + by1) / 2, min(w, h)
    side = round(d)
    rgb = im.convert('RGB').crop((round(cx - side / 2), round(cy - side / 2), round(cx - side / 2) + side, round(cy - side / 2) + side)).resize((SIZE, SIZE), Image.LANCZOS)
    big = SIZE * 4
    m = Image.new('L', (big, big), 0)
    inset = big * 0.012  # a hair inside the disc's own outline: the key's soft edge never shows
    ImageDraw.Draw(m).ellipse((inset, inset, big - inset, big - inset), fill=255)
    out = rgb.convert('RGBA')
    out.putalpha(m.resize((SIZE, SIZE), Image.LANCZOS))
    return out


def cut(path, cols, rows, ids):
    im = Image.open(path)
    fg = foreground(im)
    boxes = blobs(fg, cols * rows)
    if len(boxes) != len(ids):
        sys.exit(f'{path}: found {len(boxes)} blobs, expected {len(ids)}')
    return [(i, disc(im, fg, b)) for i, b in zip(ids, grid_order(boxes, cols)) if i]  # None: a cell that was redrawn in a later sheet


def main(argv):
    out = Path('public/gen/badges')
    contact = None
    if '--out' in argv: out = Path(argv[argv.index('--out') + 1])
    if '--contact' in argv: contact = Path(argv[argv.index('--contact') + 1])
    out.mkdir(parents=True, exist_ok=True)
    if '--one' in argv:
        i = argv.index('--one'); work = cut(argv[i + 2], 1, 1, [argv[i + 1]])
    else:
        src = Path(argv[0])
        work = [x for f, (c, r, ids) in SHEETS.items() if (src / f).exists() for x in cut(src / f, c, r, ids)]
    for id_, im in work:
        im.save(out / f'{id_}.webp', 'WEBP', quality=90, method=6, alpha_quality=100)
        print(f'{id_}.webp {(out / f"{id_}.webp").stat().st_size} B')
    if contact:
        n = len(work); cols = 8; rows = (n + cols - 1) // cols
        sheet = Image.new('RGB', (cols * 160, rows * 160), (200, 206, 216))
        for k, (id_, im) in enumerate(work):
            t = im.resize((150, 150), Image.LANCZOS)
            sheet.paste(t, ((k % cols) * 160 + 5, (k // cols) * 160 + 5), t)
        sheet.save(contact)


if __name__ == '__main__':
    main(sys.argv[1:])
