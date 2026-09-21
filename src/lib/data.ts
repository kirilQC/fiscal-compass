import type { Dashboard } from "./types";
import { sampleDashboard } from "./sample";
import { buildDashboardFromDb } from "./data-db";
import { buildCached } from "./cache";
import { getSession } from "./session";

// Single entry point for every page. Returns sample data when SAMPLE_DATA=1
// or when the signed-in user has not linked any account yet.
export async function getDashboard(): Promise<Dashboard> {
  if (process.env.SAMPLE_DATA === "1") return sampleDashboard;
  const session = await getSession();
  if (!session) return sampleDashboard;
  const { count } = await session.supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", session.userId);
  if (!count) return { ...sampleDashboard, isSample: true, needsSetup: true };
  try {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await buildCached(session.userId)
      : await buildDashboardFromDb(session.supabase, session.userId);
  } catch (e) {
    const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    console.error("dashboard build failed", message);
    return { ...sampleDashboard, isSample: true, loadError: message.split("\n")[0] };
  }
}
