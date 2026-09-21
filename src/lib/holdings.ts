import type { SupabaseClient } from "@supabase/supabase-js";
import { today } from "./sync";

export async function refreshInvestmentBalance(supabase: SupabaseClient, userId: string, accountId: string) {
  const { data: hs } = await supabase.from("holdings").select("id").eq("account_id", accountId);
  const ids = (hs ?? []).map((h) => h.id);
  if (!ids.length) return;
  const { data: rows } = await supabase
    .from("holdings_daily")
    .select("holding_id,as_of,value_cents")
    .in("holding_id", ids)
    .order("as_of", { ascending: false });
  const seen = new Set<string>();
  let sum = 0;
  for (const r of rows ?? []) {
    if (seen.has(r.holding_id)) continue;
    seen.add(r.holding_id);
    sum += r.value_cents;
  }
  await supabase.from("balances_daily").upsert(
    { account_id: accountId, user_id: userId, as_of: today(), balance_cents: sum },
    { onConflict: "account_id,as_of" },
  );
}
