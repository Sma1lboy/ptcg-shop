// 排行 (the leaderboard): pure, no DOM and no storage, so node can test it (test/sim.test.mjs). The game has no backend, so a board is
// made of share codes: every player exports a code of their own numbers, friends paste the codes in, and each browser ranks
// whoever it was given. The numbers are self-reported and a code can be edited by anyone who can read base64: this is a friends'
// board, not anti-cheat, and the page says so.
//
// Code = `P1.` + base64url(UTF-8 JSON array of FIELDS) + `.` + checksum, e.g. P1.WyJ4….k3j2h1a. The checksum is a CRC-32 (base36, 7
// characters) over the text before it, `P1.<payload>`, not over the decoded bytes: the last base64 character can carry bits that
// decode to nothing, and a typo there would otherwise pass. It catches typos and truncation; it is not a signature.
import type { Game } from './game.ts';
import { SETS } from './sets.ts';

export const VERSION = 'P1';
export const NAME_MAX = 12;       // characters (code points) of a nickname
export const CODE_MAX = 400;      // a real code is ~110 characters; longer is not one
const PASTE_MAX = 2048;           // what decode() will even look at
export const MAX_ENTRIES = 50;    // imported friends kept on one device
export const LUCK_MIN_PACKS = 30; // fewer packs and one lucky pull decides the percentile (the same bar as achievements.ts LUCK_MIN)

// What one player shares. Money is whole cents; luck is the 欧气 percentile in permille (0..1000) or null; at is ms.
export interface Snap {
  id: string;     // random per device, made once (ui/board.ts)
  name: string;   // nickname
  at: number;     // when the snapshot was taken
  rev: number;    // 累计营业额, cents: every shop's sales (branch.life + this shop's); a shop that went bankrupt counts for nothing
  fame: number;   // 名气 earned over all shops (branch.got), spent or not
  shops: number;  // 分店数: shops opened after the first
  packs: number;  // 开包数
  luck: number | null; // 欧气: share of simulated players you beat, permille; null before LUCK_MIN_PACKS
  ach: number;    // 成就数
  dex: number;    // 图鉴收录: distinct cards in the 图鉴, all sets
  cards: number;  // 藏品总值, cents: binder + sale case + 收藏室 (its 镇店台 included) at market
}

export const METRICS = [
  { k: 'rev', name: '营业额' }, { k: 'fame', name: '名气' }, { k: 'luck', name: '欧气' },
  { k: 'ach', name: '成就' }, { k: 'dex', name: '图鉴' }, { k: 'cards', name: '藏品' },
] as const;
export type Metric = (typeof METRICS)[number]['k'];
export const isMetric = (k: unknown): k is Metric => METRICS.some(m => m.k === k);

// ---------- snapshot (read-only on the game) ----------
export function snapshot(G: Game, id: string, name: string): Snap {
  const s = G.state, L = G.luck(), cents = (v: number) => Math.round(v * 100);
  const cards = Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0)
    + s.shown.reduce((a, c) => a + c.price, 0) + G.galleryValue();
  return {
    id, name: cleanName(name), at: G.now(),
    rev: cents(s.branch.life + G.revenue()), fame: s.branch.got, shops: s.branch.n, packs: L.packs,
    luck: L.pct != null && L.packs >= LUCK_MIN_PACKS ? Math.round(L.pct * 1000) : null,
    ach: Object.keys(s.ach).length, dex: SETS.reduce((a, x) => a + G.dexCount(x.id), 0), cards: cents(cards),
  };
}

// A nickname as it is kept: no control or direction-changing characters, one space at most between words, NAME_MAX characters.
export const cleanName = (s: unknown): string =>
  typeof s !== 'string' ? '' : Array.from(s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();

// ---------- check: the one validator for a decoded code and for anything read back from localStorage ----------
const ID = /^[0-9a-z]{8,16}$/;
const int = (v: unknown, max: number, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function check(e: unknown): Snap | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>, name = cleanName(o.name);
  if (typeof o.id !== 'string' || !ID.test(o.id) || !name) return null;
  if (!int(o.at, 4e12) || !int(o.rev, 1e14) || !int(o.fame, 1e9) || !int(o.shops, 1e6) || !int(o.packs, 1e9) || !int(o.ach, 999) || !int(o.dex, 99999) || !int(o.cards, 1e14)) return null;
  if (o.luck !== null && !int(o.luck, 1000)) return null;
  return { id: o.id, name, at: o.at, rev: o.rev, fame: o.fame, shops: o.shops, packs: o.packs, luck: o.luck as number | null, ach: o.ach, dex: o.dex, cards: o.cards };
}

// ---------- the code ----------
const crc32 = (s: string) => {
  let c = -1;
  for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i); for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return (~c) >>> 0;
};
const sum = (head: string) => crc32(head).toString(36).padStart(7, '0');
const toB64 = (s: string) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = (p: string) => { const bin = atob(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4)); return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };

