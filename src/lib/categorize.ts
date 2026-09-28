import OpenAI from "openai";

import { CATEGORIES, INTERNAL_MOVE_RE, normalizeMerchant, type Category } from "./spend";

export { CATEGORIES, normalizeMerchant, type Category };

export interface Rule {
  merchant_pattern: string;
  category: string;
  is_transfer: boolean;
  is_income: boolean;
}

export interface Categorized {
  category: string;
  source: "rule" | "provider" | "ai";
  isTransfer: boolean;
  isIncome: boolean;
}

export interface CategorizeContext {
  accountKind?: string;
  amountCents?: number;
}

type Hit = { category: Category; isTransfer?: boolean; isIncome?: boolean };

const TRANSFER: Hit = { category: "Transfer", isTransfer: true };
// Paid by Kiril and paid back later: still spending (essential), shown under its own category.
const REIMBURSED: Hit = { category: "Reimbursed" };

// Order matters: internal moves and income first so "payment" merchants never land in a spend bucket.
const KEYWORDS: Array<[RegExp, Hit]> = [
  [/\bfpl\b|fpl direct|breezeline/i, REIMBURSED],
  [INTERNAL_MOVE_RE, TRANSFER],
  [/to auto loan|loan payment|sunbit/i, { category: "Loan Payment" }],
  [/pintes investment/i, { category: "Housing" }],
  [/kings crossing/i, { category: "Wedding" }],
  [/barrington barber/i, { category: "Personal Care" }],
  [/zelle|venmo|cash app|paypal/i, { category: "Payments to People" }],
  [/withdrawal|\batm\b|funds transfer paid \(cash\)/i, { category: "Cash" }],
  [/payroll|gusto|direct dep|dir dep|salary|paycheck|interest payment/i, { category: "Income", isIncome: true }],
  [/interest charge|late fee|annual fee|foreign transaction|overdraft|service fee|finance charge/i, { category: "Fees & Interest" }],
  [/kroger|whole foods|publix|aldi|trader joe|supermercado|carniceria|safeway|costco|wegmans|h-e-b|food lion|sprouts|grocery|market\b/i, { category: "Groceries" }],
  [/ihop|taco bell|dunkin|tst\*|fat mo|cafe|coffee|hibachi|grill|pizza|chick-fil|mcdonald|starbucks|doordash|uber eats|grubhub|sweetgreen|chipotle|restaurant|sushi|burger|wendy|sonic|panera|subway|waffle house|cracker barrel|bakery|deli\b|bistro|kitchen|tavern|brew/i, { category: "Dining" }],
  [/mapco|shell|exxon|\bbp\b|7-eleven|chevron|circle k|speedway|marathon|uber(?! eats)|lyft|parking|transit|metro|toll|wash|jiffy lube|autozone|o'reilly|discount tire/i, { category: "Transport" }],
  [/amazon|amzn|target|walmart|boot factory|best buy|ikea|nike|apple store|home depot|lowe's|etsy|ebay|old navy|gap\b|marshalls|tj maxx|ross\b|dollar/i, { category: "Shopping" }],
  [/netflix|spotify|apple\.com|microsoft\*|hulu|youtube|disney|hbo|max\b|icloud|adobe|paramount|peacock|audible|kindle|patreon|prime video/i, { category: "Subscriptions" }],
  [/nes electric|breezeline|comcast|xfinity|at&t|verizon|t-mobile|water|gas bill|electric|utility|piedmont|spectrum|internet/i, { category: "Utilities" }],
  [/\brent\b|mortgage|landlord|apartments|property mgmt|hoa\b/i, { category: "Housing" }],
  [/progressive|geico|state farm|allstate|\bins\b|insurance|liberty mutual|usaa/i, { category: "Insurance" }],
  [/trufit|planet fitness|\bgym\b|club fees|crossfit|ymca|orangetheory|anytime fitness/i, { category: "Fitness" }],
  [/waychurch|church|compassion internation|tithe|donat|charity|ministr|red cross|gofundme/i, { category: "Giving" }],
  [/vercel|cursor|google \*cloud|google\*google services|google \*google|heyreach|openai|openrouter|anthropic|supabase|github|notion|slack|zoom|clay\b|lemlist|linkedin|apollo|hubspot|godaddy|namecheap|aws|amazon web services|figma|canva|calendly|loom|ring\.com/i, { category: "Subscriptions" }],
  [/turn their heads|dance studio|dance class/i, { category: "Entertainment" }],
  [/wgu|udemy|coursera|tuition/i, { category: "Education" }],
  [/pharmacy|cvs|walgreens|dental|medical|clinic|hospital|doctor|urgent care|optometr|vision|labcorp|quest diag/i, { category: "Health" }],
  [/salon|barber|spa\b|nails|haircut|massage|great clips|supercuts|sephora|ulta/i, { category: "Personal Care" }],
  [/cinema|amc\b|regal|theater|theatre|steam|playstation|xbox|nintendo|ticketmaster|eventbrite|bowling|topgolf|museum|zoo\b|concert/i, { category: "Entertainment" }],
  [/airbnb|hotel|marriott|hilton|hyatt|airline|delta air|united air|american air|southwest|expedia|booking\.com|vrbo|amtrak|hertz|enterprise rent|avis|rental car/i, { category: "Travel" }],
];

export function categorize(merchant: string, rules: Rule[], ctx: CategorizeContext = {}): Categorized {
  if (ctx.accountKind === "investment" || ctx.accountKind === "loan") {
    return { category: "Transfer", source: "provider", isTransfer: true, isIncome: false };
  }
  const m = merchant.toLowerCase();
  for (const r of rules) {
    if (m.includes(r.merchant_pattern.toLowerCase())) {
      return { category: r.category, source: "rule", isTransfer: r.is_transfer, isIncome: r.is_income };
    }
  }
  for (const [re, hit] of KEYWORDS) {
    if (re.test(merchant)) {
      if (hit.isIncome && (ctx.amountCents ?? 1) < 0) continue;
      return { category: hit.category, source: "provider", isTransfer: !!hit.isTransfer, isIncome: !!hit.isIncome };
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

// Collapses store numbers, reference ids, phone numbers and city/state so one rule covers a merchant.

export interface AiCategory {
  category: string;
  isTransfer: boolean;
  isIncome: boolean;
}

export async function categorizeMerchantsWithAI(merchants: string[]): Promise<Record<string, AiCategory>> {
  const list = [...new Set(merchants.filter(Boolean))].slice(0, 150);
  if (list.length === 0 || !process.env.OPENAI_API_KEY) return {};
  try {
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await ai.responses.create({
      model: process.env.OPENAI_CATEGORY_MODEL ?? "gpt-5-mini",
      instructions: `You classify bank-statement merchant strings for a personal budget in the US. Reply with ONLY a JSON object mapping each input string exactly as given to {"category": one of ${JSON.stringify(CATEGORIES)}, "isTransfer": boolean, "isIncome": boolean}. "Transfer" (isTransfer true) ONLY for money moving between the person's own accounts: credit card payments, brokerage sweeps, transfers to their own savings. Payments to other people (Zelle, Venmo, Cash App) are "Payments to People", loan payments are "Loan Payment", ATM or cash withdrawals are "Cash"; none of these are transfers. Software, SaaS, AI tools and cloud hosting are "Subscriptions" (there is no business category; this is a personal budget). "Income" only for payroll/salary/deposits from employers. Use "Other" only when truly unknowable.`,
      input: JSON.stringify(list),
    });
    const text = res.output_text?.trim() ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Record<string, Partial<AiCategory>>;
    const out: Record<string, AiCategory> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const category = (CATEGORIES as readonly string[]).includes(v?.category ?? "") ? (v!.category as string) : "Other";
      out[k] = {
        category,
        isTransfer: category === "Transfer" || !!v?.isTransfer,
        isIncome: category === "Income" || !!v?.isIncome,
      };
    }
    return out;
  } catch {
    return {};
  }
}
