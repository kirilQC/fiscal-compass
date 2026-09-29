import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { loadLedger } from "@/lib/advisor/ledger";
import { computeQuestions } from "@/lib/advisor/questions";
import { REMEMBERED, runAdvisor } from "@/lib/advisor/agent";

export const maxDuration = 60;

// Sterling's questions for Kiril. GET lists the open ones; POST takes an answer in place (no conversation is
// opened): Sterling reads it, saves what he learned, and replies in a sentence or two.

const Answer = z.object({ id: z.string().min(1).max(200), answer: z.string().trim().min(1).max(2000) });

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ questions: [] });
  const ledger = await loadLedger(session.supabase, session.userId);
  return NextResponse.json({ questions: computeQuestions(ledger) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const parsed = Answer.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write an answer first." }, { status: 400 });
  const { id, answer } = parsed.data;
  const db = { supabase: session.supabase, userId: session.userId };
  const ledger = await loadLedger(db.supabase, db.userId);
  const q = computeQuestions(ledger).find((x) => x.id === id);
  if (!q) return NextResponse.json({ error: "That question has already been answered." }, { status: 404 });

  let reply = "";
  const remembered: string[] = [];
  for await (const ev of runAdvisor(ledger, [{ role: "assistant", content: q.text }, { role: "user", content: answer }], db,
    "This is Kiril answering your question in place on his dashboard, not a chat. You must save what you learned with remember (the fact and what it means for his money). Then reply in one or two short sentences: thank him and say how it changes the picture. No chart, no Do this line, no follow-up question.")) {
    if (ev.type === "text") reply += ev.delta;
    else if (ev.text.startsWith(REMEMBERED)) remembered.push(ev.text.slice(REMEMBERED.length));
  }
  // Belt and braces: an answer is never lost, even if the model forgot to save it.
  if (!remembered.length) {
    const fact = `Asked "${q.text}", Kiril answered: "${answer}"`.slice(0, 500);
    await db.supabase.from("advisor_notes").insert({ user_id: db.userId, kind: "memory", body: fact });
    remembered.push(fact);
  }
  await db.supabase.from("advisor_notes").insert({ user_id: db.userId, kind: "question", body: q.text, anchor: { qid: q.id, answer } });
  return NextResponse.json({ reply: reply.trim(), remembered });
}
