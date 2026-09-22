import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Account,
  Annotation,
  BudgetSummary,
  CreditSummary,
  Dashboard,
  Goal,
  Holding,
  LoanSummary,
  MonthlyFlow,
  MonthlySpending,
  SeriesPoint,
  Transaction,
} from "./types";
import { getUserSettings } from "./settings";
import { computePlan, getPlanRows, planCategoryLimits } from "./plan";

interface AccountRow {
  id: string;
  institution: string;
  name: string;
  kind: Account["kind"];
  last4: string | null;
  credit_limit_cents: number | null;
  loan_apr: number | null;
  loan_payment_cents: number | null;
  loan_payments_left: number | null;
}
interface BalanceRow { account_id: string; as_of: string; balance_cents: number }
interface TxnRow {
  id: string; account_id: string; posted_on: string; amount_cents: number; merchant: string; category: string;
  is_transfer: boolean; is_income: boolean; anomaly_note: string | null; status: string;
}
interface HoldingRow { id: string; account_id: string; symbol: string; name: string | null; asset_class: string | null; target_pct: number | null }
interface HoldingDailyRow { holding_id: string; as_of: string; value_cents: number }
interface GoalRow { id: string; name: string; target_cents: number; saved_cents: number; target_date: string | null; monthly_plan_cents: number | null; sort: number }
interface PaycheckRow { pay_date: string; net_cents: number }
interface NoteRow { kind: string; body: string; anchor: { series?: string; date?: string } | null; created_at: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: string) => d.slice(0, 7);
const monthEnd = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

