// One-off: no Business category, `is_transfer` only for moves between own accounts, TRICARE/rent/HeyReach per Kiril.
// Re-derives category and transfer flag for every transaction not categorized by hand. DRY=1 prints changes only.
import { createClient } from "@supabase/supabase-js";
import { categorize, type Rule } from "../src/lib/categorize.ts";

const DRY = process.env.DRY === "1";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = async (label: string, q: PromiseLike<{ error: { message: string } | null }>) => {
  if (DRY) return console.log("would:", label);
  const { error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log("done:", label);
};

const RULE_FIX: Record<string, { category: string; is_transfer: boolean }> = {
  "OPENROUTER INC OPENROUTER.AI": { category: "Subscriptions", is_transfer: false },
  "OPENROUTER INC": { category: "Subscriptions", is_transfer: false },
  "SP STORE-GRAPHQL": { category: "Shopping", is_transfer: false },
  "SQ CONFERENCE": { category: "Other", is_transfer: false },
  FREETAXUSACOM: { category: "Fees & Interest", is_transfer: false },
  "SUNBIT_CENTURY_KIA_OF_T TAMPA": { category: "Loan Payment", is_transfer: false },
  "HGB TRS TRR": { category: "Health", is_transfer: false },
  WITHDRAWAL: { category: "Cash", is_transfer: false },
  "FPL DIRECT": { category: "Reimbursed", is_transfer: false },
  BREEZELINE: { category: "Reimbursed", is_transfer: false },
  "NBS-WGU": { category: "Education", is_transfer: false },
};
// Any other rule flagged as a transfer keeps its category and loses the flag, unless it is a genuine internal move.
const fixFor = (r: { merchant_pattern: string; category: string; is_transfer: boolean }) =>
  RULE_FIX[r.merchant_pattern.toUpperCase()] ??
  (r.category === "Business" ? { category: "Subscriptions", is_transfer: false } : null) ??
  (r.is_transfer && r.category !== "Transfer" ? { category: r.category, is_transfer: false } : null);
const { data: rules } = await admin.from("category_rules").select("id,user_id,merchant_pattern,category,is_transfer,is_income");
for (const r of rules ?? []) {
  const fix = fixFor(r);
  if (fix && (fix.category !== r.category || fix.is_transfer !== r.is_transfer)) {
    await run(`rule ${r.merchant_pattern}: ${r.category}${r.is_transfer ? "/transfer" : ""} → ${fix.category}`, admin.from("category_rules").update(fix).eq("id", r.id));
  }
}
const userId = rules?.[0]?.user_id ?? (await admin.from("accounts").select("user_id").limit(1).single()).data!.user_id;
const have = new Set((rules ?? []).map((r) => r.merchant_pattern.toUpperCase()));
for (const [pattern, category] of [["KINGS CROSSING", "Housing"], ["PINTES INVESTMENT", "Housing"], ["TURN THEIR HEADS", "Entertainment"], ["HEYREACH", "Subscriptions"]] as const) {
  if (!have.has(pattern)) await run(`add rule ${pattern} → ${category}`, admin.from("category_rules").insert({ user_id: userId, merchant_pattern: pattern, category, is_transfer: false, is_income: false }));
}

const { data: plan } = await admin.from("planned_expenses").select("id,name,merchant_pattern,amount_cents,is_active");
for (const p of plan ?? []) {
  if (p.merchant_pattern === "TRICARE") await run(`plan ${p.name}: pattern HGB TRS TRR, $57.88`, admin.from("planned_expenses").update({ merchant_pattern: "HGB TRS TRR", amount_cents: 5788 }).eq("id", p.id));
  if (p.merchant_pattern === "HEYREACH" && p.is_active) await run(`plan ${p.name}: deactivate (discretionary subscription)`, admin.from("planned_expenses").update({ is_active: false }).eq("id", p.id));
}

const { data: freshRules } = DRY ? { data: rules } : await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income");
const ruleList: Rule[] = (freshRules ?? []).map((r) => ({ ...r, ...(DRY ? fixFor(r) ?? {} : {}) }));
for (const [pattern, category] of [["KINGS CROSSING", "Housing"], ["PINTES INVESTMENT", "Housing"], ["TURN THEIR HEADS", "Entertainment"]]) if (DRY) ruleList.push({ merchant_pattern: pattern, category, is_transfer: false, is_income: false });
const { data: accounts } = await admin.from("accounts").select("id,kind");
const kind = new Map((accounts ?? []).map((a) => [a.id, a.kind]));
const { data: txns } = await admin.from("transactions").select("id,account_id,merchant,amount_cents,category,category_source,is_transfer,is_income").limit(20000);
const changes = new Map<string, number>();
let updated = 0;
for (const t of txns ?? []) {
  if (t.category_source === "manual" && t.category !== "Business") continue;
  const c = categorize(t.merchant, ruleList, { accountKind: kind.get(t.account_id), amountCents: t.amount_cents });
  // An AI answer with no rule behind it keeps its category; only the transfer flag is re-derived.
  const category = c.category === "Other" && t.category_source === "ai" ? t.category : c.category;
  const isTransfer = c.isTransfer;
  if (category === t.category && isTransfer === t.is_transfer) continue;
  const key = `${t.category}${t.is_transfer ? "/T" : ""} → ${category}${isTransfer ? "/T" : ""}  ${t.merchant.replace(/\d{5,}.*$/, "").slice(0, 32)}`;
  changes.set(key, (changes.get(key) ?? 0) + 1);
  updated++;
  if (!DRY) {
    const { error } = await admin.from("transactions").update({ category, is_transfer: isTransfer, ...(t.category === "Business" && t.category_source === "manual" ? { category_source: "rule" } : {}) }).eq("id", t.id);
    if (error) throw new Error(error.message);
  }
}
for (const [k, n] of [...changes].sort()) console.log(String(n).padStart(3), k);
console.log(DRY ? "would update" : "updated", updated, "transactions");
