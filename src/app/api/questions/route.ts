import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/threads";
import { loadLedger } from "@/lib/advisor/ledger";
import { computeQuestions } from "@/lib/advisor/questions";

// Sterling's questions for Kiril. GET lists the open ones; POST starts a conversation that opens with the
// question in Sterling's voice, so Kiril's reply lands in context and gets remembered.

const Start = z.object({ id: z.string().min(1).max(200) });

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ questions: [] });
  const ledger = await loadLedger(session.supabase, session.userId);
  return NextResponse.json({ questions: computeQuestions(ledger) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const parsed = Start.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const ledger = await loadLedger(session.supabase, session.userId);
  const q = computeQuestions(ledger).find((x) => x.id === parsed.data.id);
  if (!q) return NextResponse.json({ error: "That question has already been answered." }, { status: 404 });
  const store = await getStore();
  const thread = await store.create();
  await store.add(thread.id, "assistant", q.text);
  await store.titleIfNew(thread.id, `Question: ${q.about}`);
  await session.supabase.from("advisor_notes").insert({ user_id: session.userId, kind: "question", body: q.text, anchor: { qid: q.id, threadId: thread.id } });
  return NextResponse.json({ threadId: thread.id });
}
