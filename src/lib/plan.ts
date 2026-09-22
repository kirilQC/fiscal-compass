import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanItem, PlanSummary } from "./types";

export interface PlanRow {
  id: string;
  name: string;
  category: string;
  amount_cents: number | null;
  amount_min_cents: number | null;
  amount_max_cents: number | null;
  pct_of_income: number | null;
  merchant_pattern: string | null;
  due_day: number | null;
  is_reimbursed: boolean;
  is_active: boolean;
  sort: number;
}

export const PLAN_COLUMNS = "id,name,category,amount_cents,amount_min_cents,amount_max_cents,pct_of_income,merchant_pattern,due_day,is_reimbursed,is_active,sort";

// Tolerates the planned_expenses table not existing yet (migration 0004 pending).
export async function getPlanRows(supabase: SupabaseClient, userId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase.from("planned_expenses").select(PLAN_COLUMNS).eq("user_id", userId).eq("is_active", true).order("sort").order("created_at");
  if (error || !data) return [];
  return data as PlanRow[];
}

interface Txn {
  posted_on: string;
  amount_cents: number;
  merchant: string;
  category: string;
  is_transfer: boolean;
}

export function expectedCents(row: PlanRow, incomeCents: number): number {
  if (row.pct_of_income != null) return Math.round((incomeCents * Number(row.pct_of_income)) / 100);
  if (row.amount_cents != null) return row.amount_cents;
  if (row.amount_min_cents != null && row.amount_max_cents != null) return Math.round((row.amount_min_cents + row.amount_max_cents) / 2);
  return 0;
}

const isDebtPayment = (row: PlanRow) => row.category === "Transfer";

// `txns` may start a few days before the month: bills due on the 1st–3rd often post in the last days of the prior month.
export function computePlan(rows: PlanRow[], txns: Txn[], incomeCents: number, today: Date): PlanSummary {
  const day = today.getUTCDate();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const graceStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), -3)).toISOString().slice(0, 10);
  const items: PlanItem[] = rows.map((row) => {
    const expected = expectedCents(row, incomeCents);
    const from = row.due_day != null && row.due_day <= 3 ? graceStart : monthStart;
    const monthTxns = txns.filter((t) => t.posted_on >= from);
    let matched: Txn[] = [];
    if (row.merchant_pattern) {
      const pat = row.merchant_pattern.toLowerCase();
      matched = monthTxns.filter((t) => t.amount_cents < 0 && t.merchant.toLowerCase().includes(pat));
    } else {
      matched = monthTxns.filter((t) => t.amount_cents < 0 && !t.is_transfer && t.category === row.category);
    }
    const paidCents = matched.reduce((s, t) => s - t.amount_cents, 0);
    const paidOn = matched.length ? matched.map((t) => t.posted_on).sort().at(-1)! : null;
    let status: PlanItem["status"];
    if (!row.merchant_pattern) status = "varies";
    else if (paidCents > 0) status = "paid";
    else if (row.due_day != null && day > row.due_day + 2) status = "overdue";
    else status = "due";
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      expectedCents: expected,
      amountCents: row.amount_cents,
      amountMinCents: row.amount_min_cents,
      amountMaxCents: row.amount_max_cents,
      pctOfIncome: row.pct_of_income == null ? null : Number(row.pct_of_income),
      merchantPattern: row.merchant_pattern,
      dueDay: row.due_day,
      isReimbursed: row.is_reimbursed,
      isDebtPayment: isDebtPayment(row),
      paidCents,
      paidOn,
      status,
    };
  });
  const counted = items.filter((i) => !i.isReimbursed);
  const totalCents = counted.reduce((s, i) => s + i.expectedCents, 0);
  const paidCents = counted.reduce((s, i) => s + Math.min(i.paidCents, i.status === "varies" ? i.paidCents : Math.max(i.expectedCents, i.paidCents)), 0);
  return { items, totalCents, paidCents, incomeCents, leftoverCents: incomeCents - totalCents };
}

// Category limits implied by the plan: spending items only (no debt payments, no reimbursed).
export function planCategoryLimits(plan: PlanSummary): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of plan.items) {
    if (i.isReimbursed || i.isDebtPayment) continue;
    m.set(i.category, (m.get(i.category) ?? 0) + i.expectedCents);
  }
  return m;
}
