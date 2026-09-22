import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const { data: accounts } = await admin.from("accounts").select("name,kind,is_active,provider_account_id").eq("provider", "stripe");
for (const a of accounts ?? []) {
  if (!a.provider_account_id) continue;
  let fc = await stripe.financialConnections.accounts.retrieve(a.provider_account_id);
  if (a.is_active && !fc.subscriptions?.includes("transactions")) {
    try {
      fc = await stripe.financialConnections.accounts.subscribe(a.provider_account_id, { features: ["transactions"] });
    } catch (e) {
      console.log(`${a.name}: subscribe failed — ${(e as Error).message}`);
    }
  }
  console.log(`${a.name} [${a.kind}]${a.is_active ? "" : " hidden"} → subscriptions: ${JSON.stringify(fc.subscriptions ?? [])} | last txn refresh: ${fc.transaction_refresh?.last_attempted_at ? new Date(fc.transaction_refresh.last_attempted_at * 1000).toISOString().slice(0, 10) : "never"} | last balance refresh: ${fc.balance_refresh?.last_attempted_at ? new Date(fc.balance_refresh.last_attempted_at * 1000).toISOString().slice(0, 10) : "never"}`);
}
