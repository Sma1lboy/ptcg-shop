// Refreshes the sealed booster pack prices (PriceCharting ungraded) into data/packs.json, read by src/sets.ts.
// Usage: node scripts/fetch-packs.mjs   (each set's page is its priceSource in src/sets.ts; the file is only written if every set parses)
import { writeFile } from 'node:fs/promises';
import { SETS } from '../src/sets.ts';

const out = { date: new Date().toISOString().slice(0, 10) };
for (const s of SETS) {
  const html = await (await fetch(s.priceSource, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const m = html.match(/id="used_price"[\s\S]*?class="price js-price"[^>]*>\s*\$([\d,.]+)/); // "Ungraded" column
  if (!m) throw new Error(`no ungraded price on ${s.priceSource}`);
  out[s.id] = +m[1].replace(/,/g, '');
  console.log(s.id.padEnd(7), s.packPrice ?? '—', '→', out[s.id]);
}
await writeFile('data/packs.json', JSON.stringify(out, null, 1) + '\n');
