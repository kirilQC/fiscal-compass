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
  const name = a.display_name ?? "";
  switch (a.category) {
    case "cash":
      return a.subcategory === "savings" ? "savings" : "checking";
    case "credit":
      if (a.subcategory === "mortgage") return "loan";
      if (a.subcategory === "credit_card" || a.subcategory === "line_of_credit") return "credit";
      return /auto|loan|mortgage/i.test(name) ? "loan" : "credit";
    case "investment":
      return "investment";
    default:
      return /auto|loan|mortgage/i.test(name) ? "loan" : "other";
  }
}

const NAME_MAP: Record<string, string> = {
  "premier plus ckg": "Premier Plus Checking",
  "premier savings": "Premier Savings",
  "credit card": "Credit Card",
  "chase auto account": "Auto Loan",
  individual: "Individual Brokerage",
};

export function prettyAccountName(raw: string | null | undefined, fallback = "Account"): string {
  const src = (raw ?? "").trim();
  if (!src) return fallback;
  const mapped = NAME_MAP[src.toLowerCase()];
  if (mapped) return mapped;
  return src
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (w === "ckg" || w === "chk") return "Checking";
      if (w === "svg" || w === "sav") return "Savings";
      if (w === "cc") return "Credit Card";
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function creditUsedCents(a: Stripe.FinancialConnections.Account): number | null {
  const used = a.balance?.credit?.used;
  if (!used) return null;
  const v = used.usd ?? Object.values(used)[0];
  return typeof v === "number" ? v : null;
}

// Stripe reports balance.current as positive when owed to the holder and negative when owed by
// the holder, so liabilities already arrive negative and are stored as-is.
export function currentBalanceCents(a: Stripe.FinancialConnections.Account): number | null {
  const cur = a.balance?.current;
  if (!cur) return null;
  const v = cur.usd ?? Object.values(cur)[0];
  return typeof v === "number" ? v : null;
}
