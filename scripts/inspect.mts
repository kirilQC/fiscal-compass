import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const t = async (name: string, sel = "*", limit = 50) => {
  const { data, error } = await admin.from(name).select(sel).limit(limit);
  console.log(`\n== ${name} (${data?.length ?? 0})${error ? " ERROR " + error.message : ""}`);
  return data ?? [];
};
const accounts = await t("accounts", "id,provider,provider_account_id,institution,name,kind,last4,credit_limit_cents,is_active");
for (const a of accounts as any[]) console.log(a.institution, "|", a.name, "|", a.kind, "|", a.last4, "| limit", a.credit_limit_cents, "|", a.provider_account_id);
const bal = await t("balances_daily", "account_id,as_of,balance_cents");
for (const b of bal as any[]) console.log(b.as_of, b.account_id.slice(0,8), b.balance_cents);
const tx = await t("transactions", "posted_on,amount_cents,merchant,category,is_income,is_transfer,status", 15);
for (const x of tx as any[]) console.log(x.posted_on, x.amount_cents, x.merchant, "|", x.category, x.is_income?"income":"", x.is_transfer?"transfer":"", x.status);
const { count } = await admin.from("transactions").select("id", { count: "exact", head: true });
console.log("total transactions:", count);
const runs = await t("sync_runs", "started_at,finished_at,status,detail", 5);
for (const r of runs as any[]) console.log(r.started_at, r.status, JSON.stringify(r.detail).slice(0, 600));
await t("holdings"); await t("goals"); await t("budgets"); await t("paychecks"); await t("stripe_customers");
