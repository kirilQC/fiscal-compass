import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/settings";
import { revalidateDashboard } from "@/lib/cache";

const Put = z.object({
  paycheckNetCents: z.number().int().min(0).nullable(),
  payDays: z.array(z.number().int().min(1).max(31)).min(1).max(6),
  tithePct: z.number().min(0).max(100),
  notes: z.string().max(12000),
});

export async function GET() {
  return withUser(({ supabase, userId }) => getUserSettings(supabase, userId));
}

export async function PUT(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Put);
    await saveUserSettings(supabase, userId, { ...b, payDays: [...new Set(b.payDays)].sort((a, c) => a - c) });
    return { ok: true };
  });
}
