export type AccountKind = "checking" | "savings" | "credit" | "loan" | "investment" | "other";

export interface Account {
  id: string;
  institution: string;
  name: string;
  kind: AccountKind;
  last4: string | null;
  balanceCents: number; // liabilities negative
  creditLimitCents: number | null;
  loanApr: number | null;
  loanPaymentCents: number | null;
  loanPaymentsLeft: number | null;
  changeMtdCents: number | null;
}

export interface SeriesPoint {
  date: string; // ISO date
  valueCents: number;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string | null;
  assetClass: string | null;
  valueCents: number;
  changeMtdPct: number | null;
  weightPct: number;
  targetPct: number | null;
  series: SeriesPoint[];
}

export interface CategoryBudget {
  category: string;
  spentCents: number;
  limitCents: number;
}

export interface BudgetSummary {
  month: string; // YYYY-MM
  totalCents: number;
  spentCents: number;
  remainingCents: number;
  pctUsed: number; // 0-100
  dayOfMonth: number;
  daysInMonth: number;
  projectedCents: number;
  categories: CategoryBudget[];
  isSuggested?: boolean;
}

export interface MonthlyFlow {
  month: string; // YYYY-MM
  incomeCents: number;
  spendCents: number;
}

export interface CreditSummary {
  accountId: string;
  name: string;
  balanceCents: number; // positive owed
  limitCents: number;
  utilizationPct: number;
  dueOn: string | null;
  statements: { month: string; balanceCents: number }[];
}

export interface LoanSummary {
  accountId: string;
  name: string;
  balanceCents: number; // positive owed
  apr: number;
  paymentCents: number;
  paymentsLeft: number;
  payoffCurve: SeriesPoint[];
  acceleratedCurve: SeriesPoint[]; // +$100/mo scenario
  monthsSavedWithExtra: number;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  targetDate: string | null;
  monthlyPlanCents: number | null;
  requiredMonthlyCents: number | null;
  onTrack: boolean;
}

export interface Transaction {
  id: string;
  postedOn: string;
  merchant: string;
  amountCents: number;
  category: string;
  accountName: string;
  anomalyNote: string | null;
  isIncome: boolean;
}

export interface Annotation {
  series: string;
  date: string;
  text: string;
}

export interface Dashboard {
  asOf: string;
  isSample: boolean;
  needsSetup?: boolean;
  loadError?: string;
  historyNote?: string | null;
  netWorthCents: number;
  changeMtdCents: number;
  changeYtdCents: number;
  changeYtdPct: number;
  changeSince?: string;
  netWorth12m: SeriesPoint[];
  netWorth5y: SeriesPoint[];
  savingsRatePct: number | null;
  accounts: Account[];
  holdings: Holding[];
  investmentTotalCents: number;
  investmentChangeMtdPct: number | null;
  budget: BudgetSummary | null;
  monthlyFlow: MonthlyFlow[];
  credit: CreditSummary[];
  loans: LoanSummary[];
  goals: Goal[];
  recentTransactions: Transaction[];
  annotations: Annotation[];
  brief: string | null;
}
