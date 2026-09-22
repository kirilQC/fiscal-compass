import type Stripe from "stripe";

// Stripe Financial Connections pricing (stripe.com/pricing): balances $0.10 per successful refresh call;
// transactions a flat $0.30 per institution per account holder per month regardless of refresh count.
// So accounts stay subscribed to Stripe's daily transaction refresh, and balance refreshes are rationed.
export const COST_BALANCE_USD = 0.1;
export const COST_TRANSACTIONS_INSTITUTION_MONTH_USD = 0.3;
export const BALANCE_INTERVAL_DAYS = 7;
// Explicit transaction refreshes are only needed when the daily subscription has gone quiet.
export const TRANSACTION_STALE_DAYS = 3;

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
  into.estUsd = Math.round(into.balance * COST_BALANCE_USD * 100) / 100;
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
