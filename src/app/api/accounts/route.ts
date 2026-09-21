import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { today } from "@/lib/sync";
import { revalidateDashboard } from "@/lib/cache";

const Kind = z.enum(["checking", "savings", "credit", "loan", "investment", "other"]);
const Create = z.object({
  institution: z.string().min(1),
  name: z.string().min(1),
  kind: Kind,
  last4: z.string().max(4).optional(),
  balanceCents: z.number().int(),
  creditLimitCents: z.number().int().nullable().optional(),
  loanApr: z.number().nullable().optional(),
  loanPaymentCents: z.number().int().nullable().optional(),
  loanPaymentsLeft: z.number().int().nullable().optional(),
});
const Patch = Create.partial().extend({ id: z.string().uuid(), isActive: z.boolean().optional() });
const Del = z.object({ id: z.string().uuid() });

function toRow(b: Partial<z.infer<typeof Create>>) {
  return {
    ...(b.institution !== undefined && { institution: b.institution }),
    ...(b.name !== undefined && { name: b.name }),
    ...(b.kind !== undefined && { kind: b.kind }),
    ...(b.last4 !== undefined && { last4: b.last4 }),
    ...(b.creditLimitCents !== undefined && { credit_limit_cents: b.creditLimitCents }),
    ...(b.loanApr !== undefined && { loan_apr: b.loanApr }),
    ...(b.loanPaymentCents !== undefined && { loan_payment_cents: b.loanPaymentCents }),
    ...(b.loanPaymentsLeft !== undefined && { loan_payments_left: b.loanPaymentsLeft }),
  };
}

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("accounts").select("*").eq("user_id", userId).order("created_at");
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase
      .from("accounts")
      .insert({ user_id: userId, provider: "manual", ...toRow(b) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("balances_daily").upsert(
      { account_id: data.id, user_id: userId, as_of: today(), balance_cents: b.balanceCents },
      { onConflict: "account_id,as_of" },
    );
    return { id: data.id };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const row = { ...toRow(b), ...(b.isActive !== undefined && { is_active: b.isActive }) };
    if (Object.keys(row).length) {
      const { error } = await supabase.from("accounts").update(row).eq("id", b.id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    if (b.balanceCents !== undefined) {
      await supabase.from("balances_daily").upsert(
        { account_id: b.id, user_id: userId, as_of: today(), balance_cents: b.balanceCents },
        { onConflict: "account_id,as_of" },
      );
    }
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
