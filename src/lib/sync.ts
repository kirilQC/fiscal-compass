import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe, currentBalanceCents } from "./stripe";
import { revalidateDashboard } from "./cache";
import { categorize, categorizeMerchantsWithAI, cleanMerchant, normalizeMerchant, type Rule } from "./categorize";
import { PAYROLL_RE } from "./settings";
import { refreshPrices } from "./prices";
import {
  BALANCE_INTERVAL_DAYS,
  TRANSACTION_STALE_DAYS,
  COST_TRANSACTIONS_INSTITUTION_MONTH_USD,
  addPaid,
  emptyPaid,
  isDue,
  refreshAndWait,
  type PaidCounts,
  type SyncMode,
} from "./sync-policy";

export const today = () => new Date().toISOString().slice(0, 10);

interface AccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string | null;
  kind: string;
  name?: string;
}

export interface FetchEntry {
  at: string;
  account: string;
  feature: "balance" | "transactions" | "list" | "auto-transactions";
  status: string;
  usd: number;
  note?: string;
}

export async function syncUser(admin: SupabaseClient, userId: string, mode: SyncMode = "cron") {
  const { data: run } = await admin.from("sync_runs").insert({ user_id: userId, detail: { trigger: mode } }).select("id").single();
  const detail: Record<string, unknown> = { trigger: mode };
  const paid = emptyPaid();
  let status = "ok";
  try {
    const { data: accounts } = await admin
      .from("accounts")
      .select("id,user_id,provider,provider_account_id,kind,name")
      .eq("user_id", userId)
      .eq("is_active", true);
    const fetches: FetchEntry[] = [];
    const { data: rules } = await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income").eq("user_id", userId);
    const lastRun = await lastSyncStarted(admin, userId);
    for (const a of (accounts ?? []) as AccountRow[]) {
      if (a.provider !== "stripe" || !a.provider_account_id) continue;
      const r = await syncStripeAccount(admin, a, (rules ?? []) as Rule[], mode, lastRun);
      addPaid(paid, r.paid);
      fetches.push(...r.fetches);
      detail[a.id] = { balance: r.balance, source: r.source, transactions: r.transactions, paid: r.paid };
    }
    detail.paid = paid;
    detail.fetches = fetches;
    detail.ai = await categorizeUnknownWithAI(admin, userId);
    detail.paychecks = await detectPaychecks(admin, userId);
    detail.prices = await refreshPrices(admin, userId);
    await carryForwardHoldings(admin, userId);
    await alignHoldingsToBalances(admin, userId);
  } catch (e) {
    status = "error";
    detail.error = e instanceof Error ? e.message : String(e);
  }
  if (run?.id) {
    await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), status, detail }).eq("id", run.id);
  }
  revalidateDashboard();
  return { status, detail, paid };
}

// Free by default: lists what Stripe already holds and recomputes. "force" pays for a fresh pull.
export async function syncAccount(admin: SupabaseClient, accountId: string, mode: SyncMode = "free") {
  const { data: a } = await admin.from("accounts").select("id,user_id,provider,provider_account_id,kind,is_active").eq("id", accountId).single();
  if (!a || a.provider !== "stripe" || !a.provider_account_id || !a.is_active) return null;
  const { data: rules } = await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income").eq("user_id", a.user_id);
  const result = await syncStripeAccount(admin, a as AccountRow, (rules ?? []) as Rule[], mode, null);
  await categorizeUnknownWithAI(admin, a.user_id);
  await detectPaychecks(admin, a.user_id);
  await alignHoldingsToBalances(admin, a.user_id);
  revalidateDashboard();
  return result;
}

async function lastSyncStarted(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("sync_runs")
    .select("started_at")
    .eq("user_id", userId)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(2);
  // The newest row is the run in progress; the one before it is the last completed sync.
  return data?.[1]?.started_at ?? null;
}

