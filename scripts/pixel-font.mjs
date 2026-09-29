// The BW pixel face (DESIGN.md「字」): Fusion Pixel 12px Proportional SC (OFL-1.1, TakWolf), cut down to the glyphs this game
// prints and renamed (the OFL reserves the name "Fusion Pixel" for unmodified copies). Writes public/font/pixel.woff2 and the
// list of glyphs it holds.
//   node scripts/pixel-font.mjs           re-cut the font after adding text (needs `uv`: runs fonttools, nothing lands in package.json)
//   node scripts/pixel-font.mjs --check   exit 1 if the source prints a glyph the font lacks (it would fall back to the system face)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = 'https://cdn.jsdelivr.net/npm/@fontsource/fusion-pixel-12px-proportional-sc@5.3.0/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2';
const root = new URL('../', import.meta.url);
const out = new URL('public/font/', root);
const walk = dir => readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(ts|js|html)$/.test(e.name) ? [`${dir}${e.name}`] : []);
const text = ['index.html', ...walk('src/')].map(f => readFileSync(new URL(f, root), 'utf8')).join('');
// every printable ASCII glyph plus every non-ASCII character in the source (strings and comments alike: cheap, and never misses one)
const want = new Set([...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ...[...text].filter(c => c.codePointAt(0) > 0x7f && !/\s/.test(c))]);
const listFile = new URL('pixel-glyphs.txt', out);

if (process.argv.includes('--check')) {
  const have = new Set(existsSync(listFile) ? [...readFileSync(listFile, 'utf8').trim()] : []);
  const missing = [...want].filter(c => !have.has(c) && c.codePointAt(0) > 0x2e7f);
  console.log(missing.length ? `pixel font lacks ${missing.length} glyphs: ${missing.join('')} — run node scripts/pixel-font.mjs` : `pixel font covers all ${want.size} glyphs`);
  process.exit(missing.length ? 1 : 0);
}

mkdirSync(out, { recursive: true });
const tmp = new URL('.pixel-full.woff2', out);
writeFileSync(tmp, Buffer.from(await (await fetch(SRC)).arrayBuffer()));
const py = `
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
src, dst, chars = sys.argv[1], sys.argv[2], sys.argv[3]
f = TTFont(src)
opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = ['*']
s = subset.Subsetter(opt); s.populate(text=chars); s.subset(f)
cmap = f.getBestCmap()
for rec in f['name'].names:
    if rec.nameID in (1, 3, 4, 6, 16):
        rec.string = {1: 'Ouqi Pixel', 3: 'Ouqi Pixel', 4: 'Ouqi Pixel', 6: 'OuqiPixel', 16: 'Ouqi Pixel'}[rec.nameID]
f.flavor = 'woff2'; f.save(dst)
print(''.join(sorted(c for c in chars if ord(c) in cmap)))
`;
const have = execFileSync('uv', ['run', '--no-project', '--with', 'fonttools[woff]', 'python', '-c', py, tmp.pathname, new URL('pixel.woff2', out).pathname, [...want].join('')], { encoding: 'utf8' }).trim();
unlinkSync(tmp);
writeFileSync(listFile, have + '\n');
const lacking = [...want].filter(c => !have.includes(c) && c.codePointAt(0) > 0x2e7f);
console.log(`public/font/pixel.woff2: ${have.length} glyphs, ${readFileSync(new URL('pixel.woff2', out)).length} bytes${lacking.length ? `; the source face has no ${lacking.join('')}` : ''}`);
