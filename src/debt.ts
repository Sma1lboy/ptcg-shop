// The one place the story reads the debt economy (债务 / 账单 / 借贷 / 破产, owned by game.ts). Everything else in the story sees
// only the normalised shapes below, so when the economy's final field and event names land, only this file changes.
// Every read is optional: on a game without the economy (or an older save) these return null and the story plays only its
// opening and the milestones that don't need debt.
import type { Game, GameEvent } from './game.ts';

export interface Bill { week: number; amount: number; dueAt?: number }
// kind: what happened to the debt. key: stable id for "has this beat already played" (bill_due fires every tick inside its window)
// 'last' = a bill was paid and the next one would clear the opening debt (nothing borrowed): the run's closing stretch
export interface DebtBeat { kind: 'due' | 'paid' | 'last' | 'missed' | 'loan' | 'bankrupt' | 'story'; key: string; week?: number; amount?: number; id?: string; set?: string }

type Econ = { nextBill?: () => Partial<Bill> | null | undefined };
type Ev = { type?: string; week?: number; amount?: number; id?: string; set?: string };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function bill(G: Game): Bill | null {
  try { const b = (G as Game & Econ).nextBill?.(); const week = num(b?.week), amount = num(b?.amount); return week && amount != null ? { week, amount, dueAt: num(b?.dueAt) } : null; }
  catch { return null; }
}
export const inDebt = (G: Game) => (num((G.state as { debt?: number }).debt) ?? 0) > 0 || !!bill(G);
const weekNow = (G: Game) => num((G.state as { week?: number }).week);
// Which run this is: every new shop (开分店) and every bankruptcy starts week 1 again, so week keys are per run.
const run = (G: Game) => { const b = (G.state as { branch?: { n?: number; broke?: number } }).branch; return `${b?.n ?? 0}.${b?.broke ?? 0}`; };
// the next bill is the one that empties the opening debt, and there is no loan to carry past it
const lastAhead = (G: Game) => { const s = G.state as { owe?: number; loan?: number; week?: number }; return !!s.owe && !s.loan && s.week != null && typeof G.installment === 'function' && G.installment(s.week) >= s.owe; };

const KIND: Record<string, DebtBeat['kind']> = { bill_due: 'due', bill_paid: 'paid', bill_missed: 'missed', loan_taken: 'loan', bankrupt: 'bankrupt', story: 'story' };
export function debtBeat(ev: GameEvent | undefined, G: Game): DebtBeat | null {
  const e = (ev ?? {}) as Ev, kind = e.type ? KIND[e.type] : undefined;
  if (!kind) return null;
  // the bill that clears the debt emits due → paid → story in one go, all read after the debt is gone: only 还清 speaks
  if ((kind === 'due' || kind === 'paid') && !inDebt(G)) return null;
  // a bill the till covered goes due → paid in the same tick: 九姐 only needs to speak once, so 「这周的账」 plays when it was not paid
  // (missed, or piled onto one still overdue), and a covered week is just 「收到」
  if (kind === 'due' && num(e.week) != null && (weekNow(G) ?? 0) > e.week! && (G.state as { overdue?: { week?: number } | null }).overdue?.week !== e.week) return null;
  const b = kind === 'due' ? bill(G) : null, week = num(e.week) ?? b?.week ?? weekNow(G), amount = num(e.amount) ?? b?.amount, r = run(G);
  if (kind === 'paid' && lastAhead(G)) return { kind: 'last', key: `last:${r}`, week, amount };
  // '' = may play every time; story ids are per shop (branch.n), so the second shop gets its own 还清 and 开张
  const key = kind === 'story' ? `story:${e.id}:${e.set ?? r.split('.')[0]}` : kind === 'loan' || kind === 'bankrupt' ? '' : `${kind}:${r}:${week ?? amount ?? b?.dueAt ?? '?'}`;
  return { kind, key, week, amount, id: e.id, set: e.set };
}
