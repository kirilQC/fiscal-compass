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
  "Wedding",
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
// "untagged": not sure from the name alone, so it waits in the Spending page's review box for Kiril to tag.
export type Tag = SpendClass | "untagged";

// Money moving between Kiril's own accounts: card payments, brokerage sweeps, account verification.
export const INTERNAL_MOVE_RE =
  /payment to chase card|payment thank you|autopay|online transfer (to|from)|redemption from core|into core account|reinvestment|acctverify/i;

// Only categories that settle the question on their own get a tag automatically.
const ESSENTIAL_CATEGORIES = new Set(["Housing", "Insurance", "Utilities", "Health", "Giving", "Fitness", "Groceries", "Loan Payment", "Reimbursed"]);
export const DISCRETIONARY_CATEGORIES = new Set(["Dining", "Shopping", "Subscriptions", "Entertainment", "Travel", "Personal Care", "Fees & Interest", "Payments to People"]);

// Transport splits by merchant: fuel is essential, ride apps and scooters are not, anything else waits for Kiril.
export const FUEL_RE = /mapco|shell|exxon|\bbp\b|chevron|circle ?k|speedway|marathon|7-eleven|sunoco|valero|racetrac|quiktrip|wawa|pilot|love's|murphy|citgo|mobil|texaco|thorntons|buc-ee|costco gas/i;
const RIDE_RE = /uber|lyft|lime\*|bird\b|waymo/i;

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

/** Stable merchant key: drops store numbers, reference IDs and phone numbers so recurring charges group together. */
export function normalizeMerchant(merchant: string): string {
  return merchant
    .replace(/\b(ppd|web|ccd|arc)\s+id:?\s*\S+/gi, " ")
    .replace(/\+?1?\d{3}[-\s.]?\d{3}[-\s.]?\d{4}/g, " ")
    .replace(/\b\d{3}-\d{7,}\b/g, " ")
    .replace(/[#*]\s*(?=[A-Z]*\d)[A-Z0-9]{3,}\b/gi, " ")
    .replace(/\b[A-Z0-9]*\d[A-Z0-9]*\b/gi, " ")
    .replace(/\b(mountain vie|amzn\.com\/bill|g\.co\/helppay|www\.|\.com)\b/gi, " ")
    .replace(/\b[A-Z]{2}\b\s*$/i, " ")
    .replace(/[^\w&'.\- ]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 40) || merchant.trim().toUpperCase().slice(0, 40);
}

/** An essential expense catches charges by one or more merchant names, stored "|"-separated. */
export const planPatterns = (pattern: string | null | undefined) =>
  (pattern ?? "").split("|").map((p) => p.trim().toLowerCase()).filter(Boolean);

export function matchesPatterns(merchant: string, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const raw = merchant.toLowerCase();
  const norm = normalizeMerchant(merchant).toLowerCase();
  return patterns.some((p) => raw.includes(p) || norm.includes(p));
}

/** Merchant names of every active essential expense: a charge matching any of them is essential. */
export const essentialPatterns = (rows: { merchant_pattern: string | null; is_active?: boolean }[]) =>
  rows.filter((r) => r.is_active !== false).flatMap((r) => planPatterns(r.merchant_pattern));

// Zelle, Venmo and Cash App default to discretionary but stay in the review box until Kiril confirms each one.
export const needsVerify = (t: ClassTxn) => t.category === "Payments to People" && !t.spend_class;

/** What Kiril has tagged by hand, per merchant; the newest tag wins and carries to that merchant's other charges. */
export function tagMemory(rows: { merchant: string; spend_class: string | null; posted_on?: string }[]): Map<string, SpendClass> {
  const out = new Map<string, SpendClass>();
  const sorted = [...rows].sort((a, b) => (a.posted_on ?? "").localeCompare(b.posted_on ?? ""));
  for (const r of sorted) if (r.spend_class === "essential" || r.spend_class === "discretionary") out.set(normalizeMerchant(r.merchant), r.spend_class);
  return out;
}

export interface Classifier {
  patterns: string[];
  memory: Map<string, SpendClass>;
}

export function spendClass(t: ClassTxn, c: Classifier): Tag | null {
  if (!isSpend(t)) return null;
  if (t.spend_class === "essential" || t.spend_class === "discretionary") return t.spend_class;
  const remembered = c.memory.get(normalizeMerchant(t.merchant));
  if (remembered) return remembered;
  if (matchesPatterns(t.merchant, c.patterns)) return "essential";
  if (ESSENTIAL_CATEGORIES.has(t.category)) return "essential";
  if (DISCRETIONARY_CATEGORIES.has(t.category)) return "discretionary";
  if (t.category === "Transport") return FUEL_RE.test(t.merchant) ? "essential" : RIDE_RE.test(t.merchant) ? "discretionary" : "untagged";
  return "untagged";
}
