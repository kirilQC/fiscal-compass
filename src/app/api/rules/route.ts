import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";

const Create = z.object({
  merchantPattern: z.string().min(1),
  category: z.string().min(1),
  isTransfer: z.boolean().default(false),
  isIncome: z.boolean().default(false),
  applyToExisting: z.boolean().default(true),
});
const Patch = Create.partial().extend({ id: z.string().uuid() });
const Del = z.object({ id: z.string().uuid() });

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("category_rules").select("*").eq("user_id", userId).order("created_at");
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase
      .from("category_rules")
      .insert({ user_id: userId, merchant_pattern: b.merchantPattern, category: b.category, is_transfer: b.isTransfer, is_income: b.isIncome })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    let updated = 0;
    if (b.applyToExisting) {
      const { data: rows } = await supabase
        .from("transactions")
        .update({ category: b.category, category_source: "rule", is_transfer: b.isTransfer, is_income: b.isIncome })
        .eq("user_id", userId)
        .neq("category_source", "manual")
        .ilike("merchant", `%${b.merchantPattern}%`)
        .select("id");
      updated = rows?.length ?? 0;
    }
    return { id: data.id, updated };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const row = {
      ...(b.merchantPattern !== undefined && { merchant_pattern: b.merchantPattern }),
      ...(b.category !== undefined && { category: b.category }),
      ...(b.isTransfer !== undefined && { is_transfer: b.isTransfer }),
      ...(b.isIncome !== undefined && { is_income: b.isIncome }),
    };
    const { error } = await supabase.from("category_rules").update(row).eq("id", b.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { error } = await supabase.from("category_rules").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
