import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserSettings {
  paycheckNetCents: number | null;
  payDays: number[];
  tithePct: number;
  notes: string;
  discretionaryBudgetCents: number | null;
}

export const DEFAULT_SETTINGS: UserSettings = { paycheckNetCents: null, payDays: [1, 15], tithePct: 10, notes: "", discretionaryBudgetCents: null };

const BASE_COLUMNS = "paycheck_net_cents,pay_days,tithe_pct,notes";

interface SettingsRow {
  paycheck_net_cents: number | null;
  pay_days: number[] | null;
  tithe_pct: number | string | null;
  notes: string | null;
  discretionary_budget_cents?: number | null;
}

const shape = (data: SettingsRow): UserSettings => ({
  paycheckNetCents: data.paycheck_net_cents ?? null,
  payDays: Array.isArray(data.pay_days) && data.pay_days.length ? data.pay_days : DEFAULT_SETTINGS.payDays,
  tithePct: data.tithe_pct == null ? DEFAULT_SETTINGS.tithePct : Number(data.tithe_pct),
  notes: data.notes ?? "",
  discretionaryBudgetCents: data.discretionary_budget_cents ?? null,
});

// Tolerates the user_settings table not existing yet (migration 0003) and the discretionary
// column not existing yet (migration 0006) — either way the rest of the settings still load.
export async function getUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings> {
  const withDisc = await supabase
    .from("user_settings")
    .select(`${BASE_COLUMNS},discretionary_budget_cents`)
    .eq("user_id", userId)
    .maybeSingle();
  if (!withDisc.error && withDisc.data) return shape(withDisc.data as SettingsRow);

  const base = await supabase.from("user_settings").select(BASE_COLUMNS).eq("user_id", userId).maybeSingle();
  if (base.error || !base.data) return DEFAULT_SETTINGS;
  return shape(base.data as SettingsRow);
}

export async function saveUserSettings(
  supabase: SupabaseClient,
  userId: string,
  s: UserSettings,
): Promise<{ discretionaryPersisted: boolean }> {
  const base = {
    user_id: userId,
    paycheck_net_cents: s.paycheckNetCents,
    pay_days: s.payDays,
    tithe_pct: s.tithePct,
    notes: s.notes || null,
    updated_at: new Date().toISOString(),
  };

  const full = await supabase
    .from("user_settings")
    .upsert({ ...base, discretionary_budget_cents: s.discretionaryBudgetCents }, { onConflict: "user_id" });
  if (!full.error) return { discretionaryPersisted: true };

  // Migration 0006 pending: save everything else so the form still works.
  const retry = await supabase.from("user_settings").upsert(base, { onConflict: "user_id" });
  if (retry.error) {
    throw new Error(
      retry.error.message.includes("user_settings") ? "Run migration 0003_settings.sql in Supabase first." : retry.error.message,
    );
  }
  return { discretionaryPersisted: false };
}

export const PAYROLL_RE = /payroll|gusto|direct dep|\badp\b|paychex|rippling|justworks/i;
