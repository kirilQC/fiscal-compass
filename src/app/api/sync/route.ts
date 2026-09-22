import { withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser } from "@/lib/sync";
import { revalidateDashboard } from "@/lib/cache";

// "Sync now" is free: it lists what Stripe already holds. ?force=1 pays for a fresh pull of every account.
export async function POST(request: Request) {
  revalidateDashboard();
  const force = new URL(request.url).searchParams.get("force") === "1";
  return withUser(async ({ userId }) => {
    const r = await syncUser(createAdminClient(), userId, force ? "force" : "free");
    return { status: r.status, paid: r.paid, estUsd: r.paid.estUsd, detail: r.detail };
  });
}
