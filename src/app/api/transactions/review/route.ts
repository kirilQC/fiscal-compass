import { withUser } from "@/lib/api";
import { computePlan, expectedCents, getPlanRows } from "@/lib/plan";
import { logoKey, logoUrls } from "@/lib/logos";
import { DISCRETIONARY_CATEGORIES, essentialPatterns, matchesPatterns, needsVerify, normalizeMerchant, spendClass, tagMemory } from "@/lib/spend";

export interface ReviewGroup {
  key: string;
  merchant: string;
  category: string;
  count: number;
  totalCents: number;
  lastOn: string;
  ids: string[];
  logoUrl: string | null;
}

export interface PlanSuggestion {
  txnId: string;
  merchant: string;
  amountCents: number;
  postedOn: string;
  planItemId: string;
  planItemName: string;
  expectedCents: number;
  logoUrl: string | null;
}

export interface Review {
  suggestions: PlanSuggestion[];
  verify: ReviewGroup[];
  untagged: ReviewGroup[];
}

type Row = { id: string; posted_on: string; merchant: string; amount_cents: number; category: string; is_transfer: boolean; is_income: boolean; spend_class: string | null };

function group(rows: Row[], logos: Map<string, string>): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const t of rows) {
    const key = normalizeMerchant(t.merchant);
    const g: ReviewGroup = groups.get(key) ?? { key, merchant: t.merchant, category: t.category, count: 0, totalCents: 0, lastOn: t.posted_on, ids: [], logoUrl: logos.get(logoKey(t.merchant)) ?? null };
    g.count += 1;
    g.totalCents -= t.amount_cents;
    g.ids.push(t.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.lastOn.localeCompare(a.lastOn));
}

// A charge close to an unpaid bill's amount is probably that bill under a merchant name the plan does not know yet.
function nearAmount(cents: number, expected: number, min: number | null, max: number | null) {
  if (min != null && max != null) return cents >= min * 0.95 && cents <= max * 1.05;
  return expected > 0 && Math.abs(cents - expected) <= Math.max(expected * 0.1, 200);
}

// Everything the Spending page asks Kiril about: likely bill payments, Zelle/Cash App to confirm, and unclear charges.
export async function GET() {
  return withUser(async ({ supabase, userId }): Promise<Review> => {
    const now = new Date();
    const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
    const graceStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), -3)).toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const [{ data, error }, planRows, { data: tagged }, logos] = await Promise.all([
      supabase
        .from("transactions")
        .select("id,posted_on,merchant,amount_cents,category,is_transfer,is_income,spend_class")
        .eq("user_id", userId)
        .lt("amount_cents", 0)
        .gte("posted_on", since)
        .order("posted_on", { ascending: false })
        .limit(5000),
      getPlanRows(supabase, userId),
      supabase.from("transactions").select("merchant,spend_class,posted_on").eq("user_id", userId).not("spend_class", "is", null).limit(5000),
      logoUrls(supabase, userId),
    ]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    const classifier = { patterns: essentialPatterns(planRows), memory: tagMemory(tagged ?? []) };

    const recent = rows.filter((t) => t.posted_on >= graceStart);
    const plan = computePlan(planRows, recent, 0, now);
    const claimed = new Set(plan.items.flatMap((i) => i.matchedTxnIds));
    const suggestions: PlanSuggestion[] = [];
    const suggested = new Set<string>();
    for (const item of plan.items) {
      const row = planRows.find((r) => r.id === item.id);
      if (!row || item.isReimbursed || item.status === "paid" || item.status === "varies") continue;
      const expected = expectedCents(row, 0) || item.expectedCents;
      const from = row.due_day != null && row.due_day <= 3 ? graceStart : monthStart;
      const candidates = recent.filter(
        (t) =>
          t.posted_on >= from &&
          !claimed.has(t.id) &&
          !matchesPatterns(t.merchant, classifier.patterns) &&
          !suggested.has(t.id) &&
          !t.spend_class &&
          !t.is_transfer &&
          !(DISCRETIONARY_CATEGORIES.has(t.category) && t.category !== "Subscriptions" && t.category !== "Payments to People") &&
          nearAmount(-t.amount_cents, expected, row.amount_min_cents, row.amount_max_cents),
      );
      const best = candidates.sort((a, b) => Math.abs(-a.amount_cents - expected) - Math.abs(-b.amount_cents - expected))[0];
      if (!best) continue;
      suggested.add(best.id);
      suggestions.push({ txnId: best.id, merchant: best.merchant, amountCents: -best.amount_cents, postedOn: best.posted_on, planItemId: item.id, planItemName: item.name, expectedCents: expected, logoUrl: logos.get(logoKey(best.merchant)) ?? null });
    }

    const open = rows.filter((t) => !t.spend_class && !suggested.has(t.id) && !claimed.has(t.id));
    return {
      suggestions,
      verify: group(open.filter((t) => spendClass(t, classifier) === "discretionary" && needsVerify(t) && !classifier.memory.has(normalizeMerchant(t.merchant))), logos),
      untagged: group(open.filter((t) => spendClass(t, classifier) === "untagged"), logos),
    };
  });
}
