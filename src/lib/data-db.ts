import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dashboard } from "./types";
import { sampleDashboard } from "./sample";

// Implemented in the data layer task; until then the app renders sample data.
export async function buildDashboardFromDb(_supabase: SupabaseClient, _userId: string): Promise<Dashboard> {
  return { ...sampleDashboard, isSample: true };
}
