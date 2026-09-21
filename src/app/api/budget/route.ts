import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";

const Body = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  totalCents: z.number().int().min(0),
  categories: z.array(z.object({ category: z.string().min(1), limitCents: z.number().int().min(0) })).default([]),
});
const Del = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export async function GET(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const month = new URL(request.url).searchParams.get("month");
    let q = supabase.from("budgets").select("id,month,total_cents,budget_categories(category,limit_cents)").eq("user_id", userId).order("month", { ascending: false });
    if (month) q = q.eq("month", `${month}-01`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Body);
    const { data, error } = await supabase
      .from("budgets")
      .upsert({ user_id: userId, month: `${b.month}-01`, total_cents: b.totalCents }, { onConflict: "user_id,month" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("budget_categories").delete().eq("budget_id", data.id);
    if (b.categories.length) {
      const { error: e2 } = await supabase
        .from("budget_categories")
        .insert(b.categories.map((c) => ({ budget_id: data.id, user_id: userId, category: c.category, limit_cents: c.limitCents })));
      if (e2) throw new Error(e2.message);
    }
    return { id: data.id };
  });
}

export const PATCH = POST;

export async function DELETE(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const { month } = await parseBody(request, Del);
    const { error } = await supabase.from("budgets").delete().eq("user_id", userId).eq("month", `${month}-01`);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
