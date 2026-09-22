import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";
import { PLAN_COLUMNS } from "@/lib/plan";

const Create = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amountCents: z.number().int().min(0).nullable().optional(),
  amountMinCents: z.number().int().min(0).nullable().optional(),
  amountMaxCents: z.number().int().min(0).nullable().optional(),
  pctOfIncome: z.number().min(0).max(100).nullable().optional(),
  merchantPattern: z.string().nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  isReimbursed: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sort: z.number().int().optional(),
});
const Patch = Create.partial().extend({ id: z.string().uuid() });
const Del = z.object({ id: z.string().uuid() });

function toRow(b: Partial<z.infer<typeof Create>>) {
  return {
    ...(b.name !== undefined && { name: b.name }),
    ...(b.category !== undefined && { category: b.category }),
    ...(b.amountCents !== undefined && { amount_cents: b.amountCents }),
    ...(b.amountMinCents !== undefined && { amount_min_cents: b.amountMinCents }),
    ...(b.amountMaxCents !== undefined && { amount_max_cents: b.amountMaxCents }),
    ...(b.pctOfIncome !== undefined && { pct_of_income: b.pctOfIncome }),
    ...(b.merchantPattern !== undefined && { merchant_pattern: b.merchantPattern?.trim() || null }),
    ...(b.dueDay !== undefined && { due_day: b.dueDay }),
    ...(b.isReimbursed !== undefined && { is_reimbursed: b.isReimbursed }),
    ...(b.isActive !== undefined && { is_active: b.isActive }),
    ...(b.sort !== undefined && { sort: b.sort }),
  };
}

const friendly = (message: string) => (message.includes("planned_expenses") ? "Run migration 0004_planned_expenses.sql in Supabase first." : message);

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("planned_expenses").select(PLAN_COLUMNS).eq("user_id", userId).order("sort").order("created_at");
    if (error) throw new Error(friendly(error.message));
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase.from("planned_expenses").insert({ user_id: userId, ...toRow(b) }).select("id").single();
    if (error) throw new Error(friendly(error.message));
    return { id: data.id };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const { error } = await supabase.from("planned_expenses").update(toRow(b)).eq("id", b.id).eq("user_id", userId);
    if (error) throw new Error(friendly(error.message));
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { error } = await supabase.from("planned_expenses").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(friendly(error.message));
    return { ok: true };
  });
}
