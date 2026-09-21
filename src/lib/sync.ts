import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe, currentBalanceCents } from "./stripe";
import { categorize, categorizeMerchantsWithAI, cleanMerchant, normalizeMerchant, type Rule } from "./categorize";

export const today = () => new Date().toISOString().slice(0, 10);

interface AccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string | null;
  kind: string;
}

export async function syncUser(admin: SupabaseClient, userId: string) {
  const { data: run } = await admin.from("sync_runs").insert({ user_id: userId }).select("id").single();
  const detail: Record<string, unknown> = {};
  let status = "ok";
  try {
    const { data: accounts } = await admin
      .from("accounts")
      .select("id,user_id,provider,provider_account_id,kind")
      .eq("user_id", userId)
      .eq("is_active", true);
    const { data: rules } = await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income").eq("user_id", userId);
    for (const a of (accounts ?? []) as AccountRow[]) {
      if (a.provider !== "stripe" || !a.provider_account_id) continue;
      detail[a.id] = await syncStripeAccount(admin, a, (rules ?? []) as Rule[]);
    }
    detail.ai = await categorizeUnknownWithAI(admin, userId);
    await carryForwardHoldings(admin, userId);
  } catch (e) {
    status = "error";
    detail.error = e instanceof Error ? e.message : String(e);
  }
  if (run?.id) {
    await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), status, detail }).eq("id", run.id);
  }
  return { status, detail };
}

export async function syncAccount(admin: SupabaseClient, accountId: string) {
  const { data: a } = await admin.from("accounts").select("id,user_id,provider,provider_account_id,kind").eq("id", accountId).single();
  if (!a || a.provider !== "stripe" || !a.provider_account_id) return null;
  const { data: rules } = await admin.from("category_rules").select("merchant_pattern,category,is_transfer,is_income").eq("user_id", a.user_id);
  const result = await syncStripeAccount(admin, a as AccountRow, (rules ?? []) as Rule[]);
  await categorizeUnknownWithAI(admin, a.user_id);
  return result;
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

async function syncStripeAccount(admin: SupabaseClient, a: AccountRow, rules: Rule[]) {
  const s = stripe();
  const fcId = a.provider_account_id!;
  let account = await s.financialConnections.accounts.retrieve(fcId);
  if (account.balance_refresh?.status !== "pending" && (account.balance_refresh?.next_refresh_available_at ?? 0) * 1000 <= Date.now()) {
    try {
      account = await s.financialConnections.accounts.refresh(fcId, { features: ["balance"] });
    } catch {
      // Refresh is rate limited by the institution; fall through with the last known balance.
    }
  }
  const balance = currentBalanceCents(account);
  if (balance !== null) {
    await admin.from("balances_daily").upsert(
      { account_id: a.id, user_id: a.user_id, as_of: today(), balance_cents: balance },
      { onConflict: "account_id,as_of" },
    );
  }

  const inserted = await pullTransactions(admin, s, a, rules);
  return { balance, transactions: inserted };
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
