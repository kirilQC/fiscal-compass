import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";

// The advisor's learned context: facts it saved from conversations (advisor_notes, kind "memory").
// Kiril can read, correct, add or delete them in Settings; the advisor reads them before every reply.

const Add = z.object({ body: z.string().trim().min(1).max(500) });
const Edit = z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(500) });
const Del = z.object({ id: z.string().uuid() });

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("advisor_notes").select("id,body,created_at").eq("user_id", userId).eq("kind", "memory").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { memories: data ?? [] };
  });
}

export async function POST(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Add);
    const { data, error } = await supabase.from("advisor_notes").insert({ user_id: userId, kind: "memory", body: b.body }).select("id,body,created_at").single();
    if (error) throw new Error(error.message);
    return { memory: data };
  });
}

export async function PATCH(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Edit);
    const { error } = await supabase.from("advisor_notes").update({ body: b.body }).eq("user_id", userId).eq("kind", "memory").eq("id", b.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Del);
    const { error } = await supabase.from("advisor_notes").delete().eq("user_id", userId).eq("kind", "memory").eq("id", b.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
