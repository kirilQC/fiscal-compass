import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { revalidateDashboard } from "@/lib/cache";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  spendClass: z.enum(["essential", "discretionary"]),
});

// Tags a merchant's charges at once; later charges from the same merchant inherit it (see tagMemory).
export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Body);
    const { error } = await supabase.from("transactions").update({ spend_class: b.spendClass }).eq("user_id", userId).in("id", b.ids);
    if (error) throw new Error(error.message);
    return { ok: true, tagged: b.ids.length };
  });
}
