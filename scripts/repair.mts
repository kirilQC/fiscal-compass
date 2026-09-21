// One-off repair for the first real link: dedupe accounts, fix kinds/names, and recategorize everything.
import { createClient } from "@supabase/supabase-js";
import { categorize, categorizeMerchantsWithAI, normalizeMerchant, type Rule } from "../src/lib/categorize.ts";

const NAME_MAP: Record<string, string> = {
  "premier plus ckg": "Premier Plus Checking",
  "premier savings": "Premier Savings",
  "credit card": "Credit Card",
  "chase auto account": "Auto Loan",
  individual: "Individual Brokerage",
};
function prettyAccountName(raw: string): string {
  const mapped = NAME_MAP[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  return raw.toLowerCase().split(/\s+/).map((w) => (w === "ckg" ? "Checking" : w === "svg" ? "Savings" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: accounts } = await admin.from("accounts").select("id,user_id,institution,name,kind,last4,created_at").order("created_at");
if (!accounts?.length) throw new Error("no accounts");
const userId = accounts[0].user_id as string;

// 1. Duplicates: same institution+last4+kind, keep the one with transactions (or the newest).
const groups = new Map<string, typeof accounts>();
for (const a of accounts) {
  const k = `${a.institution}|${a.last4}|${a.kind}`;
  groups.set(k, [...(groups.get(k) ?? []), a]);
}
let removed = 0;
for (const [, list] of groups) {
  if (list.length < 2) continue;
  const withCounts = await Promise.all(
    list.map(async (a) => {
      const { count } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", a.id);
      return { a, count: count ?? 0 };
    }),
  );
  withCounts.sort((x, y) => y.count - x.count || y.a.created_at.localeCompare(x.a.created_at));
  for (const { a, count } of withCounts.slice(1)) {
    await admin.from("accounts").delete().eq("id", a.id);
    removed++;
    console.log(`removed duplicate ${a.institution} ${a.name} ****${a.last4} (${count} txns)`);
  }
}

// 2. Kinds and names.
const { data: remaining } = await admin.from("accounts").select("id,institution,name,kind,last4").order("created_at");
for (const a of remaining ?? []) {
  const patch: Record<string, unknown> = {};
  if (/auto|loan/i.test(a.name) && a.kind !== "loan") patch.kind = "loan";
  const pretty = prettyAccountName(a.name);
  if (pretty !== a.name) patch.name = pretty;
  if (Object.keys(patch).length) {
    await admin.from("accounts").update(patch).eq("id", a.id);
    console.log(`account ${a.name} →`, patch);
  }
}

// 3 + 4. Recategorize all non-manual transactions with the new pipeline.
const { data: accts } = await admin.from("accounts").select("id,kind");
const kindOf = new Map((accts ?? []).map((a) => [a.id, a.kind as string]));
const { data: rules } = await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income").eq("user_id", userId);
const { data: txns } = await admin
  .from("transactions")
  .select("id,account_id,merchant,amount_cents,category,is_transfer,is_income,category_source")
  .eq("user_id", userId)
  .limit(10000);

const before: Record<string, number> = {};
for (const t of txns ?? []) before[t.category] = (before[t.category] ?? 0) + 1;

let changed = 0;
const updates: Array<{ id: string; category: string; category_source: string; is_transfer: boolean; is_income: boolean }> = [];
for (const t of txns ?? []) {
  if (t.category_source === "manual") continue;
  const c = categorize(t.merchant, (rules ?? []) as Rule[], { accountKind: kindOf.get(t.account_id), amountCents: t.amount_cents });
  if (c.category !== t.category || c.isTransfer !== t.is_transfer || c.isIncome !== t.is_income) {
    updates.push({ id: t.id, category: c.category, category_source: c.source, is_transfer: c.isTransfer, is_income: c.isIncome });
  }
}
for (const u of updates) {
  await admin.from("transactions").update({ category: u.category, category_source: u.category_source, is_transfer: u.is_transfer, is_income: u.is_income }).eq("id", u.id);
  changed++;
}
console.log(`keyword pass: ${changed} transactions updated`);

// AI pass over what is still Other.
const { data: unknown } = await admin
  .from("transactions")
  .select("id,merchant")
  .eq("user_id", userId)
  .eq("category", "Other")
  .neq("category_source", "manual")
  .eq("is_transfer", false);
const byNorm = new Map<string, string[]>();
for (const t of unknown ?? []) byNorm.set(normalizeMerchant(t.merchant), [...(byNorm.get(normalizeMerchant(t.merchant)) ?? []), t.id]);
const have = new Set((rules ?? []).map((r) => r.merchant_pattern.toUpperCase()));
const ask = [...byNorm.keys()].filter((n) => !have.has(n));
console.log(`asking AI about ${ask.length} merchants`);
const answers = await categorizeMerchantsWithAI(ask);
let aiApplied = 0;
const newRules: Record<string, unknown>[] = [];
for (const [norm, ans] of Object.entries(answers)) {
  if (ans.category === "Other") continue;
  newRules.push({ user_id: userId, merchant_pattern: norm, category: ans.category, is_transfer: ans.isTransfer, is_income: ans.isIncome });
  const ids = byNorm.get(norm) ?? [];
  if (ids.length) {
    await admin.from("transactions").update({ category: ans.category, category_source: "ai", is_transfer: ans.isTransfer, is_income: ans.isIncome }).in("id", ids);
    aiApplied += ids.length;
  }
}
if (newRules.length) await admin.from("category_rules").insert(newRules);
console.log(`ai pass: ${aiApplied} transactions updated, ${newRules.length} rules saved`);

const { data: after } = await admin.from("transactions").select("category,merchant,is_transfer").eq("user_id", userId).limit(10000);
const afterCounts: Record<string, number> = {};
const otherMerchants: Record<string, number> = {};
for (const t of after ?? []) {
  afterCounts[t.category] = (afterCounts[t.category] ?? 0) + 1;
  if (t.category === "Other" && !t.is_transfer) otherMerchants[t.merchant] = (otherMerchants[t.merchant] ?? 0) + 1;
}
console.log("before:", before);
console.log("after:", afterCounts);
console.log("remaining Other merchants:", Object.entries(otherMerchants).sort((a, b) => b[1] - a[1]).slice(0, 15));

await admin.from("sync_runs").insert({ user_id: userId, finished_at: new Date().toISOString(), status: "repair", detail: { removed, changed, aiApplied, rules: newRules.length } });
console.log(`done: removed ${removed} duplicate accounts`);
