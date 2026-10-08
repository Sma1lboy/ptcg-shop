// Where card art and set logos load from — the only module that decides it. Served over http, the game uses its own
// mirror in assets/tcg/ (node scripts/fetch-images.mjs) so it never leans on the TCGdex CDN. file:// pages (double-clicked
// dist/index.html) and the CodePen build (vite build --mode pen sets __REMOTE_ASSETS__) have no mirror to reach, so they fall back to the CDN.
// Never add a query string to CDN URLs: assets.tcgdex.net then sends Access-Control-Allow-Origin twice and browsers reject it.
// It sends it twice for some files anyway (file by file, every time: sv10/231/high.webp yes, sv10/230 no), so a CORS-mode load
// of those fails. A plain <img> makes no CORS check: card.ts and mat.ts's warm-up load remote art that way (`remote`).
declare const __REMOTE_ASSETS__: boolean;
export const remote = __REMOTE_ASSETS__ || location.protocol === 'file:';
// Where the game lives, for share text and 排行 links: a double-clicked dist or the pen has no address to send (file:///Users/…), so
// the public one (public/CNAME) stands in
export const home = () => remote ? 'https://pcards.sma1lboy.me/' : location.href.split(/[?#]/)[0];
// The CDN files each set under its series, which is the set id's letter prefix (sv08 → sv, me01 → me); the mirror has no series level.
const base = (set: string) => remote ? `https://assets.tcgdex.net/en/${set.match(/^[a-z]+/)![0]}/` : 'assets/tcg/';
// The CDN has no file for these two (404, swept 2026-10-08; the mirror has them): off the mirror the other size stands in
const GONE: Record<string, string> = { 'sv03.5/163/high': 'low', 'sv10/028/low': 'high' };
export const card = (set: string, n: string, size = 'low') => `${base(set)}${set}/${n}/${remote && GONE[`${set}/${n}/${size}`] || size}.webp`; // size: 'low' (245×337) | 'high' (600×825)
export const logo = (set: string) => `${base(set)}${set}/logo.png`;
// Card art for CORS-mode loads (the 3D table's textures, the share canvas): on the remote path, images.pokemontcg.io for the sets it
// carries. Swept 2026-10-08: all 1,391 of their low/hires PNGs for these sets answer 200 with one Access-Control-Allow-Origin, names
// match ours number for number. TCGdex sent it twice for 37% of its high webp (2% of low). me03–me05 aren't there: TCGdex's low webp
// (their hi-res fails as a texture a third of the time; the 12 low ones that fail leave blank stock, me04/me05, late unlocks).
const PTCG: Record<string, string> = { sv08: 'sv8', 'sv08.5': 'sv8pt5', sv09: 'sv9', sv10: 'sv10', 'sv03.5': 'sv3pt5', me01: 'me1', me02: 'me2' };
export const art = (set: string, n: string, size = 'low') => !remote ? card(set, n, size)
  : PTCG[set] ? `https://images.pokemontcg.io/${PTCG[set]}/${+n || n}${size === 'high' ? '_hires' : ''}.png` : card(set, n, 'low');
