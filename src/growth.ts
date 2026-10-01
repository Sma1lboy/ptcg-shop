// 成长树 (game setting): the order the shop's growth opens in. Pure data: no DOM, no game state, so the rules (game.ts), the 成长
// page and the scripts all read the same graph and cannot disagree about it.
// A node is unlocked by owning Lv 1 of its parent. Only the first level asks: levels already owned stay effective and keep
// upgrading even if the parent is missing (saves from before the tree existed). The 柜台 tree is rooted in a milestone, not in
// an upgrade: its roots open once the shop has really opened a pack or handled a card (game.ts cardBranchReady).
export type GrowthKey = 'depth' | 'racks' | 'supplier' | 'signage' | 'talk' | 'crowd' | 'expand' | 'clerk' | 'apprentice' | 'watch' | 'case' | 'luck';

export interface GrowthNode { readonly k: GrowthKey; readonly children?: readonly GrowthNode[] }
export interface GrowthTree { readonly id: string; readonly name: string; readonly say: string; readonly milestone?: 'cards'; readonly roots: readonly GrowthNode[] }

export const GROWTH_TREES: readonly GrowthTree[] = [
  { id: 'shelf', name: '货架', say: '摆几个系列、每架多少包、进货多便宜',
    roots: [{ k: 'depth', children: [{ k: 'racks' }, { k: 'supplier' }] }] },
  { id: 'customers', name: '客人', say: '进来多少人、肯付多少',
    roots: [{ k: 'signage', children: [{ k: 'talk' }, { k: 'crowd', children: [{ k: 'expand' }] }] }] },
  { id: 'staff', name: '店员', say: '你不在柜台时谁看店',
    roots: [{ k: 'clerk', children: [{ k: 'apprentice' }, { k: 'watch' }] }] },
  { id: 'counter', name: '柜台', say: '单卡的柜位，和你自己开包的手气', milestone: 'cards',
    roots: [{ k: 'case' }, { k: 'luck' }] },
];

// Every key once, parents before their children.
export const GROWTH_KEYS: readonly GrowthKey[] = GROWTH_TREES.flatMap(t => {
  const walk = (n: GrowthNode): GrowthKey[] => [n.k, ...(n.children ?? []).flatMap(walk)];
  return t.roots.flatMap(walk);
});

// child → parent, derived from the trees. Roots have no entry.
export const GROWTH_PARENTS: Readonly<Partial<Record<GrowthKey, GrowthKey>>> = (() => {
  const parents: Partial<Record<GrowthKey, GrowthKey>> = {};
  const walk = (n: GrowthNode) => { for (const c of n.children ?? []) { parents[c.k] = n.k; walk(c); } };
  for (const t of GROWTH_TREES) t.roots.forEach(walk);
  return Object.freeze(parents);
})();
