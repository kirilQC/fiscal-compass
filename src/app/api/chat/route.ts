import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboard } from "@/lib/data";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/threads";
import { streamReply } from "@/lib/advisor";
import { loadLedger } from "@/lib/advisor/ledger";
import { briefText, runAdvisor, type AdvisorEvent } from "@/lib/advisor/agent";

export const maxDuration = 120;

const Body = z.object({
  threadId: z.string().min(1),
  message: z.string().trim().min(1).max(4000).optional(),
  brief: z.boolean().optional(),
});

// Status lines ride in the text stream between these markers; the client strips them from the reply.
const STATUS_OPEN = "\u001e", STATUS_CLOSE = "\u001f";

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { threadId, message, brief } = parsed.data;

  const store = await getStore();
  const thread = await store.get(threadId);
  if (!thread) return NextResponse.json({ error: "thread not found" }, { status: 404 });

  const session = await getSession();
  const live = session && process.env.SAMPLE_DATA !== "1";
  const db = live ? { supabase: session.supabase, userId: session.userId } : null;
  const ledger = db ? await loadLedger(db.supabase, db.userId) : null;

  if (brief) {
    const text = ledger && db ? await briefText(ledger, db) : "Link an account and I'll brief you on it every morning.";
    await store.add(threadId, "assistant", text);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  await store.add(threadId, "user", message);
  const history = await store.messages(threadId, 30);

  // Sample mode has no ledger: fall back to the snapshot-based reply.
  const events: AsyncGenerator<AdvisorEvent> = ledger && db
    ? runAdvisor(ledger, history, db)
    : (async function* () { for await (const delta of streamReply(await getDashboard(), history)) yield { type: "text" as const, delta }; })();

  const encoder = new TextEncoder();
  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of events) {
          if (ev.type === "status") controller.enqueue(encoder.encode(`${STATUS_OPEN}${ev.text}${STATUS_CLOSE}`));
          else { full += ev.delta; controller.enqueue(encoder.encode(ev.delta)); }
        }
      } catch (e) {
        const note = `\n\nSomething went wrong while I was working on that (${e instanceof Error ? e.message : "unknown error"}). Try asking again.`;
        full += note;
        controller.enqueue(encoder.encode(note));
      } finally {
        if (full.trim()) await store.add(threadId, "assistant", full);
        await store.titleIfNew(threadId, message);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
