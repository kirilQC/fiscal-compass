export interface Rule {
  merchant_pattern: string;
  category: string;
  is_transfer: boolean;
  is_income: boolean;
}

export interface Categorized {
  category: string;
  source: "rule" | "provider";
  isTransfer: boolean;
  isIncome: boolean;
}

const FALLBACK: Array<[RegExp, Partial<Categorized> & { category: string }]> = [
  [/payroll|direct dep|dir dep|salary|paycheck/i, { category: "Income", isIncome: true }],
  [/transfer|payment thank you|autopay|online payment|zelle|venmo cashout/i, { category: "Transfer", isTransfer: true }],
  [/whole foods|trader joe|grocery|safeway|kroger|costco|aldi|wegmans|h-e-b|publix/i, { category: "Groceries" }],
  [/uber(?! eats)|lyft|shell|chevron|exxon|bp |mobil|parking|transit|metro|toll/i, { category: "Transport" }],
  [/netflix|spotify|apple\.com|hulu|disney|hbo|youtube|icloud|adobe|openai|chatgpt|github/i, { category: "Subscriptions" }],
  [/amazon|amzn|target|best buy|walmart|ikea|nike|apple store/i, { category: "Shopping" }],
  [/doordash|uber eats|grubhub|sweetgreen|chipotle|starbucks|restaurant|cafe|coffee|pizza|sushi|taco|burger|bar & grill/i, { category: "Dining" }],
  [/rent|mortgage|landlord/i, { category: "Housing" }],
  [/pg&e|con ed|utility|water|electric|comcast|xfinity|verizon|at&t|t-mobile/i, { category: "Utilities" }],
];

export function categorize(merchant: string, rules: Rule[]): Categorized {
  const m = merchant.toLowerCase();
  for (const r of rules) {
    if (m.includes(r.merchant_pattern.toLowerCase())) {
      return { category: r.category, source: "rule", isTransfer: r.is_transfer, isIncome: r.is_income };
    }
  }
  for (const [re, c] of FALLBACK) {
    if (re.test(merchant)) {
      return { category: c.category, source: "provider", isTransfer: !!c.isTransfer, isIncome: !!c.isIncome };
    }
  }
  return { category: "Other", source: "provider", isTransfer: false, isIncome: false };
}

export function cleanMerchant(description: string): string {
  return description
    .replace(/\b(pos|debit|credit|purchase|card \d+|#\d+|\d{2}\/\d{2})\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80) || description.trim();
}
