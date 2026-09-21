import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { createClient } from "./supabase/server";

export async function withUser<T>(fn: (ctx: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; email?: string }) => Promise<T>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await fn({ supabase, userId: data.user.id, email: data.user.email });
    return result instanceof NextResponse ? result : NextResponse.json(result ?? { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return null;
}

export function fail(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}
