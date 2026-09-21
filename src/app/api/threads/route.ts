import { NextResponse } from "next/server";
import { getStore } from "@/lib/threads";

export async function GET() {
  const store = await getStore();
  return NextResponse.json({ threads: await store.list() });
}

export async function POST() {
  const store = await getStore();
  return NextResponse.json({ thread: await store.create() }, { status: 201 });
}
