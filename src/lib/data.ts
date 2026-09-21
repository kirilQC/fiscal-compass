import type { Dashboard } from "./types";
import { sampleDashboard } from "./sample";
import { buildDashboardFromDb } from "./data-db";
import { createClient } from "./supabase/server";

// Single entry point for every page. Returns sample data when SAMPLE_DATA=1
// or when the signed-in user has not linked any account yet.
export async function getDashboard(): Promise<Dashboard> {
  if (process.env.SAMPLE_DATA === "1") return sampleDashboard;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return sampleDashboard;
  const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true });
  if (!count) return { ...sampleDashboard, isSample: true };
  return buildDashboardFromDb(supabase, data.user.id);
}
