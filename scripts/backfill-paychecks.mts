import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PAYROLL_RE = /payroll|gusto|direct dep|\badp\b|paychex|rippling|justworks/i;
const { data: users } = await admin.from("accounts").select("user_id").limit(1);
const userId = users?.[0]?.user_id!;
const { data: deposits } = await admin.from("transactions").select("id,posted_on,amount_cents,merchant").eq("user_id", userId).gt("amount_cents", 0).eq("status", "posted").limit(2000);
const payroll = (deposits ?? []).filter((t) => PAYROLL_RE.test(t.merchant));
const { data: existing } = await admin.from("paychecks").select("pay_date,net_cents,raw").eq("user_id", userId);
const seen = new Set<string>();
for (const p of existing ?? []) { const raw = p.raw as any; if (raw?.transaction_id) seen.add(raw.transaction_id); seen.add(`${p.pay_date}:${p.net_cents}`); }
const rows = payroll.filter((t) => !seen.has(t.id) && !seen.has(`${t.posted_on}:${t.amount_cents}`)).map((t) => ({
  user_id: userId, pay_date: t.posted_on, employer: t.merchant.replace(/\s*PPD ID:.*$/i, "").replace(/\s+/g, " ").trim(),
  gross_cents: t.amount_cents, net_cents: t.amount_cents, raw: { transaction_id: t.id },
}));
if (rows.length) { const { error } = await admin.from("paychecks").insert(rows); if (error) throw error; }
console.log("created", rows.length);
const { data } = await admin.from("paychecks").select("pay_date,net_cents,employer").eq("user_id", userId).order("pay_date", { ascending: false });
for (const p of data ?? []) console.log(p.pay_date, (p.net_cents / 100).toFixed(2), p.employer);