export async function monthToDateCost(admin: SupabaseClient, userId: string) {
  const monthStart = `${today().slice(0, 7)}-01T00:00:00Z`;
  const { data } = await admin.from("sync_runs").select("started_at,detail").eq("user_id", userId).gte("started_at", monthStart);
  const totals = emptyPaid();
  const refreshes: { at: string; balance: number; transactions: number; trigger: string }[] = [];
  for (const r of data ?? []) {
    const d = r.detail as { paid?: PaidCounts; trigger?: string } | null;
    if (!d?.paid || (d.paid.balance === 0 && d.paid.transactions === 0)) continue;
    addPaid(totals, d.paid);
    refreshes.push({ at: r.started_at, balance: d.paid.balance, transactions: d.paid.transactions, trigger: d.trigger ?? "cron" });
  }
  const { data: inst } = await admin.from("accounts").select("institution").eq("user_id", userId).eq("provider", "stripe").eq("is_active", true);
  const institutions = new Set((inst ?? []).map((r) => r.institution)).size;
  const transactionsUsd = Math.round(institutions * COST_TRANSACTIONS_INSTITUTION_MONTH_USD * 100) / 100;
  return {
    monthUsd: Math.round((totals.estUsd + transactionsUsd) * 100) / 100,
    counts: { balance: totals.balance, transactions: totals.transactions, institutions },
    breakdown: { balancesUsd: totals.estUsd, transactionsUsd },
    refreshes,
  };
}

