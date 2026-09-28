import type { PlanRow } from "./plan";
import { essentialPatterns, isSpend, spendClass, tagMemory, type ClassTxn } from "./spend";

export type SpendTxn = ClassTxn & { posted_on?: string };

export interface SpendSplit {
  totalCents: number;
  essentialCents: number;
  discretionaryCents: number;
  untaggedCents: number;
}

/** Splits a month's spending by each transaction's tag; `tagged` supplies Kiril's per-merchant memory. */
export function splitSpend(txns: SpendTxn[], planRows: PlanRow[], tagged: SpendTxn[] = txns): SpendSplit {
  const classifier = { patterns: essentialPatterns(planRows), memory: tagMemory(tagged.map((t) => ({ merchant: t.merchant, spend_class: t.spend_class ?? null, posted_on: t.posted_on }))) };
  const out = { essentialCents: 0, discretionaryCents: 0, untaggedCents: 0 };
  for (const t of txns) {
    if (!isSpend(t)) continue;
    const tag = spendClass(t, classifier);
    if (tag === "essential") out.essentialCents -= t.amount_cents;
    else if (tag === "discretionary") out.discretionaryCents -= t.amount_cents;
    else out.untaggedCents -= t.amount_cents;
  }
  return { totalCents: out.essentialCents + out.discretionaryCents + out.untaggedCents, ...out };
}

// Default cap before Kiril sets one: a third of what is left after essentials, to the nearest $50.
export function defaultBudgetCents(availableCents: number): number {
  return Math.max(0, Math.round((availableCents * 0.3) / 5000) * 5000);
}
