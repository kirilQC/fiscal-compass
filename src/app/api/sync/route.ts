import { withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser } from "@/lib/sync";

export async function POST() {
  return withUser(async ({ userId }) => syncUser(createAdminClient(), userId));
}
