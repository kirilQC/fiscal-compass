import { revalidateTag, unstable_cache } from "next/cache";
import type { Dashboard } from "./types";
import { buildDashboardFromDb } from "./data-db";
import { createAdminClient } from "./supabase/admin";

export const DASHBOARD_TAG = "dashboard";
const TTL_SECONDS = 600;

// Cached per user; reads through the service-role client so no request cookies are touched inside the cache scope.
export function buildCached(userId: string): Promise<Dashboard> {
  return unstable_cache(
    async () => buildDashboardFromDb(createAdminClient(), userId),
    ["dashboard", userId],
    { tags: [DASHBOARD_TAG, `${DASHBOARD_TAG}:${userId}`], revalidate: TTL_SECONDS },
  )();
}

export function revalidateDashboard() {
  try {
    revalidateTag(DASHBOARD_TAG, "max");
  } catch {
    // Outside a request scope (scripts, cron warm-up) there is nothing to revalidate.
  }
}
