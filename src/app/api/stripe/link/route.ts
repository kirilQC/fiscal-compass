import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAccountKind, prettyAccountName, stripe } from "@/lib/stripe";
import { syncAccount } from "@/lib/sync";
import { revalidateDashboard } from "@/lib/cache";

const Body = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { sessionId } = await parseBody(request, Body);
    const s = stripe();
    const session = await s.financialConnections.sessions.retrieve(sessionId, { expand: ["accounts"] });
    const linked: string[] = [];
    for (const fc of session.accounts.data) {
      const kind = mapAccountKind(fc);
      const name = prettyAccountName(fc.display_name, fc.subcategory);
      // Stripe issues a new fca_ id per session, so a re-link of the same bank account is matched on identity instead.
      const { data: existing } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "stripe")
        .eq("institution", fc.institution_name)
        .eq("kind", kind)
        .eq("last4", fc.last4 ?? "")
        .limit(1)
        .maybeSingle();
      let id: string;
      if (existing) {
        const { error } = await supabase.from("accounts").update({ provider_account_id: fc.id, name }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        id = existing.id;
      } else {
        const { data, error } = await supabase
          .from("accounts")
          .upsert(
            {
              user_id: userId,
              provider: "stripe",
              provider_account_id: fc.id,
              institution: fc.institution_name,
              name,
              kind,
              last4: fc.last4,
              is_active: true,
            },
            { onConflict: "user_id,provider,provider_account_id" },
          )
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      linked.push(id);
      try {
        await s.financialConnections.accounts.subscribe(fc.id, { features: ["transactions"] });
      } catch {
        // Transactions must be enabled for the Stripe account; balances still sync without it.
      }
    }
    const admin = createAdminClient();
    const { data: run } = await admin.from("sync_runs").insert({ user_id: userId, detail: { trigger: "link" } }).select("id").single();
    const results = await Promise.all(linked.map((id) => syncAccount(admin, id)));
    if (run?.id) {
      await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), status: "ok", detail: { trigger: "link", results } }).eq("id", run.id);
    }
    return { linked: linked.length, results };
  });
}
