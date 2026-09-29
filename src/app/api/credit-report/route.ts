import { NextResponse } from "next/server";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { getSession } from "@/lib/session";
import { openai } from "@/lib/advisor";
import { ADVISOR_MODEL } from "@/lib/advisor/agent";
import { addScore } from "@/lib/credit";

export const maxDuration = 120;

// A one-time upload of Kiril's Chase Credit Journey (PDF or screenshots). The model reads it once; what comes
// out is kept: every dated score reading, a short summary and a detailed rundown for Sterling, and a few
// lasting facts saved to his learned context.

const MAX_BYTES = 4_200_000; // Vercel caps a request body at 4.5 MB
const OK_TYPES = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["scores", "summary", "details", "facts"],
  properties: {
    scores: {
      type: "array", description: "Every dated score reading visible, including each point of a score history chart whose date and value can be read.",
      items: { type: "object", additionalProperties: false, required: ["as_of", "score", "model"], properties: {
        as_of: { type: "string", description: "YYYY-MM-DD. If only a month is shown, use the 1st." },
        score: { type: "integer" },
        model: { type: "string", description: "Scoring model as shown, e.g. 'VantageScore 3.0' or 'FICO 8'. Chase Credit Journey is VantageScore 3.0." },
      } },
    },
    summary: { type: "string", description: "Three to five plain sentences: where his credit stands, the trend, and the one or two factors that matter most." },
    details: { type: "string", description: "A compact plain-text rundown for his financial advisor: each account (lender, type, open date, status, balance and limit if shown), payment history and any late payments, hard inquiries with dates, collections or public records, total utilization, average account age, and the score factors listed. Only what the documents show." },
    facts: { type: "array", items: { type: "string" }, description: "Up to 6 lasting facts about Kiril's credit worth remembering, each one sentence stated as a fact about him (never 'the document shows'), e.g. 'Kiril's oldest credit account is the Chase Freedom Unlimited, opened March 2021.' Combine related points. Skip anything that changes month to month (balances, utilization, the score itself) and anything his linked accounts already show (credit limits)." },
  },
} as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const ai = openai();
  if (!ai) return NextResponse.json({ error: "Add OPENAI_API_KEY to read the report." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose a PDF or screenshots first." }, { status: 400 });
  if (files.some((f) => !OK_TYPES.test(f.type))) return NextResponse.json({ error: "Use PDFs or PNG/JPEG screenshots." }, { status: 400 });
  if (files.reduce((t, f) => t + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: "That's over 4 MB. Try screenshots of the pages instead, or fewer at a time." }, { status: 413 });

  const content: ResponseInputContent[] = [{ type: "input_text", text: "These are Kiril's credit documents (likely Chase Credit Journey). Extract what they show. Never use em or en dashes." }];
  for (const f of files) {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    content.push(f.type === "application/pdf"
      ? { type: "input_file", filename: f.name || "report.pdf", file_data: `data:application/pdf;base64,${b64}` }
      : { type: "input_image", image_url: `data:${f.type};base64,${b64}`, detail: "high" });
  }

  let out: { scores: { as_of: string; score: number; model: string }[]; summary: string; details: string; facts: string[] };
  try {
    const res = await ai.responses.create({
      model: ADVISOR_MODEL,
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "credit_report", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
    });
    out = JSON.parse(res.output_text);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read the report: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  const noDash = (s: string) => s.replace(/\s*[–—]\s*/g, ", ").trim();
  const { supabase, userId } = session;
  const scores = out.scores.filter((s) => Number.isInteger(s.score) && s.score >= 300 && s.score <= 850 && /^\d{4}-\d{2}-\d{2}$/.test(s.as_of));
  for (const s of scores) await addScore(supabase, userId, { score: s.score, asOf: s.as_of, model: s.model || "VantageScore 3.0", source: "upload" });

  const facts = out.facts.map(noDash).filter(Boolean).slice(0, 6);
  // One report at a time: a new upload replaces the last one.
  await supabase.from("advisor_notes").delete().eq("user_id", userId).eq("kind", "credit_report");
  await supabase.from("advisor_notes").insert({ user_id: userId, kind: "credit_report", body: noDash(out.summary), anchor: { details: noDash(out.details), facts, files: files.map((f) => f.name) } });
  if (facts.length) await supabase.from("advisor_notes").insert(facts.map((body) => ({ user_id: userId, kind: "memory", body: body.slice(0, 500) })));

  return NextResponse.json({ scores: scores.length, facts, summary: noDash(out.summary) });
}
