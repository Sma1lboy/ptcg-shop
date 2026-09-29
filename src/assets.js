// Where card art and set logos load from. Served over http, the game uses its own mirror in assets/tcg/
// (node scripts/fetch-images.mjs) so it never leans on the TCGdex CDN. file:// pages and the CodePen build
// (window.PTCG_REMOTE_ASSETS = true) have no mirror to reach, so they fall back to the CDN.
// Never add a query string to CDN URLs: assets.tcgdex.net then sends Access-Control-Allow-Origin twice and browsers reject it.
(function (g) {
  const remote = !!g.PTCG_REMOTE_ASSETS || g.location.protocol === 'file:';
  const base = remote ? 'https://assets.tcgdex.net/en/sv/' : 'assets/tcg/';
  g.PTCG_ASSETS = {
    remote,
    card: (set, n, size = 'low') => `${base}${set}/${n}/${size}.webp`, // size: 'low' (245×337) | 'high' (600×825)
    logo: set => `${base}${set}/logo.png`,
  };
})(window);