export async function buildDashboardFromDb(supabase: SupabaseClient, userId: string): Promise<Dashboard> {
  const now = new Date();
  const todayIso = iso(now);
  const since5y = iso(new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1)));
  const since12m = iso(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)));
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const since6m = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)));

  const lastSyncQ = await supabase.from("sync_runs").select("started_at,finished_at").eq("user_id", userId).eq("status", "ok").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const [accountsQ, balancesQ, txnsQ, holdingsQ, holdingsDailyQ, goalsQ, budgetQ, paychecksQ, notesQ, settings, planRows] = await Promise.all([
    supabase.from("accounts").select("id,institution,name,kind,last4,credit_limit_cents,loan_apr,loan_payment_cents,loan_payments_left").eq("user_id", userId).eq("is_active", true),
    supabase.from("balances_daily").select("account_id,as_of,balance_cents").eq("user_id", userId).gte("as_of", since5y).order("as_of"),
    supabase.from("transactions").select("id,account_id,posted_on,amount_cents,merchant,category,is_transfer,is_income,anomaly_note,status").eq("user_id", userId).gte("posted_on", since12m).order("posted_on", { ascending: false }).limit(5000),
    supabase.from("holdings").select("id,account_id,symbol,name,asset_class,target_pct").eq("user_id", userId),
    supabase.from("holdings_daily").select("holding_id,as_of,value_cents").eq("user_id", userId).gte("as_of", since12m).order("as_of"),
    supabase.from("goals").select("id,name,target_cents,saved_cents,target_date,monthly_plan_cents,sort").eq("user_id", userId).order("sort"),
    supabase.from("budgets").select("id,month,total_cents,budget_categories(category,limit_cents)").eq("user_id", userId).eq("month", monthStart).maybeSingle(),
    supabase.from("paychecks").select("pay_date,net_cents").eq("user_id", userId).gte("pay_date", since6m),
    supabase.from("advisor_notes").select("kind,body,anchor,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    getUserSettings(supabase, userId),
    getPlanRows(supabase, userId),
  ]);

  const accounts = (accountsQ.data ?? []) as AccountRow[];
  const balances = (balancesQ.data ?? []) as BalanceRow[];
  const txns = (txnsQ.data ?? []) as TxnRow[];
  const holdingRows = (holdingsQ.data ?? []) as HoldingRow[];
  const symbols = [...new Set(holdingRows.map((h) => h.symbol.toUpperCase()))];
  const since3m = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate())));
  const pricesQ = symbols.length
    ? await supabase.from("prices").select("symbol,as_of,close_cents").in("symbol", symbols).gte("as_of", since3m).order("as_of")
    : { data: [] };
  const since1y = iso(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())));
  const longPricesQ = symbols.length
    ? await supabase.from("prices").select("symbol,as_of,close_cents").in("symbol", symbols).gte("as_of", since1y).order("as_of")
    : { data: [] };
  const longPricesBySymbol = new Map<string, { as_of: string; close_cents: number }[]>();
  for (const r of (longPricesQ.data ?? []) as { symbol: string; as_of: string; close_cents: number }[]) {
    const list = longPricesBySymbol.get(r.symbol) ?? [];
    list.push(r);
    longPricesBySymbol.set(r.symbol, list);
  }
  const pricesBySymbol = new Map<string, { as_of: string; close_cents: number }[]>();
  for (const r of (pricesQ.data ?? []) as { symbol: string; as_of: string; close_cents: number }[]) {
    const list = pricesBySymbol.get(r.symbol) ?? [];
    list.push(r);
    pricesBySymbol.set(r.symbol, list);
  }
  const holdingDaily = (holdingsDailyQ.data ?? []) as HoldingDailyRow[];
  const goalRows = (goalsQ.data ?? []) as GoalRow[];
  const paychecks = (paychecksQ.data ?? []) as PaycheckRow[];
  const notes = (notesQ.data ?? []) as NoteRow[];

  // Balance history per account, sorted ascending by date.
  const histByAccount = new Map<string, BalanceRow[]>();
  for (const b of balances) {
    const list = histByAccount.get(b.account_id) ?? [];
    list.push(b);
    histByAccount.set(b.account_id, list);
  }
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  const postedByAccount = new Map<string, TxnRow[]>();
  for (const t of txns) {
    if (t.status === "pending") continue;
    const list = postedByAccount.get(t.account_id) ?? [];
    list.push(t);
    postedByAccount.set(t.account_id, list);
  }
  const earliestTxn = txns.length ? txns[txns.length - 1].posted_on : null;
  let reconstructedBefore: string | null = null;

  // Before the first snapshot, a balance is rebuilt by unwinding posted transactions (for investments this captures
  // transfers in and out but not market movement).
  const balanceAt = (accountId: string, date: string): number | null => {
    const list = histByAccount.get(accountId);
    if (!list?.length) return null;
    let v: number | null = null;
    for (const b of list) {
      if (b.as_of <= date) v = b.balance_cents;
      else break;
    }
    if (v !== null) return v;
    const earliest = list[0];
    if (earliestTxn && date < earliestTxn) return null;
    if (!reconstructedBefore || earliest.as_of < reconstructedBefore) reconstructedBefore = earliest.as_of;
    let unwound = 0;
    for (const t of postedByAccount.get(accountId) ?? []) {
      if (t.posted_on > date && t.posted_on <= earliest.as_of) unwound += t.amount_cents;
    }
    return earliest.balance_cents - unwound;
  };
  const netWorthAt = (date: string) => accounts.reduce((s, a) => s + (balanceAt(a.id, date) ?? 0), 0);

  const netWorthCents = netWorthAt(todayIso);
  const lastMonthEnd = iso(monthEnd(now.getUTCFullYear(), now.getUTCMonth() - 1));
  const lastYearEnd = iso(monthEnd(now.getUTCFullYear() - 1, 11));
  // Baselines fall back to the earliest reconstructable date when history is shorter than the period.
  const firstHistory = earliestTxn ?? balances[0]?.as_of ?? todayIso;
  const nwLastMonth = lastMonthEnd >= firstHistory ? netWorthAt(lastMonthEnd) : netWorthAt(firstHistory);
  const nwLastYear = lastYearEnd >= firstHistory ? netWorthAt(lastYearEnd) : netWorthAt(firstHistory);
  const changeSince = lastYearEnd >= firstHistory ? lastYearEnd : firstHistory;
  const changeMtdCents = netWorthCents - nwLastMonth;
  const changeYtdCents = netWorthCents - nwLastYear;
  const changeYtdPct = nwLastYear ? (changeYtdCents / Math.abs(nwLastYear)) * 100 : 0;

  const historyStart = earliestTxn && earliestTxn < (balances[0]?.as_of ?? todayIso) ? earliestTxn : balances[0]?.as_of ?? todayIso;
  const netWorth12m: SeriesPoint[] = [];
  for (let i = 11; i >= 1; i--) {
    const d = iso(monthEnd(now.getUTCFullYear(), now.getUTCMonth() - i));
    if (d < historyStart) continue;
    netWorth12m.push({ date: d, valueCents: netWorthAt(d) });
  }
  netWorth12m.push({ date: todayIso, valueCents: netWorthCents });

  // Daily series: per account, start from the earliest known snapshot and unwind posted transactions day by day.
  const dailyStart = (() => {
    const yearAgo = iso(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())));
    return historyStart > yearAgo ? historyStart : yearAgo;
  })();
  const dayTotals = new Map<string, number>();
  const investTotals = new Map<string, number>();
  const dayKeys: string[] = [];
  for (let d = new Date(`${dailyStart}T00:00:00Z`); iso(d) <= todayIso; d = new Date(d.getTime() + 86400000)) {
    dayKeys.push(iso(d));
    dayTotals.set(iso(d), 0);
    investTotals.set(iso(d), 0);
  }
  for (const a of accounts) {
    const list = histByAccount.get(a.id);
    if (!list?.length) continue;
    const snapshots = new Map(list.map((b) => [b.as_of, b.balance_cents]));
    const earliest = list[0];
    const txByDay = new Map<string, number>();
    for (const t of postedByAccount.get(a.id) ?? []) {
      if (t.posted_on <= earliest.as_of) txByDay.set(t.posted_on, (txByDay.get(t.posted_on) ?? 0) + t.amount_cents);
    }
    let running = earliest.balance_cents;
    const before = new Map<string, number>();
    for (let i = dayKeys.length - 1; i >= 0; i--) {
      const day = dayKeys[i];
      if (day <= earliest.as_of) {
        before.set(day, running);
        running -= txByDay.get(day) ?? 0;
      }
    }
    let carried: number | null = null;
    for (const day of dayKeys) {
      const snap = snapshots.get(day);
      if (snap !== undefined) carried = snap;
      const v = day <= earliest.as_of ? (before.get(day) ?? earliest.balance_cents) : carried ?? earliest.balance_cents;
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + v);
      if (a.kind === "investment") investTotals.set(day, (investTotals.get(day) ?? 0) + v);
    }
  }
  // Market-aware investment history: when a single-holding account has price history, value each day at
  // today's implied shares × that day's close instead of the transfer-only reconstruction.
  const investAccounts = accounts.filter((a) => a.kind === "investment");
  const priceValue = new Map<string, number>();
  if (investAccounts.length === 1 && holdingRows.length === 1) {
    const list = longPricesBySymbol.get(holdingRows[0].symbol.toUpperCase()) ?? [];
    const latestClose = list.at(-1)?.close_cents;
    const todayValue = investTotals.get(todayIso) ?? 0;
    if (latestClose && todayValue > 0) {
      const shares = todayValue / latestClose;
      let close: number | null = null;
      let idx = 0;
      for (const day of dayKeys) {
        while (idx < list.length && list[idx].as_of <= day) close = list[idx++].close_cents;
        if (close !== null) priceValue.set(day, Math.round(shares * close));
      }
    }
  }
  const investAt = (day: string) => (day === todayIso ? investTotals.get(day) ?? 0 : priceValue.get(day) ?? investTotals.get(day) ?? 0);
  const netWorthDaily: SeriesPoint[] = dayKeys.map((day) => ({
    date: day,
    valueCents: day === todayIso ? netWorthCents : (dayTotals.get(day) ?? 0) - (investTotals.get(day) ?? 0) + investAt(day),
  }));
  const investmentDaily: SeriesPoint[] = dayKeys.map((day) => ({ date: day, valueCents: investAt(day) }));

  const netWorth5y: SeriesPoint[] = [];
  for (let y = now.getUTCFullYear() - 5; y < now.getUTCFullYear(); y++) {
    const d = iso(monthEnd(y, 11));
    if (d >= historyStart) netWorth5y.push({ date: d, valueCents: netWorthAt(d) });
  }
  netWorth5y.push({ date: todayIso, valueCents: netWorthCents });

  const accountsOut: Account[] = accounts.map((a) => {
    const cur = balanceAt(a.id, todayIso) ?? 0;
    const prev = balanceAt(a.id, lastMonthEnd);
    return {
      id: a.id,
      institution: a.institution,
      name: a.name,
      kind: a.kind,
      last4: a.last4,
      balanceCents: cur,
      creditLimitCents: a.credit_limit_cents,
      loanApr: a.loan_apr,
      loanPaymentCents: a.loan_payment_cents,
      loanPaymentsLeft: a.loan_payments_left,
      changeMtdCents: prev === null ? null : cur - prev,
    };
  });

  // Holdings
  const dailyByHolding = new Map<string, HoldingDailyRow[]>();
  for (const r of holdingDaily) {
    const list = dailyByHolding.get(r.holding_id) ?? [];
    list.push(r);
    dailyByHolding.set(r.holding_id, list);
  }
  const holdingValues = holdingRows.map((h) => {
    const list = dailyByHolding.get(h.id) ?? [];
    const latest = list.at(-1)?.value_cents ?? 0;
    const series: SeriesPoint[] = [];
    for (let i = 11; i >= 1; i--) {
      const d = iso(monthEnd(now.getUTCFullYear(), now.getUTCMonth() - i));
      let v: number | null = null;
      for (const r of list) if (r.as_of <= d) v = r.value_cents; else break;
      if (v !== null) series.push({ date: d, valueCents: v });
    }
    series.push({ date: todayIso, valueCents: latest });
    let prevMonth: number | null = null;
    for (const r of list) if (r.as_of <= lastMonthEnd) prevMonth = r.value_cents; else break;
    return { h, latest, series, prevMonth };
  });
  const investmentTotalCents = holdingValues.reduce((s, x) => s + x.latest, 0)
    || accountsOut.filter((a) => a.kind === "investment").reduce((s, a) => s + a.balanceCents, 0);
  const holdings: Holding[] = holdingValues.map(({ h, latest, series, prevMonth }) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    assetClass: h.asset_class,
    valueCents: latest,
    changeMtdPct: prevMonth ? ((latest - prevMonth) / prevMonth) * 100 : null,
    weightPct: investmentTotalCents ? (latest / investmentTotalCents) * 100 : 0,
    targetPct: h.target_pct,
    series,
    ...priceFields(pricesBySymbol.get(h.symbol.toUpperCase()) ?? [], latest),
  }));
  const invPrev = accountsOut.filter((a) => a.kind === "investment").reduce((s, a) => s + (a.balanceCents - (a.changeMtdCents ?? 0)), 0);
  const investmentChangeMtdPct = invPrev ? ((investmentTotalCents - invPrev) / invPrev) * 100 : null;

  // Spending & budget
  const isSpend = (t: TxnRow) => t.amount_cents < 0 && !t.is_transfer && !t.is_income;
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = monthEnd(now.getUTCFullYear(), now.getUTCMonth()).getUTCDate();
  const thisMonthSpend = txns.filter((t) => isSpend(t) && t.posted_on >= monthStart);
  const spentCents = thisMonthSpend.reduce((s, t) => s - t.amount_cents, 0);
  let budget: BudgetSummary | null = null;
  const budgetRow = budgetQ.data as { total_cents: number; budget_categories: { category: string; limit_cents: number }[] } | null;
  const monthlyIncomeCents = settings.paycheckNetCents ? settings.paycheckNetCents * settings.payDays.length : 0;
  const plan = planRows.length
    ? computePlan(planRows, txns.filter((t) => t.posted_on >= iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), -3)))), monthlyIncomeCents, now)
    : null;
  if (!budgetRow && plan) {
    // The essentials plan is the budget until one is saved by hand.
    const limits = planCategoryLimits(plan);
    const spentByCat = new Map<string, number>();
    for (const t of thisMonthSpend) spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) - t.amount_cents);
    const categories = [...limits.entries()].map(([category, limitCents]) => ({ category, limitCents, spentCents: spentByCat.get(category) ?? 0 }));
    for (const [cat, spent] of spentByCat) {
      if (!categories.some((c) => c.category === cat)) categories.push({ category: cat, limitCents: 0, spentCents: spent });
    }
    const total = [...limits.values()].reduce((a, b) => a + b, 0);
    budget = {
      month: ym(monthStart),
      totalCents: total,
      spentCents,
      remainingCents: total - spentCents,
      pctUsed: total ? Math.round((spentCents / total) * 100) : 0,
      dayOfMonth,
      daysInMonth,
      projectedCents: Math.round((spentCents / dayOfMonth) * daysInMonth),
      categories: markCommitments(categories.sort((a, b) => b.spentCents - a.spentCents), settings.tithePct),
      isSuggested: false,
      source: "plan",
    };
  } else if (!budgetRow) {
    // No budget saved yet: propose one from the last three full months so the page is never blank.
    const months: string[] = [];
    for (let i = 3; i >= 1; i--) months.push(ym(iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))));
    const past = txns.filter((t) => isSpend(t) && months.includes(ym(t.posted_on)));
    if (past.length) {
      const byCat = new Map<string, number>();
      for (const t of past) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount_cents);
      const monthsWithData = new Set(past.map((t) => ym(t.posted_on))).size || 1;
      const total = Math.ceil(past.reduce((s, t) => s - t.amount_cents, 0) / monthsWithData / 10000) * 10000;
      const spentByCat = new Map<string, number>();
      for (const t of thisMonthSpend) spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) - t.amount_cents);
      const pastIncome = txns.filter((t) => t.is_income && months.includes(ym(t.posted_on))).reduce((s, t) => s + t.amount_cents, 0);
      const pastPay = paychecks.filter((p) => months.includes(ym(p.pay_date))).reduce((s, p) => s + p.net_cents, 0);
      const avgIncome = (pastPay || pastIncome) / monthsWithData;
      const titheCents = Math.round((avgIncome * settings.tithePct) / 100 / 1000) * 1000;
      const categories = [...byCat.entries()].map(([category, sum]) => {
        const avg = Math.max(1000, Math.round(sum / monthsWithData / 1000) * 1000);
        return { category, limitCents: category === "Giving" ? Math.max(avg, titheCents) : avg, spentCents: spentByCat.get(category) ?? 0 };
      });
      if (titheCents > 0 && !categories.some((c) => c.category === "Giving")) {
        categories.push({ category: "Giving", limitCents: titheCents, spentCents: spentByCat.get("Giving") ?? 0 });
      }
      for (const [cat, spent] of spentByCat) {
        if (!categories.some((c) => c.category === cat)) categories.push({ category: cat, limitCents: 0, spentCents: spent });
      }
      budget = {
        month: ym(monthStart),
        totalCents: total,
        spentCents,
        remainingCents: total - spentCents,
        pctUsed: total ? Math.round((spentCents / total) * 100) : 0,
        dayOfMonth,
        daysInMonth,
        projectedCents: Math.round((spentCents / dayOfMonth) * daysInMonth),
        categories: markCommitments(categories.sort((a, b) => b.spentCents - a.spentCents), settings.tithePct),
        isSuggested: true,
        source: "suggested",
      };
    }
  }
  if (budgetRow) {
    const spentByCat = new Map<string, number>();
    for (const t of thisMonthSpend) spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) - t.amount_cents);
    const categories = (budgetRow.budget_categories ?? []).map((c) => ({
      category: c.category,
      limitCents: c.limit_cents,
      spentCents: spentByCat.get(c.category) ?? 0,
    }));
    for (const [cat, spent] of spentByCat) {
      if (!categories.some((c) => c.category === cat)) categories.push({ category: cat, limitCents: 0, spentCents: spent });
    }
    budget = {
      month: ym(monthStart),
      totalCents: budgetRow.total_cents,
      spentCents,
      remainingCents: budgetRow.total_cents - spentCents,
      pctUsed: budgetRow.total_cents ? Math.round((spentCents / budgetRow.total_cents) * 100) : 0,
      dayOfMonth,
      daysInMonth,
      projectedCents: Math.round((spentCents / dayOfMonth) * daysInMonth),
      categories: markCommitments(categories.sort((a, b) => b.spentCents - a.spentCents), settings.tithePct),
      source: "saved",
    };
  }

  const monthlyFlow: MonthlyFlow[] = [];
  const monthlySpending: MonthlySpending[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const m = ym(iso(d));
    const pay = paychecks.filter((p) => ym(p.pay_date) === m).reduce((s, p) => s + p.net_cents, 0);
    const incomeTx = txns.filter((t) => t.is_income && ym(t.posted_on) === m).reduce((s, t) => s + t.amount_cents, 0);
    const spend = txns.filter((t) => isSpend(t) && ym(t.posted_on) === m).reduce((s, t) => s - t.amount_cents, 0);
    monthlyFlow.push({ month: m, incomeCents: pay || incomeTx, spendCents: spend });
    const byCat = new Map<string, number>();
    for (const t of txns) {
      if (!isSpend(t) || ym(t.posted_on) !== m || t.category === "Reimbursed") continue;
      byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount_cents);
    }
    monthlySpending.push({
      month: m,
      spentCents: spend,
      incomeCents: pay || incomeTx,
      categories: [...byCat.entries()].map(([category, spentCents]) => ({ category, spentCents })).sort((a, b) => b.spentCents - a.spentCents),
    });
  }

  let savingsRatePct: number | null = null;
  if (paychecks.length) {
    const last3 = monthlyFlow.slice(-4, -1);
    const inc = last3.reduce((s, f) => s + f.incomeCents, 0);
    const sp = last3.reduce((s, f) => s + f.spendCents, 0);
    if (inc > 0) savingsRatePct = Math.round(((inc - sp) / inc) * 100);
  }

  // Credit & loans
  const credit: CreditSummary[] = accountsOut
    .filter((a) => a.kind === "credit")
    .map((a) => {
      const statements = [];
      for (let i = 5; i >= 0; i--) {
        const d = monthEnd(now.getUTCFullYear(), now.getUTCMonth() - i);
        const v = i === 0 ? balanceAt(a.id, todayIso) : balanceAt(a.id, iso(d));
        if (v !== null) statements.push({ month: ym(iso(d)), balanceCents: -v });
      }
      const owed = -a.balanceCents;
      return {
        accountId: a.id,
        name: `${a.institution} ${a.name}`.trim(),
        balanceCents: owed,
        limitCents: a.creditLimitCents ?? 0,
        utilizationPct: a.creditLimitCents ? Math.round((owed / a.creditLimitCents) * 100) : 0,
        dueOn: null,
        statements,
      };
    });

  const loans: LoanSummary[] = accountsOut
    .filter((a) => a.kind === "loan")
    .map((a) => {
      const owed = Math.max(0, -a.balanceCents);
      const apr = a.loanApr ?? 0;
      const lastPayment = txns.find((t) => t.account_id === a.id && t.amount_cents > 0)?.amount_cents ?? null;
      const payment = a.loanPaymentCents ?? lastPayment ?? (owed ? Math.ceil(owed / Math.max(1, a.loanPaymentsLeft ?? 36)) : 0);
      const base = amortize(owed, apr, payment, now);
      const fast = amortize(owed, apr, payment + 10000, now);
      return {
        accountId: a.id,
        name: `${a.institution} ${a.name}`.trim(),
        balanceCents: owed,
        apr,
        paymentCents: payment,
        paymentsLeft: a.loanPaymentsLeft ?? Math.max(0, base.length - 1),
        payoffCurve: base,
        acceleratedCurve: fast,
        monthsSavedWithExtra: Math.max(0, base.length - fast.length),
      };
    });

  const goals: Goal[] = goalRows.map((g) => {
    let required: number | null = null;
    if (g.target_date) {
      const months = Math.max(1, monthsBetween(now, new Date(`${g.target_date}T00:00:00Z`)));
      required = Math.max(0, Math.ceil((g.target_cents - g.saved_cents) / months));
    }
    return {
      id: g.id,
      name: g.name,
      targetCents: g.target_cents,
      savedCents: g.saved_cents,
      targetDate: g.target_date,
      monthlyPlanCents: g.monthly_plan_cents,
      requiredMonthlyCents: required,
      onTrack: required === null || g.saved_cents >= g.target_cents || (g.monthly_plan_cents ?? 0) >= required,
    };
  });

  const accountName = new Map(accountsOut.map((a) => [a.id, a.name]));
  const recentTransactions: Transaction[] = txns
    .filter((t) => !t.is_transfer && kindOf.get(t.account_id) !== "investment")
    .slice(0, 10)
    .map((t) => ({
    id: t.id,
    postedOn: t.posted_on,
    merchant: t.merchant,
    amountCents: t.amount_cents,
    category: t.category,
    accountName: accountName.get(t.account_id) ?? "",
    anomalyNote: t.anomaly_note,
    isIncome: t.is_income,
  }));

  const tickerCount = new Map<string, number>();
  if (!holdingRows.length) {
    for (const t of txns) {
      if (kindOf.get(t.account_id) !== "investment") continue;
      const m = t.merchant.match(/\(([A-Z]{1,5})\)/);
      if (m) tickerCount.set(m[1], (tickerCount.get(m[1]) ?? 0) + 1);
    }
  }
  const detectedTickers = [...tickerCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  const annotations: Annotation[] = notes
    .filter((n) => n.kind === "annotation" && n.anchor?.series && n.anchor?.date)
    .map((n) => ({ series: n.anchor!.series!, date: n.anchor!.date!, text: n.body }));
  const brief = notes.find((n) => n.kind === "brief")?.body ?? null;

  return {
    asOf: todayIso,
    syncedAt: lastSyncQ.data?.finished_at ?? lastSyncQ.data?.started_at ?? null,
    isSample: false,
    netWorthCents,
    changeMtdCents,
    changeYtdCents,
    changeSince,
    changeYtdPct: Math.round(changeYtdPct * 10) / 10,
    netWorth12m,
    netWorthDaily,
    investmentDaily,
    netWorth5y,
    savingsRatePct,
    accounts: accountsOut,
    holdings,
    investmentTotalCents,
    investmentChangeMtdPct: investmentChangeMtdPct === null ? null : Math.round(investmentChangeMtdPct * 10) / 10,
    budget,
    monthlyFlow,
    monthlySpending,
    credit,
    loans,
    goals,
    recentTransactions,
    annotations,
    brief,
    detectedTickers,
    settings,
    plan,
    historyNote: reconstructedBefore
      ? `History before ${reconstructedBefore} is reconstructed from transactions; market movement in investments is not captured until daily snapshots accumulate.`
      : null,
  };
}

