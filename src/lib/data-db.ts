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
  SeriesPoint,
  Transaction,
} from "./types";

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
  is_transfer: boolean; is_income: boolean; anomaly_note: string | null;
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

  const [accountsQ, balancesQ, txnsQ, holdingsQ, holdingsDailyQ, goalsQ, budgetQ, paychecksQ, notesQ] = await Promise.all([
    supabase.from("accounts").select("id,institution,name,kind,last4,credit_limit_cents,loan_apr,loan_payment_cents,loan_payments_left").eq("user_id", userId).eq("is_active", true),
    supabase.from("balances_daily").select("account_id,as_of,balance_cents").eq("user_id", userId).gte("as_of", since5y).order("as_of"),
    supabase.from("transactions").select("id,account_id,posted_on,amount_cents,merchant,category,is_transfer,is_income,anomaly_note").eq("user_id", userId).gte("posted_on", since6m).order("posted_on", { ascending: false }),
    supabase.from("holdings").select("id,account_id,symbol,name,asset_class,target_pct").eq("user_id", userId),
    supabase.from("holdings_daily").select("holding_id,as_of,value_cents").eq("user_id", userId).gte("as_of", since12m).order("as_of"),
    supabase.from("goals").select("id,name,target_cents,saved_cents,target_date,monthly_plan_cents,sort").eq("user_id", userId).order("sort"),
    supabase.from("budgets").select("id,month,total_cents,budget_categories(category,limit_cents)").eq("user_id", userId).eq("month", monthStart).maybeSingle(),
    supabase.from("paychecks").select("pay_date,net_cents").eq("user_id", userId).gte("pay_date", since6m),
    supabase.from("advisor_notes").select("kind,body,anchor,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);

  const accounts = (accountsQ.data ?? []) as AccountRow[];
  const balances = (balancesQ.data ?? []) as BalanceRow[];
  const txns = (txnsQ.data ?? []) as TxnRow[];
  const holdingRows = (holdingsQ.data ?? []) as HoldingRow[];
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
  const balanceAt = (accountId: string, date: string): number | null => {
    const list = histByAccount.get(accountId);
    if (!list) return null;
    let v: number | null = null;
    for (const b of list) {
      if (b.as_of <= date) v = b.balance_cents;
      else break;
    }
    return v;
  };
  const netWorthAt = (date: string) => accounts.reduce((s, a) => s + (balanceAt(a.id, date) ?? 0), 0);

  const netWorthCents = netWorthAt(todayIso);
  const lastMonthEnd = iso(monthEnd(now.getUTCFullYear(), now.getUTCMonth() - 1));
  const lastYearEnd = iso(monthEnd(now.getUTCFullYear() - 1, 11));
  const nwLastMonth = netWorthAt(lastMonthEnd);
  const nwLastYear = netWorthAt(lastYearEnd);
  const changeMtdCents = netWorthCents - nwLastMonth;
  const changeYtdCents = netWorthCents - nwLastYear;
  const changeYtdPct = nwLastYear ? (changeYtdCents / Math.abs(nwLastYear)) * 100 : 0;

  const netWorth12m: SeriesPoint[] = [];
  for (let i = 11; i >= 1; i--) {
    const d = monthEnd(now.getUTCFullYear(), now.getUTCMonth() - i);
    netWorth12m.push({ date: iso(d), valueCents: netWorthAt(iso(d)) });
  }
  netWorth12m.push({ date: todayIso, valueCents: netWorthCents });

  const netWorth5y: SeriesPoint[] = [];
  for (let y = now.getUTCFullYear() - 5; y < now.getUTCFullYear(); y++) {
    const d = iso(monthEnd(y, 11));
    if (d >= (balances[0]?.as_of ?? todayIso)) netWorth5y.push({ date: d, valueCents: netWorthAt(d) });
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
      categories: categories.sort((a, b) => b.spentCents - a.spentCents),
    };
  }

  const monthlyFlow: MonthlyFlow[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const m = ym(iso(d));
    const pay = paychecks.filter((p) => ym(p.pay_date) === m).reduce((s, p) => s + p.net_cents, 0);
    const incomeTx = txns.filter((t) => t.is_income && ym(t.posted_on) === m).reduce((s, t) => s + t.amount_cents, 0);
    const spend = txns.filter((t) => isSpend(t) && ym(t.posted_on) === m).reduce((s, t) => s - t.amount_cents, 0);
    monthlyFlow.push({ month: m, incomeCents: pay || incomeTx, spendCents: spend });
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
      const owed = -a.balanceCents;
      const apr = a.loanApr ?? 0;
      const payment = a.loanPaymentCents ?? Math.ceil(owed / Math.max(1, a.loanPaymentsLeft ?? 36));
      const base = amortize(owed, apr, payment, now);
      const fast = amortize(owed, apr, payment + 10000, now);
      return {
        accountId: a.id,
        name: `${a.institution} ${a.name}`.trim(),
        balanceCents: owed,
        apr,
        paymentCents: payment,
        paymentsLeft: a.loanPaymentsLeft ?? base.length - 1,
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
  const recentTransactions: Transaction[] = txns.slice(0, 8).map((t) => ({
    id: t.id,
    postedOn: t.posted_on,
    merchant: t.merchant,
    amountCents: t.amount_cents,
    category: t.category,
    accountName: accountName.get(t.account_id) ?? "",
    anomalyNote: t.anomaly_note,
    isIncome: t.is_income,
  }));

  const annotations: Annotation[] = notes
    .filter((n) => n.kind === "annotation" && n.anchor?.series && n.anchor?.date)
    .map((n) => ({ series: n.anchor!.series!, date: n.anchor!.date!, text: n.body }));
  const brief = notes.find((n) => n.kind === "brief")?.body ?? null;

  return {
    asOf: todayIso,
    isSample: false,
    netWorthCents,
    changeMtdCents,
    changeYtdCents,
    changeYtdPct: Math.round(changeYtdPct * 10) / 10,
    netWorth12m,
    netWorth5y,
    savingsRatePct,
    accounts: accountsOut,
    holdings,
    investmentTotalCents,
    investmentChangeMtdPct: investmentChangeMtdPct === null ? null : Math.round(investmentChangeMtdPct * 10) / 10,
    budget,
    monthlyFlow,
    credit,
    loans,
    goals,
    recentTransactions,
    annotations,
    brief,
  };
}

function amortize(balanceCents: number, apr: number, paymentCents: number, start: Date): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
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
