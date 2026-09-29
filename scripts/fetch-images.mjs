// Mirrors card art (low + high webp) and set logos from TCGdex into assets/tcg/, so the game serves them
// from its own server instead of hitting the TCGdex CDN on every pack. Skips files already on disk.
// Usage: node scripts/fetch-images.mjs   (needs data/cards-*.json from fetch-data.mjs)
import { mkdir, writeFile, readdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CDN = 'https://assets.tcgdex.net/en'; // + /<series>/<set>/…: the series is the set id's letter prefix (sv08 → sv, me01 → me), as in src/assets.ts
const jobs = [];
for (const f of (await readdir('data')).filter(f => f.startsWith('cards-'))) {
  const d = JSON.parse(await readFile('data/' + f, 'utf8')), set = d.id;
  jobs.push([`${set}/logo.png`]);
  for (const c of d.cards) for (const size of ['low', 'high']) jobs.push([`${set}/${c.n}/${size}.webp`]);
}

let done = 0, fetched = 0, failed = [];
async function get(path) {
  const file = `assets/tcg/${path}`;
  if (existsSync(file)) return;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${CDN}/${path.match(/^[a-z]+/)[0]}/${path}`); // no query string: the CDN doubles CORS headers on those
      if (r.ok) { await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true }); await writeFile(file, Buffer.from(await r.arrayBuffer())); fetched++; return; }
      if (r.status === 404) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500 * 2 ** i));
  }
  failed.push(path);
}
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < jobs.length) { await get(jobs[i++][0]); if (++done % 200 === 0) console.log(`${done}/${jobs.length}`); }
}));
// TCGdex is missing a few sizes (404 upstream); fill the gap with the card's other size so every path resolves.
for (const path of [...failed]) {
  const other = path.replace(/(low|high)\.webp$/, (_, s) => (s === 'low' ? 'high' : 'low') + '.webp');
  if (other !== path && existsSync(`assets/tcg/${other}`)) { await copyFile(`assets/tcg/${other}`, `assets/tcg/${path}`); failed.splice(failed.indexOf(path), 1); console.log(`filled ${path} from ${other}`); }
}
console.log(`done: ${jobs.length} files, ${fetched} downloaded, ${failed.length} failed${failed.length ? ': ' + failed.slice(0, 10).join(' ') : ''}`);
