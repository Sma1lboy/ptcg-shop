// Hand-curated per-set config. Rates are TCGplayer's measured per-pack percentages (not the rounded "1 in N").
// ci = the article's 95% confidence half-width, used by test/sim.test.mjs. Prices: PriceCharting ungraded, 2026-09-28.
// Slot model from the same articles: rare slot = R | RR | UR; reverse #1 = reverse | ACE (| Poké Ball in PE);
// reverse #2 = reverse | IR | SIR | HR (| Master Ball in PE); plus 4 C, 3 U and a basic Energy.
window.PTCG_SETS = [
  {
    id: 'sv08', name: '超电突围', en: 'Surging Sparks', released: '2024-11-08',
    packPrice: 8.47, boxPrice: 297.37,
    rates: { RR: 16.94, UR: 6.74, ACE: 5.03, IR: 7.67, SIR: 1.15, HR: 0.53 },
    ci: { RR: 0.79, UR: 0.53, ACE: 0.46, IR: 0.56, SIR: 0.22, HR: 0.15 },
    sample: 8000,
    rateSource: 'https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Surging-Sparks-Pull-Rates/6ccfb6ab-f26a-4ce8-bab5-5f91c85ec70e/',
    priceSource: 'https://www.pricecharting.com/game/pokemon-surging-sparks/booster-pack',
  },
  {
    id: 'sv10', name: '命运对决', en: 'Destined Rivals', released: '2025-05-30',
    packPrice: 9.25, boxPrice: 400.55,
    rates: { RR: 19.83, UR: 6.39, IR: 8.29, SIR: 1.06, HR: 0.67 },
    ci: { RR: 0.84, UR: 0.52, IR: 0.58, SIR: 0.22, HR: 0.17 },
    sample: 8000,
    rateSource: 'https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Destined-Rivals-Pull-Rates/43ba832e-44c9-45a4-ae2e-594df2defdda/',
    priceSource: 'https://www.pricecharting.com/game/pokemon-destined-rivals/booster-pack',
  },
  {
    id: 'sv08.5', name: '棱镜进化', en: 'Prismatic Evolutions', released: '2025-01-17',
    packPrice: 14.63, boxPrice: null,
    // PB / MB = Poké Ball / Master Ball pattern reverse holos. SIR 2.22 is SIRs per pack (demigod packs exist, not modelled).
    rates: { PB: 33.10, RR: 16.51, UR: 7.46, ACE: 4.68, MB: 4.92, SIR: 2.22, HR: 0.56 },
    ci: { PB: 2.60, RR: 2.05, UR: 1.45, ACE: 1.17, MB: 1.19, SIR: 0.81, HR: 0.41 },
    sample: 1200,
    rateSource: 'https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Prismatic-Evolutions-Pull-Rates/d94889ea-f76a-4a13-b74d-5b0b071220a7/',
    priceSource: 'https://www.pricecharting.com/game/pokemon-prismatic-evolutions/booster-pack',
  },
  {
    id: 'sv03.5', name: '宝可梦 151', en: '151', released: '2023-09-22',
    packPrice: 29.86, boxPrice: null,
    rates: { RR: 13.28, UR: 6.44, IR: 8.50, SIR: 3.11, HR: 1.94, FE: 24.83 }, // FE = cosmos-foil basic Energy
    ci: { RR: 1.57, UR: 1.13, IR: 1.29, SIR: 0.80, HR: 0.64, FE: 2.00 },
    sample: 1500,
    rateSource: 'https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Scarlet-Violet%E2%80%94151-Pull-Rates/b237df74-fbb0-40d0-9e13-d69ee6e804d9/',
    priceSource: 'https://www.pricecharting.com/game/pokemon-scarlet-&-violet-151/booster-pack',
  },
];
