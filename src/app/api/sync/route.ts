import { withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser } from "@/lib/sync";
import { revalidateDashboard } from "@/lib/cache";

export async function POST() {
  revalidateDashboard();
  return withUser(async ({ userId }) => syncUser(createAdminClient(), userId));
}
