import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: settings } = await admin.from("user_settings").select("user_id").limit(1).single();
if (!settings) throw new Error("no user_settings row");
const userId = settings.user_id as string;

const $ = (d: number) => Math.round(d * 100);
type Row = { name: string; category: string; amount_cents?: number | null; amount_min_cents?: number; amount_max_cents?: number; pct_of_income?: number; merchant_pattern?: string | null; due_day?: number | null; is_reimbursed?: boolean };
const rows: Row[] = [
  { name: "Rent (Dover Glen)", category: "Housing", amount_cents: $(1300), merchant_pattern: "DoverGlen", due_day: 1 },
  { name: "Electric (NES)", category: "Utilities", amount_cents: null, merchant_pattern: "NES ELECTRIC", due_day: 9 },
  { name: "Renters insurance (ePremium)", category: "Insurance", amount_cents: $(33), merchant_pattern: "EPREMIUM", due_day: 2 },
  { name: "Groceries", category: "Groceries", amount_min_cents: $(200), amount_max_cents: $(300), merchant_pattern: null },
  { name: "Car loan", category: "Transfer", amount_cents: $(337.98), merchant_pattern: "To Auto Loan", due_day: 9 },
  { name: "Car gas", category: "Transport", amount_cents: $(100), merchant_pattern: null },
  { name: "Car insurance (Progressive)", category: "Insurance", amount_cents: $(200), merchant_pattern: "PROGRESSIVE INS", due_day: 9 },
  { name: "Health insurance (TRICARE)", category: "Health", amount_cents: $(50), merchant_pattern: "TRICARE" },
  { name: "Dental (United Concordia)", category: "Health", amount_cents: $(8.79), merchant_pattern: "CONCORDIA", due_day: 23 },
  { name: "Tithe", category: "Giving", pct_of_income: 10, merchant_pattern: "WAYCHURCH" },
  { name: "Gym (TruFit)", category: "Fitness", amount_cents: $(44), merchant_pattern: "TRUFIT" },
  { name: "HeyReach", category: "Business", amount_cents: $(80), merchant_pattern: "HEYREACH" },
  { name: "PlayStation", category: "Entertainment", amount_cents: $(18), merchant_pattern: "PLAYSTATION", due_day: 2 },
  { name: "T-Mobile", category: "Utilities", amount_cents: $(16), merchant_pattern: "TMOBILE", due_day: 29 },
  { name: "Compassion International", category: "Giving", amount_cents: $(50), merchant_pattern: "COMPASSION", due_day: 18 },
  { name: "Internet (AT&T)", category: "Utilities", amount_cents: $(60), merchant_pattern: "ATT*BILL", due_day: 29 },
  { name: "Netflix", category: "Subscriptions", amount_cents: $(30), merchant_pattern: "Netflix", due_day: 23 },
  { name: "FPL (reimbursed)", category: "Reimbursed", amount_min_cents: $(70), amount_max_cents: $(100), merchant_pattern: "FPL", is_reimbursed: true },
  { name: "Breezeline (reimbursed)", category: "Reimbursed", amount_cents: $(50), merchant_pattern: "BREEZELINE", is_reimbursed: true },
];

const { data: existing, error: e0 } = await admin.from("planned_expenses").select("id,name").eq("user_id", userId);
if (e0) throw new Error(`planned_expenses: ${e0.message} — run migration 0004 first`);
const byName = new Map((existing ?? []).map((r: any) => [r.name, r.id]));
let inserted = 0, updated = 0;
for (const [i, r] of rows.entries()) {
  const row = { user_id: userId, sort: i, amount_cents: null, amount_min_cents: null, amount_max_cents: null, pct_of_income: null, merchant_pattern: null, due_day: null, is_reimbursed: false, ...r };
  const id = byName.get(r.name);
  const q = id ? admin.from("planned_expenses").update(row).eq("id", id) : admin.from("planned_expenses").insert(row);
  const { error } = await q;
  if (error) throw error;
  id ? updated++ : inserted++;
}
console.log(`plan seeded: ${inserted} inserted, ${updated} updated`);

// Reimbursed items never count as spending.
const { data: recat, error: e1 } = await admin
  .from("transactions")
  .update({ category: "Reimbursed", is_transfer: true, category_source: "rule" })
  .eq("user_id", userId)
  .neq("category_source", "manual")
  .or("merchant.ilike.%FPL DIRECT%,merchant.ilike.%BREEZELINE%")
  .select("id");
if (e1) throw e1;
console.log(`recategorized as Reimbursed: ${recat?.length ?? 0}`);
for (const [pattern, cat] of [["FPL DIRECT", "Reimbursed"], ["BREEZELINE", "Reimbursed"]]) {
  const { data: has } = await admin.from("category_rules").select("id").eq("user_id", userId).ilike("merchant_pattern", pattern).maybeSingle();
  if (!has) await admin.from("category_rules").insert({ user_id: userId, merchant_pattern: pattern, category: cat, is_transfer: true });
}
