import { withUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthToDateCost } from "@/lib/sync";

export async function GET() {
  return withUser(async ({ userId }) => monthToDateCost(createAdminClient(), userId));
}
