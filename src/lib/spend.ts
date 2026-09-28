// Every outgoing transaction carries two labels: a spend class (essential or discretionary) and a category.
// The only outflows without a class are moves between Kiril's own accounts, whose purchases are already counted.
// Pure module: safe to import from client components.

export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Utilities",
  "Housing",
  "Insurance",
  "Health",
  "Fitness",
  "Entertainment",
  "Giving",
  "Travel",
  "Personal Care",
  "Education",
  "Loan Payment",
  "Payments to People",
  "Cash",
  "Fees & Interest",
  "Income",
  "Transfer",
  "Reimbursed",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Categories offered when recategorizing a purchase by hand.
export const SPEND_CATEGORIES = CATEGORIES.filter((c) => c !== "Income" && c !== "Transfer");

export type SpendClass = "essential" | "discretionary";

// Money moving between Kiril's own accounts: card payments, brokerage sweeps, account verification.
export const INTERNAL_MOVE_RE =
  /payment to chase card|payment thank you|autopay|online transfer (to|from)|redemption from core|into core account|reinvestment|acctverify/i;

const ESSENTIAL_CATEGORIES = new Set(["Housing", "Insurance", "Utilities", "Health", "Giving", "Fitness", "Groceries", "Loan Payment", "Reimbursed"]);

// Transport splits by merchant: fuel is essential, rides, scooters and parking are not.
const FUEL_RE = /mapco|shell|exxon|\bbp\b|chevron|circle k|speedway|marathon|7-eleven|sunoco|valero|racetrac|quiktrip|wawa|pilot|love's|murphy|citgo|mobil|texaco|costco gas/i;

export interface ClassTxn {
  amount_cents: number;
  merchant: string;
  category: string;
  is_transfer: boolean;
  is_income: boolean;
  spend_class?: string | null;
}

// `is_transfer` marks internal moves only; everything else that leaves an account is spend.
export const isSpend = (t: ClassTxn) => t.amount_cents < 0 && !t.is_income && !t.is_transfer;

/** Merchant patterns of active plan rows: any match is an essential bill. */
export const essentialPatterns = (rows: { merchant_pattern: string | null; is_active?: boolean }[]) =>
  rows.filter((r) => r.merchant_pattern && r.is_active !== false).map((r) => r.merchant_pattern!.toLowerCase());

export function spendClass(t: ClassTxn, patterns: string[]): SpendClass | null {
  if (!isSpend(t)) return null;
  if (t.spend_class === "essential" || t.spend_class === "discretionary") return t.spend_class;
  const merchant = t.merchant.toLowerCase();
  if (patterns.some((p) => merchant.includes(p))) return "essential";
  if (ESSENTIAL_CATEGORIES.has(t.category)) return "essential";
  if (t.category === "Transport" && FUEL_RE.test(t.merchant)) return "essential";
  return "discretionary";
}
