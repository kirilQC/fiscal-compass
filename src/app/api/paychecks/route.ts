import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";

const Create = z.object({
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employer: z.string().optional(),
  grossCents: z.number().int().min(0),
  netCents: z.number().int().min(0),
  taxesCents: z.number().int().min(0).nullable().optional(),
  retirementCents: z.number().int().min(0).nullable().optional(),
  benefitsCents: z.number().int().min(0).nullable().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
const Patch = Create.partial().extend({ id: z.string().uuid() });
const Del = z.object({ id: z.string().uuid() });

function toRow(b: Partial<z.infer<typeof Create>>) {
  return {
    ...(b.payDate !== undefined && { pay_date: b.payDate }),
    ...(b.employer !== undefined && { employer: b.employer }),
    ...(b.grossCents !== undefined && { gross_cents: b.grossCents }),
    ...(b.netCents !== undefined && { net_cents: b.netCents }),
    ...(b.taxesCents !== undefined && { taxes_cents: b.taxesCents }),
    ...(b.retirementCents !== undefined && { retirement_cents: b.retirementCents }),
    ...(b.benefitsCents !== undefined && { benefits_cents: b.benefitsCents }),
    ...(b.raw !== undefined && { raw: b.raw }),
  };
}

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("paychecks").select("*").eq("user_id", userId).order("pay_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase.from("paychecks").insert({ user_id: userId, ...toRow(b) }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const { error } = await supabase.from("paychecks").update(toRow(b)).eq("id", b.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { error } = await supabase.from("paychecks").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
