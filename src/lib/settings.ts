import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserSettings {
  paycheckNetCents: number | null;
  payDays: number[];
  tithePct: number;
  notes: string;
}

export const DEFAULT_SETTINGS: UserSettings = { paycheckNetCents: null, payDays: [1, 15], tithePct: 10, notes: "" };

// Tolerates the user_settings table not existing yet (migration 0003 pending) by returning defaults.
export async function getUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("paycheck_net_cents,pay_days,tithe_pct,notes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return {
    paycheckNetCents: data.paycheck_net_cents ?? null,
    payDays: Array.isArray(data.pay_days) && data.pay_days.length ? data.pay_days : DEFAULT_SETTINGS.payDays,
    tithePct: data.tithe_pct == null ? DEFAULT_SETTINGS.tithePct : Number(data.tithe_pct),
    notes: data.notes ?? "",
  };
}

export async function saveUserSettings(supabase: SupabaseClient, userId: string, s: UserSettings) {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      paycheck_net_cents: s.paycheckNetCents,
      pay_days: s.payDays,
      tithe_pct: s.tithePct,
      notes: s.notes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message.includes("user_settings") ? "Run migration 0003_settings.sql in Supabase first." : error.message);
}

export const PAYROLL_RE = /payroll|gusto|direct dep|\badp\b|paychex|rippling|justworks/i;
