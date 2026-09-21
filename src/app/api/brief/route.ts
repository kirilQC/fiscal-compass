import { NextResponse } from "next/server";
import { OWNER_EMAIL } from "@/lib/owner";
import { bearer } from "@/lib/api";
import { buildBrief } from "@/lib/brief";
import { buildDashboardFromDb } from "@/lib/data-db";
import { sampleDashboard } from "@/lib/sample";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = bearer(request) ?? url.searchParams.get("token");
  if (!process.env.BRIEF_TOKEN || token !== process.env.BRIEF_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.SAMPLE_DATA === "1") return NextResponse.json(buildBrief(sampleDashboard));

  const admin = createAdminClient();
  const email = OWNER_EMAIL;
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const user = data.users.find((u) => !email || u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ error: "owner not found" }, { status: 404 });

  const { count } = await admin.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const dashboard = count ? await buildDashboardFromDb(admin, user.id) : sampleDashboard;
  return NextResponse.json(buildBrief(dashboard));
}