// Payroll deposits become paychecks automatically; nothing is ever entered by hand.
export async function detectPaychecks(admin: SupabaseClient, userId: string) {
  const { data: deposits } = await admin
    .from("transactions")
    .select("id,posted_on,amount_cents,merchant")
    .eq("user_id", userId)
    .gt("amount_cents", 0)
    .eq("status", "posted")
    .limit(2000);
  const payroll = (deposits ?? []).filter((t) => PAYROLL_RE.test(t.merchant));
  if (!payroll.length) return { created: 0 };
  const { data: existing } = await admin.from("paychecks").select("pay_date,net_cents,raw").eq("user_id", userId);
  const seen = new Set<string>();
  for (const p of existing ?? []) {
    const raw = p.raw as { transaction_id?: string } | null;
    if (raw?.transaction_id) seen.add(raw.transaction_id);
    seen.add(`${p.pay_date}:${p.net_cents}`);
  }
  const rows = payroll
    .filter((t) => !seen.has(t.id) && !seen.has(`${t.posted_on}:${t.amount_cents}`))
    .map((t) => ({
      user_id: userId,
      pay_date: t.posted_on,
      employer: t.merchant.replace(/\s*PPD ID:.*$/i, "").replace(/\s+/g, " ").trim(),
      gross_cents: t.amount_cents,
      net_cents: t.amount_cents,
      raw: { transaction_id: t.id },
    }));
  if (rows.length) {
    const { error } = await admin.from("paychecks").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { created: rows.length };
}

// Asks the model once per unknown merchant and persists the answer as a rule so it is never asked again.
export async function categorizeUnknownWithAI(admin: SupabaseClient, userId: string) {
  const { data: unknown } = await admin
    .from("transactions")
    .select("id,merchant")
    .eq("user_id", userId)
    .eq("category", "Other")
    .neq("category_source", "manual")
    .eq("is_transfer", false)
    .limit(2000);
  if (!unknown?.length) return { asked: 0, applied: 0 };
  const byNorm = new Map<string, string[]>();
  for (const t of unknown) {
    const n = normalizeMerchant(t.merchant);
    byNorm.set(n, [...(byNorm.get(n) ?? []), t.id]);
  }
  const { data: rules } = await admin.from("category_rules").select("merchant_pattern").eq("user_id", userId);
  const have = new Set((rules ?? []).map((r) => r.merchant_pattern.toUpperCase()));
  const ask = [...byNorm.keys()].filter((n) => !have.has(n));
  const answers = await categorizeMerchantsWithAI(ask);
  let applied = 0;
  const newRules: Record<string, unknown>[] = [];
  for (const [norm, ans] of Object.entries(answers)) {
    if (ans.category === "Other") continue;
    newRules.push({ user_id: userId, merchant_pattern: norm, category: ans.category, is_transfer: ans.isTransfer, is_income: ans.isIncome });
    const ids = byNorm.get(norm) ?? [];
    if (ids.length) {
      await admin
        .from("transactions")
        .update({ category: ans.category, category_source: "ai", is_transfer: ans.isTransfer, is_income: ans.isIncome })
        .in("id", ids);
      applied += ids.length;
    }
  }
  if (newRules.length) await admin.from("category_rules").insert(newRules);
  return { asked: ask.length, applied };
}

async function syncStripeAccount(admin: SupabaseClient, a: AccountRow, rules: Rule[], mode: SyncMode, lastRunIso: string | null) {
  const s = stripe();
  const fcId = a.provider_account_id!;
  const paid = emptyPaid();
  const fetches: FetchEntry[] = [];
  const label = a.name ?? a.kind;
  let account = await s.financialConnections.accounts.retrieve(fcId);
  const autoAt = account.transaction_refresh?.last_attempted_at;

  const txnDue =
    mode === "force" ||
    (mode === "cron" && isDue(account.transaction_refresh?.last_attempted_at, lastRunIso, TRANSACTION_STALE_DAYS));
  if (txnDue && account.transaction_refresh?.status !== "pending") {
    try {
      account = await refreshAndWait(s, fcId, "transactions");
      paid.transactions += 1;
      fetches.push({ at: new Date().toISOString(), account: label, feature: "transactions", status: account.transaction_refresh?.status ?? "unknown", usd: 0 });
    } catch (e) {
      fetches.push({ at: new Date().toISOString(), account: label, feature: "transactions", status: "failed", usd: 0, note: e instanceof Error ? e.message : String(e) });
      // Transactions feature may be unavailable; the free list below still runs.
    }
  }

  const balanceDue =
    mode === "force" || (mode === "cron" && isDue(account.balance_refresh?.last_attempted_at, lastRunIso, BALANCE_INTERVAL_DAYS));
  let refreshedBalance: number | null = null;
  if (balanceDue && account.balance_refresh?.status !== "pending") {
    try {
      account = await refreshAndWait(s, fcId, "balance");
      paid.balance += 1;
      if (account.balance_refresh?.status === "succeeded") refreshedBalance = currentBalanceCents(account);
      fetches.push({ at: new Date().toISOString(), account: label, feature: "balance", status: account.balance_refresh?.status ?? "unknown", usd: 0.1 });
    } catch (e) {
      fetches.push({ at: new Date().toISOString(), account: label, feature: "balance", status: "failed", usd: 0.1, note: e instanceof Error ? e.message : String(e) });
      // Institution rate limit or unsupported (loans); derive below instead.
    }
  }

  const inserted = await pullTransactions(admin, s, a, rules);
  if (autoAt && !fetches.some((f) => f.feature === "transactions")) {
    fetches.push({ at: new Date(autoAt * 1000).toISOString(), account: label, feature: "auto-transactions", status: account.transaction_refresh?.status ?? "unknown", usd: 0, note: "Stripe daily subscription refresh" });
  }
  fetches.push({
    at: new Date().toISOString(),
    account: label,
    feature: "list",
    status: typeof inserted === "number" ? "ok" : "failed",
    usd: 0,
    note: typeof inserted === "number" ? `${inserted} new` : inserted.error,
  });

  let balance: number | null;
  let source: "refresh" | "derived";
  if (refreshedBalance !== null) {
    balance = refreshedBalance;
    source = "refresh";
  } else {
    balance = await deriveBalance(admin, a, account);
    source = "derived";
  }
  if (balance !== null) {
    await admin.from("balances_daily").upsert(
      { account_id: a.id, user_id: a.user_id, as_of: today(), balance_cents: balance },
      { onConflict: "account_id,as_of" },
    );
  }
  return { balance, source, transactions: inserted, paid, fetches };
}

// Today's balance without paying Stripe: start from the last known balance and roll forward.
async function deriveBalance(admin: SupabaseClient, a: AccountRow, account: Stripe.FinancialConnections.Account): Promise<number | null> {
  let base: number | null = null;
  let baseDate: string | null = null;
  const stripeBal = currentBalanceCents(account);
  const stripeAt = account.balance_refresh?.last_attempted_at;
  if (stripeBal !== null && stripeAt && account.balance_refresh?.status === "succeeded") {
    base = stripeBal;
    baseDate = new Date(stripeAt * 1000).toISOString().slice(0, 10);
  }
  const { data: latest } = await admin
    .from("balances_daily")
    .select("as_of,balance_cents")
    .eq("account_id", a.id)
    .lt("as_of", today())
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  // A newer row we already hold (manual entry, or a later derivation) beats an older Stripe snapshot.
  if (latest && (!baseDate || latest.as_of > baseDate)) {
    base = latest.balance_cents;
    baseDate = latest.as_of;
  }
  if (base === null || !baseDate) return null;

  if (a.kind === "investment") {
    const { data: h } = await admin.from("holdings").select("symbol").eq("account_id", a.id);
    const symbol = h?.length === 1 ? h[0].symbol.toUpperCase() : null;
    if (symbol) {
      const { data: series } = await admin.from("prices").select("as_of,close_cents").eq("symbol", symbol).lte("as_of", today()).order("as_of", { ascending: false }).limit(400);
      const latestClose = series?.[0];
      const baseClose = series?.find((r) => r.as_of <= baseDate!);
      if (latestClose && baseClose && baseClose.close_cents > 0) {
        const shares = base / baseClose.close_cents;
        return Math.round(shares * latestClose.close_cents);
      }
    }
    return base;
  }

  // Cash, credit and loans: amounts are signed money-in, so a plain sum rolls any of them forward.
  const { data: txns } = await admin
    .from("transactions")
    .select("amount_cents")
    .eq("account_id", a.id)
    .eq("status", "posted")
    .gt("posted_on", baseDate)
    .lte("posted_on", today());
  const delta = (txns ?? []).reduce((sum, t) => sum + t.amount_cents, 0);
  return base + delta;
}

// A brokerage account with a single holding is that holding: keep its daily value equal to the account balance.
export async function alignHoldingsToBalances(admin: SupabaseClient, userId: string) {
  const { data: accounts } = await admin.from("accounts").select("id").eq("user_id", userId).eq("kind", "investment").eq("provider", "stripe").eq("is_active", true);
  for (const acc of accounts ?? []) {
    const { data: hs } = await admin.from("holdings").select("id").eq("account_id", acc.id);
    if (hs?.length !== 1) continue;
    const { data: bal } = await admin.from("balances_daily").select("balance_cents").eq("account_id", acc.id).eq("as_of", today()).maybeSingle();
    if (!bal) continue;
    await admin
      .from("holdings_daily")
      .upsert({ holding_id: hs[0].id, user_id: userId, as_of: today(), value_cents: bal.balance_cents }, { onConflict: "holding_id,as_of" });
  }
}

async function pullTransactions(admin: SupabaseClient, s: Stripe, a: AccountRow, rules: Rule[]) {
  const { data: newest } = await admin
    .from("transactions")
    .select("posted_on")
    .eq("account_id", a.id)
    .order("posted_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since = newest?.posted_on
    ? Math.floor(new Date(`${newest.posted_on}T00:00:00Z`).getTime() / 1000) - 7 * 86400
    : undefined;

  const rows: Record<string, unknown>[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    let page: Stripe.ApiList<Stripe.FinancialConnections.Transaction>;
    try {
      page = await s.financialConnections.transactions.list({
        account: a.provider_account_id!,
        limit: 100,
        ...(since ? { transacted_at: { gte: since } } : {}),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
    } catch (e) {
      // Transactions feature may not be enabled on the Stripe account yet.
      return { error: e instanceof Error ? e.message : String(e) };
    }
    for (const t of page.data) {
      const merchant = cleanMerchant(t.description);
      const c = categorize(merchant, rules, { accountKind: a.kind, amountCents: t.amount });
      // Stripe FC amounts: positive = money into the account holder's position, negative = money out.
      rows.push({
        user_id: a.user_id,
        account_id: a.id,
        provider_txn_id: t.id,
        posted_on: new Date(t.transacted_at * 1000).toISOString().slice(0, 10),
        amount_cents: t.amount,
        merchant,
        description: t.description,
        category: c.category,
        category_source: c.source,
        status: t.status === "pending" ? "pending" : "posted",
        is_transfer: c.isTransfer,
        is_income: c.isIncome || (t.amount > 0 && c.category === "Income"),
      });
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  if (rows.length === 0) return 0;

  // Preserve manual categorizations on re-upsert.
  const ids = rows.map((r) => r.provider_txn_id as string);
  const { data: existing } = await admin
    .from("transactions")
    .select("provider_txn_id,category,category_source")
    .eq("user_id", a.user_id)
    .in("provider_txn_id", ids);
  const manual = new Map((existing ?? []).filter((e) => e.category_source === "manual").map((e) => [e.provider_txn_id, e.category]));
  for (const r of rows) {
    const m = manual.get(r.provider_txn_id as string);
    if (m) {
      r.category = m;
      r.category_source = "manual";
    }
  }

  await flagAnomalies(admin, a.user_id, rows);
  const { error } = await admin.from("transactions").upsert(rows, { onConflict: "user_id,provider_txn_id" });
  if (error) throw new Error(error.message);
  return rows.length;
}

async function flagAnomalies(admin: SupabaseClient, userId: string, rows: Record<string, unknown>[]) {
  const merchants = [...new Set(rows.map((r) => r.merchant as string))];
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const { data: hist } = await admin
    .from("transactions")
    .select("merchant,amount_cents,provider_txn_id")
    .eq("user_id", userId)
    .gte("posted_on", since)
    .lt("amount_cents", 0)
    .in("merchant", merchants);
  const byMerchant = new Map<string, number[]>();
  const newIds = new Set(rows.map((r) => r.provider_txn_id));
  for (const h of hist ?? []) {
    if (newIds.has(h.provider_txn_id)) continue;
    const list = byMerchant.get(h.merchant) ?? [];
    list.push(Math.abs(h.amount_cents));
    byMerchant.set(h.merchant, list);
  }
  for (const r of rows) {
    const amt = r.amount_cents as number;
    if (amt >= 0) continue;
    const prior = byMerchant.get(r.merchant as string);
    if (!prior || prior.length < 3) continue;
    const sorted = [...prior].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ratio = Math.abs(amt) / median;
    if (ratio > 2) r.anomaly_note = `${ratio.toFixed(1)}× your typical ${r.merchant} order`;
  }
}

// Manual holdings have no feed; repeat yesterday's value so the net-worth series has no gaps.
export async function carryForwardHoldings(admin: SupabaseClient, userId: string) {
  const { data: holdings } = await admin.from("holdings").select("id,account_id").eq("user_id", userId);
  if (!holdings?.length) return;
  const { data: latest } = await admin
    .from("holdings_daily")
    .select("holding_id,as_of,quantity,price_cents,value_cents")
    .eq("user_id", userId)
    .order("as_of", { ascending: false });
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const perAccount = new Map<string, number>();
  const accountOf = new Map(holdings.map((h) => [h.id, h.account_id]));
  for (const r of latest ?? []) {
    if (seen.has(r.holding_id)) continue;
    seen.add(r.holding_id);
    rows.push({ holding_id: r.holding_id, user_id: userId, as_of: today(), quantity: r.quantity, price_cents: r.price_cents, value_cents: r.value_cents });
    const acct = accountOf.get(r.holding_id);
    if (acct) perAccount.set(acct, (perAccount.get(acct) ?? 0) + r.value_cents);
  }
  if (rows.length) await admin.from("holdings_daily").upsert(rows, { onConflict: "holding_id,as_of", ignoreDuplicates: true });
  const { data: manualAccounts } = await admin.from("accounts").select("id").eq("user_id", userId).eq("provider", "manual").eq("kind", "investment");
  for (const a of manualAccounts ?? []) {
    const sum = perAccount.get(a.id);
    if (sum !== undefined) {
      await admin.from("balances_daily").upsert({ account_id: a.id, user_id: userId, as_of: today(), balance_cents: sum }, { onConflict: "account_id,as_of" });
    }
  }
}

export async function fetchLog(admin: SupabaseClient, userId: string, days = 60) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await admin.from("sync_runs").select("started_at,detail").eq("user_id", userId).gte("started_at", since).order("started_at", { ascending: false }).limit(400);
  const out: (FetchEntry & { trigger: string })[] = [];
  const seenAuto = new Set<string>();
  for (const r of data ?? []) {
    const d = r.detail as { trigger?: string; fetches?: FetchEntry[] } | null;
    for (const f of d?.fetches ?? []) {
      if (f.feature === "auto-transactions") {
        const key = `${f.account}|${f.at}`;
        if (seenAuto.has(key)) continue;
        seenAuto.add(key);
      }
      out.push({ ...f, trigger: d?.trigger ?? "cron" });
    }
  }
  out.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}
