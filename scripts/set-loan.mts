import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: loan } = await admin.from("accounts").select("id,user_id,name,is_active").eq("kind", "loan").single();
if (!loan) throw new Error("no loan account");
await admin.from("accounts").update({ loan_payment_cents: 33798, loan_payments_left: 21, loan_apr: null }).eq("id", loan.id);
const { error } = await admin.from("balances_daily").upsert({ account_id: loan.id, user_id: loan.user_id, as_of: new Date().toISOString().slice(0, 10), balance_cents: -694400 });
console.log(error ?? `loan ${loan.name} set to -6944.00, payment 337.98`);
const { data: acc } = await admin.from("accounts").select("name,kind,is_active");
console.log(acc);
