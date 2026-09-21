import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAccount } from "@/lib/sync";
import { revalidateDashboard } from "@/lib/cache";

export async function POST(request: Request) {
  revalidateDashboard();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhooks not configured" }, { status: 503 });
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad signature" }, { status: 400 });
  }

  if (
    event.type === "financial_connections.account.refreshed_balance" ||
    event.type === "financial_connections.account.refreshed_transactions"
  ) {
    const fc = event.data.object as Stripe.FinancialConnections.Account;
    const admin = createAdminClient();
    const { data } = await admin.from("accounts").select("id").eq("provider", "stripe").eq("provider_account_id", fc.id).maybeSingle();
    if (data?.id) await syncAccount(admin, data.id);
  } else if (event.type === "financial_connections.account.disconnected" || event.type === "financial_connections.account.deactivated") {
    const fc = event.data.object as Stripe.FinancialConnections.Account;
    const admin = createAdminClient();
    await admin.from("accounts").update({ is_active: false }).eq("provider", "stripe").eq("provider_account_id", fc.id);
  }
  return NextResponse.json({ received: true });
}
