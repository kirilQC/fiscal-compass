import type { PlanRow } from "./plan";
import { expectedCents } from "./plan";

export interface SpendTxn {
  posted_on?: string;
  amount_cents: number;
  merchant: string;
  category: string;
  is_transfer: boolean;
  is_income: boolean;
}

export interface SpendSplit {
  totalCents: number;
  essentialCents: number;
  discretionaryCents: number;
}

// Categories the plan covers as fixed monthly bills. Spend here is essential even when no
// merchant pattern matches (a new pharmacy, a different grocery store).
const ESSENTIAL_CATEGORIES = new Set(["Housing", "Insurance", "Utilities", "Health", "Giving", "Fitness", "Business", "Groceries"]);

// Transport is essential only up to the planned fuel figure; anything beyond that is discretionary.
const TRANSPORT = "Transport";

const countsAsSpend = (t: SpendTxn) => t.amount_cents < 0 && !t.is_transfer && !t.is_income && t.category !== "Reimbursed";

function patterns(rows: PlanRow[]) {
  const essential: string[] = [];
  const excluded: string[] = [];
  for (const r of rows) {
    if (!r.merchant_pattern) continue;
    (r.is_reimbursed ? excluded : essential).push(r.merchant_pattern.toLowerCase());
  }
  return { essential, excluded };
}

function plannedTransportCents(rows: PlanRow[], incomeCents: number) {
  return rows
    .filter((r) => !r.is_reimbursed && r.category === TRANSPORT)
    .reduce((sum, r) => sum + expectedCents(r, incomeCents), 0);
}

/**
 * The discretionary part of each transaction, in cents (0 when it is essential or not spend at all).
 * Transport fills the planned fuel figure in date order; whatever lands past it is discretionary.
 * Reimbursed spend, transfers and income never count toward either side.
 */
export function discretionaryPerTxn(txns: SpendTxn[], planRows: PlanRow[], incomeCents: number): number[] {
  const { essential: essentialPatterns, excluded } = patterns(planRows);
  const out = txns.map(() => 0);
  const transport: number[] = [];

  txns.forEach((t, i) => {
    if (!countsAsSpend(t)) return;
    const merchant = t.merchant.toLowerCase();
    if (excluded.some((p) => merchant.includes(p))) return;
    if (essentialPatterns.some((p) => merchant.includes(p))) return;
    if (t.category === TRANSPORT) transport.push(i);
    else if (!ESSENTIAL_CATEGORIES.has(t.category)) out[i] = -t.amount_cents;
  });

  let budgetLeft = plannedTransportCents(planRows, incomeCents);
  transport.sort((a, b) => (txns[a].posted_on ?? "").localeCompare(txns[b].posted_on ?? ""));
  for (const i of transport) {
    const amount = -txns[i].amount_cents;
    const covered = Math.min(amount, budgetLeft);
    budgetLeft -= covered;
    out[i] = amount - covered;
  }
  return out;
}

/** Splits a month's spending into what the plan already accounts for and what is pocket money. */
export function splitSpend(txns: SpendTxn[], planRows: PlanRow[], incomeCents: number): SpendSplit {
  const disc = discretionaryPerTxn(txns, planRows, incomeCents);
  const { excluded } = patterns(planRows);
  let totalCents = 0;
  let discretionaryCents = 0;
  txns.forEach((t, i) => {
    if (!countsAsSpend(t)) return;
    const merchant = t.merchant.toLowerCase();
    if (excluded.some((p) => merchant.includes(p))) return;
    totalCents -= t.amount_cents;
    discretionaryCents += disc[i];
  });
  return { totalCents, essentialCents: totalCents - discretionaryCents, discretionaryCents };
}

// Default cap before Kiril sets one: a third of what is left after essentials, to the nearest $50.
export function defaultBudgetCents(availableCents: number): number {
  return Math.max(0, Math.round((availableCents * 0.3) / 5000) * 5000);
}
