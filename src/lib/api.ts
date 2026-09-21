import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getSession, type Session } from "./session";
import { OWNER_EMAIL } from "./owner";

export async function withUser<T>(fn: (ctx: Session & { email?: string }) => Promise<T>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const result = await fn({ ...session, email: OWNER_EMAIL });
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
