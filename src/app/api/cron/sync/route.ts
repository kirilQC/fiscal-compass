import { NextResponse } from "next/server";
import { bearer } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (process.env.CRON_SECRET && bearer(request) !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("user_id").eq("is_active", true);
  const users = [...new Set((data ?? []).map((r) => r.user_id as string))];
  const results: Record<string, unknown> = {};
  for (const u of users) results[u] = await syncUser(admin, u, "cron");
  return NextResponse.json({ users: users.length, results });
}
