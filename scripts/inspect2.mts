import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const { data: accounts } = await admin.from("accounts").select("id,institution,name,kind,last4,provider_account_id,created_at").order("created_at");
const { data: bals } = await admin.from("balances_daily").select("account_id,balance_cents");
const bal = new Map((bals ?? []).map((b: any) => [b.account_id, b.balance_cents]));
for (const a of accounts as any[]) {
  const { count } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", a.id);
  let fc: any = null;
  try { fc = await stripe.financialConnections.accounts.retrieve(a.provider_account_id); } catch (e) { fc = { error: (e as Error).message }; }
  console.log(`\n${a.institution} ${a.name} [${a.kind}] ****${a.last4} created ${a.created_at.slice(11,19)} txns=${count} bal=${bal.get(a.id) ?? "none"}`);
  if (fc.error) console.log("  stripe:", fc.error);
  else console.log("  stripe:", fc.category, "/", fc.subcategory, "| status", fc.status, "| balance", JSON.stringify(fc.balance?.current), "| cash", JSON.stringify(fc.balance?.cash?.available), "| credit", JSON.stringify(fc.balance?.credit), "| refresh", fc.balance_refresh?.status, fc.transaction_refresh?.status, "| subs", JSON.stringify(fc.subscriptions));
}
const { data: chase } = await admin.from("transactions").select("posted_on,amount_cents,merchant,category,is_income,is_transfer,status,accounts!inner(name,kind)").neq("accounts.kind","investment").order("posted_on",{ascending:false}).limit(40);
console.log("\n== Chase transactions sample");
for (const t of chase as any[]) console.log(t.posted_on, String(t.amount_cents).padStart(9), t.accounts.name.slice(0,12).padEnd(12), "|", t.merchant.slice(0,50).padEnd(50), "|", t.category, t.is_income?"INCOME":"", t.is_transfer?"TRANSFER":"", t.status);
const { data: cats } = await admin.from("transactions").select("category");
const c: Record<string, number> = {}; for (const r of cats as any[]) c[r.category]=(c[r.category]??0)+1; console.log("\ncategories:", c);
