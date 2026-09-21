import { withUser } from "@/lib/api";
import { getOrCreateCustomer, stripe } from "@/lib/stripe";

export async function POST() {
  return withUser(async ({ supabase, userId, email }) => {
    const customer = await getOrCreateCustomer(supabase, userId, email);
    const session = await stripe().financialConnections.sessions.create({
      account_holder: { type: "customer", customer },
      permissions: ["balances", "transactions", "ownership"],
      prefetch: ["balances", "transactions"],
      filters: { countries: ["US"] },
    });
    return { clientSecret: session.client_secret, sessionId: session.id };
  });
}
