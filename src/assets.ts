// Where card art and set logos load from — the only module that decides it. Served over http, the game uses its own
// mirror in assets/tcg/ (node scripts/fetch-images.mjs) so it never leans on the TCGdex CDN. file:// pages (double-clicked
// dist/index.html) and the CodePen build (vite build --mode pen sets __REMOTE_ASSETS__) have no mirror to reach, so they fall back to the CDN.
// Never add a query string to CDN URLs: assets.tcgdex.net then sends Access-Control-Allow-Origin twice and browsers reject it.
declare const __REMOTE_ASSETS__: boolean;
const remote = __REMOTE_ASSETS__ || location.protocol === 'file:';
// The CDN files each set under its series, which is the set id's letter prefix (sv08 → sv, me01 → me); the mirror has no series level.
const base = (set: string) => remote ? `https://assets.tcgdex.net/en/${set.match(/^[a-z]+/)![0]}/` : 'assets/tcg/';
export const card = (set: string, n: string, size = 'low') => `${base(set)}${set}/${n}/${size}.webp`; // size: 'low' (245×337) | 'high' (600×825)
export const logo = (set: string) => `${base(set)}${set}/logo.png`;
