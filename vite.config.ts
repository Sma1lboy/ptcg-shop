// npm run dev   → Vite dev server; card art from assets/tcg/ at the repo root (never copied, never watched).
// npm run build → dist/index.html, one self-contained file: double-click it (art from the CDN) or serve dist/ over http
//                 (art from the mirror via the dist/assets/tcg symlink the npm script adds).
// npm run pen   → dist/pen.html for CodePen: same file, art always from the CDN, build fails at CodePen's 1 MB cap.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// three.js is never inlined (~800 KB minified would blow the pen cap): builds load it from jsdelivr through an import map,
// pinned to the version in node_modules (which the dev server uses).
const THREE = `https://cdn.jsdelivr.net/npm/three@${JSON.parse(readFileSync('node_modules/three/package.json', 'utf8')).version}/`;
const PEN_MAX = 1_000_000; // "We disable save on Pens with over 1 million characters total or 1 MB of code." (CodePen docs)

export default defineConfig(({ mode }) => ({
  define: { __REMOTE_ASSETS__: JSON.stringify(mode === 'pen') },
  server: { watch: { ignored: ['**/assets/tcg/**'] } },
  build: { rolldownOptions: { external: ['three', /^three\/addons\//] }, emptyOutDir: mode !== 'pen' },
  plugins: [
    viteSingleFile(),
    {
      name: 'three-importmap', apply: 'build',
      transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'importmap' }, injectTo: 'head-prepend',
        children: JSON.stringify({ imports: { three: THREE + 'build/three.module.min.js', 'three/addons/': THREE + 'examples/jsm/' } }) }],
    },
    {
      name: 'pen', apply: 'build', enforce: 'post', // after singlefile has inlined everything into the html
      generateBundle(_, bundle) {
        if (mode !== 'pen') return;
        const html = bundle['index.html'] as { fileName: string; source: string };
        if (html.source.length >= PEN_MAX) this.error(`pen.html is ${html.source.length} characters; CodePen won't save a pen over ${PEN_MAX}`);
        html.fileName = 'pen.html';
      },
    },
  ],
}));
