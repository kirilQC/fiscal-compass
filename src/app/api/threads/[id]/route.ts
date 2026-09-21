import { NextResponse } from "next/server";
import { getStore } from "@/lib/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = await getStore();
  const thread = await store.get(id);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ thread, messages: await store.messages(id, 200) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = await getStore();
  await store.remove(id);
  return new NextResponse(null, { status: 204 });
}
