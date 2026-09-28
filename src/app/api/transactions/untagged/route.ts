import { withUser } from "@/lib/api";
import { normalizeMerchant, spendClass } from "@/lib/spend";
import { loadClassifier } from "@/lib/tags";

export interface UntaggedGroup {
  key: string;
  merchant: string;
  category: string;
  count: number;
  totalCents: number;
  lastOn: string;
  ids: string[];
}

// Charges the classifier is not sure about, grouped by merchant so one tag covers a recurring expense.
export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
    const [{ data, error }, classifier] = await Promise.all([
      supabase
        .from("transactions")
        .select("id,posted_on,merchant,amount_cents,category,is_transfer,is_income,spend_class")
        .eq("user_id", userId)
        .lt("amount_cents", 0)
        .is("spend_class", null)
        .gte("posted_on", since)
        .order("posted_on", { ascending: false })
        .limit(5000),
      loadClassifier(supabase, userId),
    ]);
    if (error) throw new Error(error.message);
    const groups = new Map<string, UntaggedGroup>();
    for (const t of data ?? []) {
      if (spendClass(t, classifier) !== "untagged") continue;
      const key = normalizeMerchant(t.merchant);
      const g: UntaggedGroup = groups.get(key) ?? { key, merchant: t.merchant, category: t.category, count: 0, totalCents: 0, lastOn: t.posted_on, ids: [] };
      g.count += 1;
      g.totalCents -= t.amount_cents;
      g.ids.push(t.id);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.lastOn.localeCompare(a.lastOn));
  });
}
