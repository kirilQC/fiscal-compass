import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";

const Create = z.object({
  name: z.string().min(1),
  targetCents: z.number().int().positive(),
  savedCents: z.number().int().min(0).default(0),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyPlanCents: z.number().int().min(0).nullable().optional(),
  linkedAccountId: z.string().uuid().nullable().optional(),
  sort: z.number().int().optional(),
});
const Patch = Create.partial().extend({ id: z.string().uuid() });
const Del = z.object({ id: z.string().uuid() });

function toRow(b: Partial<z.infer<typeof Create>>) {
  return {
    ...(b.name !== undefined && { name: b.name }),
    ...(b.targetCents !== undefined && { target_cents: b.targetCents }),
    ...(b.savedCents !== undefined && { saved_cents: b.savedCents }),
    ...(b.targetDate !== undefined && { target_date: b.targetDate }),
    ...(b.monthlyPlanCents !== undefined && { monthly_plan_cents: b.monthlyPlanCents }),
    ...(b.linkedAccountId !== undefined && { linked_account_id: b.linkedAccountId }),
    ...(b.sort !== undefined && { sort: b.sort }),
  };
}

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("goals").select("*").eq("user_id", userId).order("sort");
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase.from("goals").insert({ user_id: userId, ...toRow(b) }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const { error } = await supabase.from("goals").update(toRow(b)).eq("id", b.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
