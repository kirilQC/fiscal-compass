import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/settings";
import { revalidateDashboard } from "@/lib/cache";

// Every field is optional so a page can save just the one it owns; the rest are merged from what is stored.
const Put = z.object({
  paycheckNetCents: z.number().int().min(0).nullable().optional(),
  payDays: z.array(z.number().int().min(1).max(31)).min(1).max(6).optional(),
  tithePct: z.number().min(0).max(100).optional(),
  notes: z.string().max(12000).optional(),
  discretionaryBudgetCents: z.number().int().nonnegative().nullable().optional(),
});

export async function GET() {
  return withUser(({ supabase, userId }) => getUserSettings(supabase, userId));
}

export async function PUT(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Put);
    const current = await getUserSettings(supabase, userId);
    const payDays = b.payDays ? [...new Set(b.payDays)].sort((a, c) => a - c) : current.payDays;
    const { discretionaryPersisted } = await saveUserSettings(supabase, userId, { ...current, ...b, payDays });
    revalidateDashboard();
    return { ok: true, discretionaryPersisted };
  });
}
