import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";

const Body = z.object({
  category: z.string().min(1).optional(),
  isTransfer: z.boolean().optional(),
  isIncome: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await params;
    const b = await parseBody(request, Body);
    const row = {
      ...(b.category !== undefined && { category: b.category, category_source: "manual" }),
      ...(b.isTransfer !== undefined && { is_transfer: b.isTransfer }),
      ...(b.isIncome !== undefined && { is_income: b.isIncome }),
    };
    const { error } = await supabase.from("transactions").update(row).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
