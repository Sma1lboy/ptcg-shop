// Inline index.html's css + scripts into one file: dist/pen.html (paste into CodePen's HTML pane, or open directly).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => readFileSync(join(root, f), 'utf8');
const html = rd('index.html')
  .replace(/<link rel="stylesheet" href="(?!http)([^"]+)">/g, (_, f) => `<style>\n${rd(f)}\n</style>`)
  .replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${rd(f).replace(/<\/script/gi, '<\\/script')}\n</script>`);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/pen.html'), html);
console.log(`dist/pen.html ${(html.length / 1024).toFixed(0)} KB`);
