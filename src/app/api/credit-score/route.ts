import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { addScore, loadCredit } from "@/lib/credit";

// Credit score readings Kiril logs by hand. One per date and model; logging the same date again corrects it.

const Add = z.object({
  score: z.number().int().min(300).max(850),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model: z.string().trim().min(1).max(40),
});
const Del = z.object({ id: z.string().uuid() });

export async function GET() {
  return withUser(({ supabase, userId }) => loadCredit(supabase, userId));
}

export async function POST(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Add);
    const id = await addScore(supabase, userId, { ...b, source: "manual" });
    return { id };
  });
}

// Removes one reading, or the uploaded report.
export async function DELETE(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Del);
    const { error } = await supabase.from("advisor_notes").delete().eq("user_id", userId).in("kind", ["credit_score", "credit_report"]).eq("id", b.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