// Fixed order: the version prefix is what covers a later change of it.
export function encode(e: Snap): string {
  const head = `${VERSION}.${toB64(JSON.stringify([e.id, e.name, Math.round(e.at / 1000), e.rev, e.fame, e.shops, e.packs, e.luck ?? -1, e.ach, e.dex, e.cards]))}`;
  return `${head}.${sum(head)}`;
}
export const link = (base: string, code: string) => `${base.split(/[?#]/)[0]}?board=${code}#board`;

// why: empty = nothing pasted, size = too long to be a code, format = not shaped like one, version = a code from another version,
// sum = the checksum disagrees (a typo, or cut short), data = the numbers inside are not a player's
export type Why = 'empty' | 'size' | 'format' | 'version' | 'sum' | 'data';
export type Decoded = { ok: true; snap: Snap } | { ok: false; why: Why };
const no = (why: Why): Decoded => ({ ok: false, why });
// Takes the code, a whole share link (…?board=CODE#board), or the code with line breaks in it. Never throws.
export function decode(input: unknown): Decoded {
  if (typeof input !== 'string') return no('format');
  if (input.length > PASTE_MAX) return no('size');
  let text = input.replace(/\s+/g, '');
  const m = /board=([A-Za-z0-9._-]*)/.exec(text); if (m) text = m[1];
  if (!text) return no('empty');
  if (text.length > CODE_MAX) return no('size');
  const [ver, payload, tail, ...rest] = text.split('.');
  if (rest.length || payload === undefined || tail === undefined || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[0-9a-z]{7}$/.test(tail) || !/^P\d+$/.test(ver)) return no('format');
  if (ver !== VERSION) return no('version');
  if (sum(`${ver}.${payload}`) !== tail) return no('sum');
  try {
    const a: unknown = JSON.parse(fromB64(payload));
    if (!Array.isArray(a) || a.length !== 11) return no('data');
    const [id, name, sec, rev, fame, shops, packs, luck, ach, dex, cards] = a;
    if (!int(sec, 4e9)) return no('data');
    const snap = check({ id, name, at: sec * 1000, rev, fame, shops, packs, luck: luck === -1 ? null : luck, ach, dex, cards });
    return snap ? { ok: true, snap } : no('data');
  } catch { return no('data'); }
}

// ---------- the board ----------
// One entry per device id + nickname: importing the same pair again replaces what was there (position kept out of it: the board
// is sorted anyway). A new pair when the board is already at MAX_ENTRIES is refused, not made room for.
export const keyOf = (e: Pick<Snap, 'id' | 'name'>) => `${e.id}:${e.name}`;
export function upsert(list: Snap[], e: Snap): { list: Snap[]; how: 'added' | 'replaced' | 'full' } {
  const k = keyOf(e), at = list.findIndex(x => keyOf(x) === k);
  if (at >= 0) return { list: list.map((x, i) => (i === at ? e : x)), how: 'replaced' };
  return list.length >= MAX_ENTRIES ? { list, how: 'full' } : { list: [...list, e], how: 'added' };
}
// Highest first; a player with nothing to show for the metric (欧气 before LUCK_MIN_PACKS) goes last; ties by older snapshot,
// then name, so the order never flickers between renders.
export function rank(list: Snap[], m: Metric): Snap[] {
  return [...list].sort((a, b) => {
    const x = a[m], y = b[m];
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    return y - x || a.at - b.at || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);
  });
}

// What the UI keeps under localStorage `ptcg.board`. Parsed defensively: the key is editable by hand, and what comes back out of it
// goes through check() like a pasted code does. id '' = none yet (the UI makes one).
export interface Store { id: string; name: string; metric: Metric; entries: Snap[] }
export function parseStore(raw: string | null | undefined): Store {
  let o: Record<string, unknown> = {};
  try { const v: unknown = JSON.parse(raw || '{}'); if (v && typeof v === 'object') o = v as Record<string, unknown>; } catch { /* a broken value starts an empty board */ }
  let entries: Snap[] = [];
  for (const x of Array.isArray(o.entries) ? o.entries.slice(0, MAX_ENTRIES * 2) : []) { const e = check(x); if (e) entries = upsert(entries, e).list; }
  return { id: typeof o.id === 'string' && ID.test(o.id) ? o.id : '', name: cleanName(o.name), metric: isMetric(o.metric) ? o.metric : 'rev', entries };
}
