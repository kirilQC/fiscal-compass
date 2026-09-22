import type Stripe from "stripe";

// Stripe Financial Connections bills per paid refresh, so refreshes run on a fixed cadence
// and everything else is derived from data we already hold.
export const COST_BALANCE_USD = 0.1;
export const COST_TRANSACTIONS_USD = 0.3;
export const BALANCE_INTERVAL_DAYS = 7;
export const TRANSACTION_INTERVAL_DAYS: Record<string, number> = {
  checking: 3,
  savings: 3,
  credit: 3,
  investment: 30,
  loan: 30,
  other: 7,
};

export type SyncMode = "cron" | "free" | "force";

export interface PaidCounts {
  balance: number;
  transactions: number;
  estUsd: number;
}

export const emptyPaid = (): PaidCounts => ({ balance: 0, transactions: 0, estUsd: 0 });

export function addPaid(into: PaidCounts, from: PaidCounts) {
  into.balance += from.balance;
  into.transactions += from.transactions;
  into.estUsd = Math.round((into.balance * COST_BALANCE_USD + into.transactions * COST_TRANSACTIONS_USD) * 100) / 100;
}

export function isDue(lastAttemptedUnix: number | null | undefined, fallbackIso: string | null, intervalDays: number, now = Date.now()) {
  const last = lastAttemptedUnix ? lastAttemptedUnix * 1000 : fallbackIso ? Date.parse(fallbackIso) : null;
  if (!last) return true;
  return now - last >= intervalDays * 86400_000 - 3600_000;
}

type Feature = "balance" | "transactions";

export async function refreshAndWait(s: Stripe, fcId: string, feature: Feature, timeoutMs = 20_000) {
  let account = await s.financialConnections.accounts.refresh(fcId, { features: [feature] });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = feature === "balance" ? account.balance_refresh?.status : account.transaction_refresh?.status;
    if (status !== "pending") break;
    await new Promise((r) => setTimeout(r, 1500));
    account = await s.financialConnections.accounts.retrieve(fcId);
  }
  return account;
}
