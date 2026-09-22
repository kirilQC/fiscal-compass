import type { Dashboard, SeriesPoint } from "./types";

const k = (n: number) => Math.round(n * 100);

function monthly(values: number[], endYear = 2026, endMonth = 9): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < values.length; i++) {
    const idx = endMonth - 1 - (values.length - 1 - i);
    const d = new Date(Date.UTC(endYear, idx, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push({ date: last.toISOString().slice(0, 10), valueCents: k(values[i]) });
  }
  return out;
}

function payoff(balance: number, apr: number, payment: number): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
  let b = balance;
  const r = apr / 100 / 12;
  const start = new Date(Date.UTC(2026, 8, 30));
  let i = 0;
  while (b > 0 && i < 120) {
    pts.push({ date: new Date(Date.UTC(2026, 8 + i, 30)).toISOString().slice(0, 10), valueCents: k(Math.max(0, b)) });
    b = b * (1 + r) - payment;
    i++;
  }
  pts.push({ date: new Date(Date.UTC(2026, 8 + i, 30)).toISOString().slice(0, 10), valueCents: 0 });
  void start;
  return pts;
}

function daily(monthlyValues: number[], endYear = 2026, endMonth = 9, endDay = 21): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const start = new Date(Date.UTC(endYear, endMonth - 1 - (monthlyValues.length - 1), 1));
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const pos = (i / days) * (monthlyValues.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(monthlyValues.length - 1, lo + 1);
    const base = monthlyValues[lo] + (monthlyValues[hi] - monthlyValues[lo]) * (pos - lo);
    const wobble = i === days ? 0 : rand() * 900 + Math.sin(i / 3) * 220;
    out.push({ date: d.toISOString().slice(0, 10), valueCents: k(Math.round(base + wobble)) });
  }
  return out;
}

const loanBase = payoff(14650, 4.9, 412);
const loanFast = payoff(14650, 4.9, 512);

