import { withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLog } from "@/lib/sync";

export async function GET() {
  return withUser(async ({ userId }) => ({ entries: await fetchLog(createAdminClient(), userId) }));
}
