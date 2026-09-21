import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboard } from "@/lib/data";
import { getStore } from "@/lib/threads";
import { streamReply, generateBrief } from "@/lib/advisor";

const Body = z.object({
  threadId: z.string().min(1),
  message: z.string().trim().min(1).max(4000).optional(),
  brief: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { threadId, message, brief } = parsed.data;

  const store = await getStore();
  const thread = await store.get(threadId);
  if (!thread) return NextResponse.json({ error: "thread not found" }, { status: 404 });

  const d = await getDashboard();

  if (brief) {
    const text = await generateBrief(d);
    await store.add(threadId, "assistant", text);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  await store.add(threadId, "user", message);
  const history = await store.messages(threadId, 30);

  const encoder = new TextEncoder();
  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamReply(d, history)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
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
