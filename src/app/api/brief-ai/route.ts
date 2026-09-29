import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadLedger } from "@/lib/advisor/ledger";
import { briefText } from "@/lib/advisor/agent";
import { computeInsights } from "@/lib/advisor/insights";

export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const db = { supabase: session.supabase, userId: session.userId };
  const ledger = await loadLedger(db.supabase, db.userId);
  const brief = await briefText(ledger, db);
  return NextResponse.json({ asOf: ledger.today, brief, prompts: computeInsights(ledger).slice(0, 3).map((i) => i.ask) });
}
