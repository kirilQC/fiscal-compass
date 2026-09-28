import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";
import { normalizeMerchant, planPatterns } from "@/lib/spend";

const Body = z.object({ planItemId: z.string().uuid(), merchant: z.string().min(1) });

// "Yes, this charge is my <expense>": the expense learns the merchant, so this and future charges from it are caught.
export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Body);
    const { data: row, error } = await supabase.from("planned_expenses").select("merchant_pattern").eq("id", b.planItemId).eq("user_id", userId).single();
    if (error) throw new Error(error.message);
    const learned = normalizeMerchant(b.merchant).toLowerCase();
    const current = planPatterns(row.merchant_pattern);
    if (current.some((p) => learned.includes(p) || p.includes(learned))) return { ok: true, pattern: row.merchant_pattern };
    const pattern = [...(row.merchant_pattern ? row.merchant_pattern.split("|").map((p: string) => p.trim()).filter(Boolean) : []), normalizeMerchant(b.merchant)].join("|");
    const { error: upErr } = await supabase.from("planned_expenses").update({ merchant_pattern: pattern }).eq("id", b.planItemId).eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, pattern };
  });
}