export const sampleDashboard: Dashboard = {
  asOf: "2026-09-21",
  isSample: true,
  netWorthCents: k(84210),
  changeMtdCents: k(1240),
  changeYtdCents: k(9860),
  changeYtdPct: 13.3,
  netWorth12m: monthly([71200, 72000, 73400, 74300, 73900, 75800, 77100, 78600, 80200, 81500, 82970, 84210]),
  netWorthDaily: daily([71200, 72000, 73400, 74300, 73900, 75800, 77100, 78600, 80200, 81500, 82970, 84210]),
  netWorth5y: [
    { date: "2021-12-31", valueCents: k(18000) },
    { date: "2022-12-31", valueCents: k(31000) },
    { date: "2023-12-31", valueCents: k(47000) },
    { date: "2024-12-31", valueCents: k(62000) },
    { date: "2025-12-31", valueCents: k(74000) },
    { date: "2026-09-21", valueCents: k(84210) },
  ],
  savingsRatePct: 34,
  accounts: [
    { id: "a1", institution: "Chase", name: "Checking", kind: "checking", last4: "4471", balanceCents: k(6420), creditLimitCents: null, loanApr: null, loanPaymentCents: null, loanPaymentsLeft: null, changeMtdCents: k(380) },
    { id: "a2", institution: "Chase", name: "Savings", kind: "savings", last4: "9018", balanceCents: k(22800), creditLimitCents: null, loanApr: null, loanPaymentCents: null, loanPaymentsLeft: null, changeMtdCents: k(600) },
    { id: "a3", institution: "Chase", name: "Sapphire", kind: "credit", last4: "2203", balanceCents: -k(1340), creditLimitCents: k(12000), loanApr: null, loanPaymentCents: null, loanPaymentsLeft: null, changeMtdCents: k(50) },
    { id: "a4", institution: "Chase Auto", name: "Car loan", kind: "loan", last4: "7730", balanceCents: -k(14650), creditLimitCents: null, loanApr: 4.9, loanPaymentCents: k(412), loanPaymentsLeft: 38, changeMtdCents: k(352) },
    { id: "a5", institution: "Fidelity", name: "Brokerage", kind: "investment", last4: "5561", balanceCents: k(70980), creditLimitCents: null, loanApr: null, loanPaymentCents: null, loanPaymentsLeft: null, changeMtdCents: k(1460) },
  ],
  holdings: [
    { id: "h1", symbol: "FXAIX", name: "Fidelity 500 Index", assetClass: "us_equity", valueCents: k(31200), changeMtdPct: 2.4, weightPct: 44, targetPct: 45, priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [], series: monthly([27100, 27600, 28300, 28100, 28900, 29400, 29900, 30200, 30600, 30900, 30470, 31200]) },
    { id: "h2", symbol: "VTI", name: "Vanguard Total Market", assetClass: "us_equity", valueCents: k(18450), changeMtdPct: 1.9, weightPct: 26, targetPct: 25, priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [], series: monthly([16200, 16500, 16900, 16700, 17200, 17400, 17700, 17900, 18000, 18200, 18110, 18450]) },
    { id: "h3", symbol: "VXUS", name: "Vanguard Total Intl", assetClass: "intl_equity", valueCents: k(9830), changeMtdPct: 0.6, weightPct: 14, targetPct: 15, priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [], series: monthly([9200, 9300, 9500, 9400, 9550, 9600, 9700, 9650, 9720, 9760, 9770, 9830]) },
    { id: "h4", symbol: "BND", name: "Vanguard Total Bond", assetClass: "bond", valueCents: k(6100), changeMtdPct: 0.3, weightPct: 9, targetPct: 10, priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [], series: monthly([5850, 5880, 5900, 5920, 5960, 5990, 6010, 6030, 6050, 6070, 6082, 6100]) },
    { id: "h5", symbol: "SPAXX", name: "Cash", assetClass: "cash", valueCents: k(5400), changeMtdPct: 0.3, weightPct: 7, targetPct: 5, priceCents: null, priceAsOf: null, changeDayPct: null, change3mPct: null, impliedShares: null, priceSeries: [], series: monthly([4200, 4400, 4500, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5384, 5400]) },
  ],
  investmentTotalCents: k(70980),
  investmentChangeMtdPct: 2.1,
  budget: {
    month: "2026-09",
    totalCents: k(3000),
    spentCents: k(1870),
    remainingCents: k(1130),
    pctUsed: 62,
    dayOfMonth: 21,
    daysInMonth: 30,
    projectedCents: k(2670),
    categories: [
      { category: "Groceries", spentCents: k(412), limitCents: k(500) },
      { category: "Dining", spentCents: k(388), limitCents: k(400) },
      { category: "Transport", spentCents: k(214), limitCents: k(300) },
      { category: "Shopping", spentCents: k(506), limitCents: k(400) },
      { category: "Subscriptions", spentCents: k(129), limitCents: k(150) },
      { category: "Other", spentCents: k(221), limitCents: k(250) },
    ],
  },
  monthlyFlow: [
    { month: "2026-04", incomeCents: k(7880), spendCents: k(2810) },
    { month: "2026-05", incomeCents: k(7880), spendCents: k(3120) },
    { month: "2026-06", incomeCents: k(10280), spendCents: k(2640) },
    { month: "2026-07", incomeCents: k(7880), spendCents: k(2950) },
    { month: "2026-08", incomeCents: k(7880), spendCents: k(3380) },
    { month: "2026-09", incomeCents: k(3940), spendCents: k(1870) },
  ],
  monthlySpending: [
    { month: "2026-04", spentCents: k(2810), incomeCents: k(7880), categories: [{ category: "Groceries", spentCents: k(620) }, { category: "Dining", spentCents: k(540) }, { category: "Shopping", spentCents: k(610) }, { category: "Transport", spentCents: k(380) }, { category: "Subscriptions", spentCents: k(160) }, { category: "Other", spentCents: k(500) }] },
    { month: "2026-05", spentCents: k(3120), incomeCents: k(7880), categories: [{ category: "Groceries", spentCents: k(580) }, { category: "Dining", spentCents: k(720) }, { category: "Shopping", spentCents: k(840) }, { category: "Transport", spentCents: k(410) }, { category: "Subscriptions", spentCents: k(150) }, { category: "Other", spentCents: k(420) }] },
    { month: "2026-06", spentCents: k(2640), incomeCents: k(10280), categories: [{ category: "Groceries", spentCents: k(510) }, { category: "Dining", spentCents: k(460) }, { category: "Shopping", spentCents: k(520) }, { category: "Transport", spentCents: k(390) }, { category: "Subscriptions", spentCents: k(150) }, { category: "Other", spentCents: k(610) }] },
    { month: "2026-07", spentCents: k(2950), incomeCents: k(7880), categories: [{ category: "Groceries", spentCents: k(560) }, { category: "Dining", spentCents: k(610) }, { category: "Shopping", spentCents: k(700) }, { category: "Transport", spentCents: k(430) }, { category: "Subscriptions", spentCents: k(150) }, { category: "Other", spentCents: k(500) }] },
    { month: "2026-08", spentCents: k(3380), incomeCents: k(7880), categories: [{ category: "Groceries", spentCents: k(640) }, { category: "Dining", spentCents: k(760) }, { category: "Shopping", spentCents: k(900) }, { category: "Transport", spentCents: k(420) }, { category: "Subscriptions", spentCents: k(160) }, { category: "Other", spentCents: k(500) }] },
    { month: "2026-09", spentCents: k(1870), incomeCents: k(3940), categories: [{ category: "Shopping", spentCents: k(506) }, { category: "Groceries", spentCents: k(412) }, { category: "Dining", spentCents: k(388) }, { category: "Other", spentCents: k(221) }, { category: "Transport", spentCents: k(214) }, { category: "Subscriptions", spentCents: k(129) }] },
  ],
  credit: [
    {
      accountId: "a3",
      name: "Chase Sapphire",
      balanceCents: k(1340),
      limitCents: k(12000),
      utilizationPct: 11,
      dueOn: "2026-10-03",
      statements: [
        { month: "2026-04", balanceCents: k(980) },
        { month: "2026-05", balanceCents: k(1240) },
        { month: "2026-06", balanceCents: k(1610) },
        { month: "2026-07", balanceCents: k(1120) },
        { month: "2026-08", balanceCents: k(1390) },
        { month: "2026-09", balanceCents: k(1340) },
      ],
    },
  ],
  loans: [
    {
      accountId: "a4",
      name: "Car loan",
      balanceCents: k(14650),
      apr: 4.9,
      paymentCents: k(412),
      paymentsLeft: 38,
      payoffCurve: loanBase,
      acceleratedCurve: loanFast,
      monthsSavedWithExtra: loanBase.length - loanFast.length,
    },
  ],
  goals: [
    { id: "g1", name: "Emergency fund", targetCents: k(30000), savedCents: k(22800), targetDate: "2027-02-28", monthlyPlanCents: k(1450), requiredMonthlyCents: k(1440), onTrack: true },
    { id: "g2", name: "Japan trip", targetCents: k(6000), savedCents: k(2460), targetDate: "2027-03-31", monthlyPlanCents: k(410), requiredMonthlyCents: k(590), onTrack: false },
    { id: "g3", name: "Car down payment", targetCents: k(15000), savedCents: k(2700), targetDate: "2028-09-30", monthlyPlanCents: k(500), requiredMonthlyCents: k(512), onTrack: true },
  ],
  recentTransactions: [
    { id: "t1", postedOn: "2026-09-21", merchant: "Whole Foods", amountCents: -k(86.4), category: "Groceries", accountName: "Sapphire", anomalyNote: null, isIncome: false },
    { id: "t2", postedOn: "2026-09-20", merchant: "Shell", amountCents: -k(52.1), category: "Transport", accountName: "Sapphire", anomalyNote: null, isIncome: false },
    { id: "t3", postedOn: "2026-09-20", merchant: "Netflix", amountCents: -k(15.49), category: "Subscriptions", accountName: "Sapphire", anomalyNote: null, isIncome: false },
    { id: "t4", postedOn: "2026-09-19", merchant: "Sweetgreen", amountCents: -k(14.85), category: "Dining", accountName: "Sapphire", anomalyNote: null, isIncome: false },
    { id: "t5", postedOn: "2026-09-18", merchant: "Amazon", amountCents: -k(142.3), category: "Shopping", accountName: "Sapphire", anomalyNote: "2.3× your typical Amazon order", isIncome: false },
    { id: "t6", postedOn: "2026-09-15", merchant: "Payroll", amountCents: k(3940), category: "Income", accountName: "Checking", anomalyNote: null, isIncome: true },
  ],
  annotations: [
    { series: "net_worth", date: "2026-02-28", text: "Car repair −$1,100" },
    { series: "net_worth", date: "2026-06-30", text: "Bonus +$2,400" },
    { series: "net_worth", date: "2026-08-31", text: "Market +3.1%" },
  ],
  brief:
    "You've used 62% of September's budget with 9 days left — slightly ahead of pace. Shopping is $106 over; if you hold there you'll finish about $330 under. Japan trip needs $590/mo to hit March — you're at $410. Want me to bump the auto-transfer?",
};
