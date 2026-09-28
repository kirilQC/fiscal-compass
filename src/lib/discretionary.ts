import type { PlanRow } from "./plan";
import { essentialPatterns, isSpend, spendClass, type ClassTxn } from "./spend";

export type SpendTxn = ClassTxn;

export interface SpendSplit {
  totalCents: number;
  essentialCents: number;
  discretionaryCents: number;
}

/** Splits a month's spending by each transaction's spend class. */
export function splitSpend(txns: SpendTxn[], planRows: PlanRow[]): SpendSplit {
  const patterns = essentialPatterns(planRows);
  let essentialCents = 0;
  let discretionaryCents = 0;
  for (const t of txns) {
    if (!isSpend(t)) continue;
    if (spendClass(t, patterns) === "essential") essentialCents -= t.amount_cents;
    else discretionaryCents -= t.amount_cents;
  }
  return { totalCents: essentialCents + discretionaryCents, essentialCents, discretionaryCents };
}

// Default cap before Kiril sets one: a third of what is left after essentials, to the nearest $50.
export function defaultBudgetCents(availableCents: number): number {
  return Math.max(0, Math.round((availableCents * 0.3) / 5000) * 5000);
}
