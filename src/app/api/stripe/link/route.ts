import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAccountKind, stripe } from "@/lib/stripe";
import { syncAccount } from "@/lib/sync";

const Body = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const { sessionId } = await parseBody(request, Body);
    const s = stripe();
    const session = await s.financialConnections.sessions.retrieve(sessionId, { expand: ["accounts"] });
    const linked: string[] = [];
    for (const fc of session.accounts.data) {
      const { data, error } = await supabase
        .from("accounts")
        .upsert(
          {
            user_id: userId,
            provider: "stripe",
            provider_account_id: fc.id,
            institution: fc.institution_name,
            name: fc.display_name ?? fc.subcategory,
            kind: mapAccountKind(fc),
            last4: fc.last4,
            is_active: true,
          },
          { onConflict: "user_id,provider,provider_account_id" },
        )
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      linked.push(data.id);
      try {
        await s.financialConnections.accounts.subscribe(fc.id, { features: ["transactions"] });
      } catch {
        // Transactions must be enabled for the Stripe account; balances still sync without it.
      }
    }
    const admin = createAdminClient();
    const results = await Promise.all(linked.map((id) => syncAccount(admin, id)));
    return { linked: linked.length, results };
  });
}
