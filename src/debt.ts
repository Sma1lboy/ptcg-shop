// The one place the story reads the debt economy (债务 / 账单 / 借贷 / 破产, owned by game.ts). Everything else in the story sees
// only the normalised shapes below, so when the economy's final field and event names land, only this file changes.
// Every read is optional: on a game without the economy (or an older save) these return null and the story plays only its
// opening and the milestones that don't need debt.
import type { Game, GameEvent } from './game.ts';

export interface Bill { week: number; amount: number; dueAt?: number }
// kind: what happened to the debt. key: stable id for "has this beat already played" (bill_due fires every tick inside its window)
export interface DebtBeat { kind: 'due' | 'paid' | 'missed' | 'loan' | 'bankrupt' | 'story'; key: string; week?: number; amount?: number; id?: string }

type Econ = { nextBill?: () => Partial<Bill> | null | undefined };
type Ev = { type?: string; week?: number; amount?: number; id?: string };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function bill(G: Game): Bill | null {
  try { const b = (G as Game & Econ).nextBill?.(); const week = num(b?.week), amount = num(b?.amount); return week && amount != null ? { week, amount, dueAt: num(b?.dueAt) } : null; }
  catch { return null; }
}
export const inDebt = (G: Game) => (num((G.state as { debt?: number }).debt) ?? 0) > 0 || !!bill(G);
const weekNow = (G: Game) => num((G.state as { week?: number }).week);

const KIND: Record<string, DebtBeat['kind']> = { bill_due: 'due', bill_paid: 'paid', bill_missed: 'missed', loan_taken: 'loan', bankrupt: 'bankrupt', story: 'story' };
export function debtBeat(ev: GameEvent | undefined, G: Game): DebtBeat | null {
  const e = (ev ?? {}) as Ev, kind = e.type ? KIND[e.type] : undefined;
  if (!kind) return null;
  const b = kind === 'due' ? bill(G) : null, week = num(e.week) ?? b?.week ?? weekNow(G), amount = num(e.amount) ?? b?.amount;
  const key = kind === 'story' ? `story:${e.id}` : kind === 'loan' || kind === 'bankrupt' ? '' : `${kind}:${week ?? '?'}`; // '' = may play every time
  return { kind, key, week, amount, id: e.id };
}