function amortize(balanceCents: number, apr: number, paymentCents: number, start: Date): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
  if (balanceCents <= 0 || paymentCents <= 0) return [{ date: iso(start), valueCents: Math.max(0, Math.round(balanceCents)) }];
  const r = apr / 100 / 12;
  let b = balanceCents;
  let i = 0;
  while (b > 0 && i < 600) {
    pts.push({ date: iso(addMonths(start, i)), valueCents: Math.round(b) });
    b = b * (1 + r) - paymentCents;
    i++;
    if (paymentCents <= b * r && i > 1) break;
  }
  pts.push({ date: iso(addMonths(start, i)), valueCents: 0 });
  return pts;
}

function monthsBetween(a: Date, b: Date) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function markCommitments<T extends { category: string }>(categories: T[], tithePct: number): (T & { isCommitment?: boolean })[] {
  return categories.map((c) => (c.category === "Giving" && tithePct > 0 ? { ...c, isCommitment: true } : c));
}

function priceFields(rows: { as_of: string; close_cents: number }[], valueCents: number) {
  if (!rows.length) return { priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [] as SeriesPoint[] };
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const first = rows[0];
  return {
    priceCents: last.close_cents,
    priceAsOf: last.as_of,
    changeDayPct: prev ? ((last.close_cents - prev.close_cents) / prev.close_cents) * 100 : null,
    change3mPct: first !== last ? ((last.close_cents - first.close_cents) / first.close_cents) * 100 : null,
    impliedShares: last.close_cents ? valueCents / last.close_cents : null,
    priceSeries: rows.map((r) => ({ date: r.as_of, valueCents: r.close_cents })),
  };
}
