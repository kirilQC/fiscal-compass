import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { AccountKind } from "./types";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!client) client = new Stripe(env("STRIPE_SECRET_KEY"));
  return client;
}

export async function getOrCreateCustomer(supabase: SupabaseClient, userId: string, email: string | undefined) {
  const { data } = await supabase.from("stripe_customers").select("customer_id").eq("user_id", userId).maybeSingle();
  if (data?.customer_id) return data.customer_id as string;
  const customer = await stripe().customers.create({ email, metadata: { user_id: userId } });
  await supabase.from("stripe_customers").insert({ user_id: userId, customer_id: customer.id });
  return customer.id;
}

export function mapAccountKind(a: Stripe.FinancialConnections.Account): AccountKind {
  switch (a.category) {
    case "cash":
      return a.subcategory === "savings" ? "savings" : "checking";
    case "credit":
      return a.subcategory === "mortgage" ? "loan" : "credit";
    case "investment":
      return "investment";
    default:
      return "other";
  }
}

// Stripe reports balance.current as positive when owed to the holder and negative when owed by
// the holder, so liabilities already arrive negative and are stored as-is.
export function currentBalanceCents(a: Stripe.FinancialConnections.Account): number | null {
  const cur = a.balance?.current;
  if (!cur) return null;
  const v = cur.usd ?? Object.values(cur)[0];
  return typeof v === "number" ? v : null;
}
