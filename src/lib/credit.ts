import type { SupabaseClient } from "@supabase/supabase-js";

// Kiril's credit score, kept by hand (or from a one-time Credit Journey upload) since no bureau API is open to
// a one-person app. Scores and the uploaded report live in advisor_notes: kind "credit_score" (one row per
// reading) and kind "credit_report" (the latest upload, summarized).

export interface CreditScore { id: string; asOf: string; score: number; model: string; source: string }
export interface CreditReport { id: string; summary: string; details: string; facts: string[]; files: string[]; uploadedAt: string }

export const SCORE_MODELS = ["VantageScore 3.0", "FICO 8", "Other"] as const;

export function band(score: number): string {
  return score >= 800 ? "Exceptional" : score >= 740 ? "Very good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";
}

// Which model a free-text answer is talking about. Chase Credit Journey shows VantageScore 3.0, the Experian app FICO 8.
export function modelFrom(text: string): string {
  if (/fico|experian app/i.test(text)) return "FICO 8";
  if (/vantage|credit journey|chase|credit karma/i.test(text)) return "VantageScore 3.0";
  return "VantageScore 3.0";
}

// The first number in the plausible score range, so "It's 742 on Credit Journey" reads as 742.
export function scoreFrom(text: string): number | null {
  for (const m of text.matchAll(/\b(\d{3})\b/g)) { const n = Number(m[1]); if (n >= 300 && n <= 850) return n; }
  return null;
}

type Row = { id: string; kind: string; body: string; anchor: Record<string, unknown> | null; created_at: string };

export async function loadCredit(supabase: SupabaseClient, userId: string): Promise<{ scores: CreditScore[]; report: CreditReport | null }> {
  const { data } = await supabase.from("advisor_notes").select("id,kind,body,anchor,created_at").eq("user_id", userId).in("kind", ["credit_score", "credit_report"]).order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as Row[];
  const scores = rows.filter((r) => r.kind === "credit_score" && r.anchor).map((r) => ({
    id: r.id, asOf: String(r.anchor!.asOf), score: Number(r.anchor!.score), model: String(r.anchor!.model ?? "VantageScore 3.0"), source: String(r.anchor!.source ?? "manual"),
  })).filter((s) => s.score >= 300 && s.score <= 850).sort((a, b) => a.asOf.localeCompare(b.asOf));
  const r = rows.find((x) => x.kind === "credit_report");
  const report = r ? { id: r.id, summary: r.body, details: String(r.anchor?.details ?? ""), facts: (r.anchor?.facts as string[]) ?? [], files: (r.anchor?.files as string[]) ?? [], uploadedAt: r.created_at } : null;
  return { scores, report };
}

export async function addScore(supabase: SupabaseClient, userId: string, s: { score: number; asOf: string; model: string; source: string }) {
  const { data: same } = await supabase.from("advisor_notes").select("id,anchor").eq("user_id", userId).eq("kind", "credit_score").contains("anchor", { asOf: s.asOf, model: s.model });
  if (same?.length) {
    await supabase.from("advisor_notes").update({ body: `${s.score} (${s.model})`, anchor: s }).eq("id", same[0].id);
    return same[0].id as string;
  }
  const { data, error } = await supabase.from("advisor_notes").insert({ user_id: userId, kind: "credit_score", body: `${s.score} (${s.model})`, anchor: s }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
