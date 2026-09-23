import type { PlanRow } from "./plan";
import { expectedCents } from "./plan";

export interface SpendTxn {
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
 * Splits a month's spending into what the plan already accounts for and what is pocket money.
 * Reimbursed spend, transfers and income never count toward either side.
 */
export function splitSpend(txns: SpendTxn[], planRows: PlanRow[], incomeCents: number): SpendSplit {
  const { essential: essentialPatterns, excluded } = patterns(planRows);
  let essentialCents = 0;
  let discretionaryCents = 0;
  let transportCents = 0;

  for (const t of txns) {
    if (!countsAsSpend(t)) continue;
    const amount = -t.amount_cents;
    const merchant = t.merchant.toLowerCase();
    if (excluded.some((p) => merchant.includes(p))) continue;

    if (essentialPatterns.some((p) => merchant.includes(p))) {
      essentialCents += amount;
    } else if (t.category === TRANSPORT) {
      transportCents += amount;
    } else if (ESSENTIAL_CATEGORIES.has(t.category)) {
      essentialCents += amount;
    } else {
      discretionaryCents += amount;
    }
  }

  const transportBudget = plannedTransportCents(planRows, incomeCents);
  const transportEssential = Math.min(transportCents, transportBudget);
  essentialCents += transportEssential;
  discretionaryCents += transportCents - transportEssential;

  return { totalCents: essentialCents + discretionaryCents, essentialCents, discretionaryCents };
}

// Default cap before Kiril sets one: a third of what is left after essentials, to the nearest $50.
export function defaultBudgetCents(availableCents: number): number {
  return Math.max(0, Math.round((availableCents * 0.3) / 5000) * 5000);
}
