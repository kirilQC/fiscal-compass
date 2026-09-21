import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { today } from "@/lib/sync";
import { refreshInvestmentBalance } from "@/lib/holdings";
import { revalidateDashboard } from "@/lib/cache";

const Create = z.object({
  accountId: z.string().uuid(),
  symbol: z.string().min(1).max(12),
  name: z.string().optional(),
  assetClass: z.string().optional(),
  targetPct: z.number().nullable().optional(),
  quantity: z.number().nullable().optional(),
  priceCents: z.number().int().nullable().optional(),
  valueCents: z.number().int(),
});
const Patch = Create.partial().extend({ id: z.string().uuid() });
const Del = z.object({ id: z.string().uuid() });

export async function GET() {
  return withUser(async ({ supabase, userId }) => {
    const { data, error } = await supabase.from("holdings").select("*").eq("user_id", userId).order("symbol");
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Create);
    const { data, error } = await supabase
      .from("holdings")
      .upsert(
        { user_id: userId, account_id: b.accountId, symbol: b.symbol.toUpperCase(), name: b.name ?? null, asset_class: b.assetClass ?? null, target_pct: b.targetPct ?? null },
        { onConflict: "account_id,symbol" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("holdings_daily").upsert(
      { holding_id: data.id, user_id: userId, as_of: today(), quantity: b.quantity ?? null, price_cents: b.priceCents ?? null, value_cents: b.valueCents },
      { onConflict: "holding_id,as_of" },
    );
    await refreshInvestmentBalance(supabase, userId, b.accountId);
    return { id: data.id };
  });
}

export async function PATCH(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const b = await parseBody(request, Patch);
    const { data: h, error: e0 } = await supabase.from("holdings").select("account_id").eq("id", b.id).eq("user_id", userId).single();
    if (e0) throw new Error(e0.message);
    const row = {
      ...(b.symbol !== undefined && { symbol: b.symbol.toUpperCase() }),
      ...(b.name !== undefined && { name: b.name }),
      ...(b.assetClass !== undefined && { asset_class: b.assetClass }),
      ...(b.targetPct !== undefined && { target_pct: b.targetPct }),
    };
    if (Object.keys(row).length) {
      const { error } = await supabase.from("holdings").update(row).eq("id", b.id);
      if (error) throw new Error(error.message);
    }
    if (b.valueCents !== undefined) {
      await supabase.from("holdings_daily").upsert(
        { holding_id: b.id, user_id: userId, as_of: today(), quantity: b.quantity ?? null, price_cents: b.priceCents ?? null, value_cents: b.valueCents },
        { onConflict: "holding_id,as_of" },
      );
      await refreshInvestmentBalance(supabase, userId, h.account_id);
    }
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  revalidateDashboard();
  return withUser(async ({ supabase, userId }) => {
    const { id } = await parseBody(request, Del);
    const { data: h } = await supabase.from("holdings").select("account_id").eq("id", id).eq("user_id", userId).maybeSingle();
    const { error } = await supabase.from("holdings").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (h) await refreshInvestmentBalance(supabase, userId, h.account_id);
    return { ok: true };
  });
}
