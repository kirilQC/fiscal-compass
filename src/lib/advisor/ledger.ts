import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlan, getPlanRows, type PlanRow } from "../plan";
import { getUserSettings, type UserSettings } from "../settings";
import { essentialPatterns, isSpend, normalizeMerchant, spendClass, tagMemory, type Tag } from "../spend";
import { defaultBudgetCents } from "../discretionary";
import type { PlanSummary } from "../types";

// Everything the advisor reasons over, loaded in one round of queries and kept in memory for the request.

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  cents: number; // signed: negative = money out
  merchant: string;
  key: string; // normalized merchant, stable across store numbers and reference codes
  category: string;
  account: string;
  accountKind: string;
  tag: Tag | null; // essential | discretionary | untagged; null for income and internal moves
  pending: boolean;
  isIncome: boolean;
  isTransfer: boolean;
}

export interface AccountInfo {
  id: string;
  name: string;
  institution: string;
  kind: string;
  balanceCents: number | null;
  balanceAsOf: string | null;
  creditLimitCents: number | null;
  loanApr: number | null;
  loanPaymentCents: number | null;
  loanPaymentsLeft: number | null;
}

export interface Ledger {
  today: string;
  month: string; // YYYY-MM
  dayOfMonth: number;
  daysInMonth: number;
  txns: Txn[]; // newest first, last ~13 months
  spend: Txn[]; // outflows that count as spending
  accounts: AccountInfo[];
  settings: UserSettings;
  planRows: PlanRow[];
  plan: PlanSummary | null;
  incomeCents: number; // expected monthly take-home
  discretionaryCapCents: number;
  paychecks: { date: string; cents: number }[];
  memories: { id: string; body: string; createdAt: string }[];
  conversations: PastConversation[]; // most recent first
  askedQuestionIds: Set<string>; // questions Sterling has already put to Kiril
}

export interface PastConversation {
  id: string;
  title: string;
  updatedAt: string;
  asked: string; // his first question
  answered: string; // the opening of Sterling's first reply
}

const clean = (s: string) => s.replace(/^\u001d[^\u001d]*\u001d/, "").replace(/```chart[\s\S]*?```/g, "[chart]").replace(/\s+/g, " ").trim();

const ym = (d: string) => d.slice(0, 7);

export async function loadLedger(supabase: SupabaseClient, userId: string, now = new Date()): Promise<Ledger> {
  const today = now.toISOString().slice(0, 10);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)).toISOString().slice(0, 10);
  const [txQ, acctQ, balQ, planRows, settings, payQ, memQ, conversations, askedQ] = await Promise.all([
    supabase.from("transactions").select("id,posted_on,amount_cents,merchant,category,account_id,is_transfer,is_income,status,spend_class").eq("user_id", userId).gte("posted_on", since).order("posted_on", { ascending: false }).limit(6000),
    supabase.from("accounts").select("id,institution,name,kind,credit_limit_cents,loan_apr,loan_payment_cents,loan_payments_left").eq("user_id", userId).eq("is_active", true),
    supabase.from("balances_daily").select("account_id,as_of,balance_cents").eq("user_id", userId).gte("as_of", new Date(now.getTime() - 40 * 86400_000).toISOString().slice(0, 10)).order("as_of", { ascending: false }),
    getPlanRows(supabase, userId),
    getUserSettings(supabase, userId),
    supabase.from("paychecks").select("pay_date,net_cents").eq("user_id", userId).gte("pay_date", since).order("pay_date", { ascending: false }),
    supabase.from("advisor_notes").select("id,body,created_at").eq("user_id", userId).eq("kind", "memory").order("created_at", { ascending: true }).limit(100),
    loadConversations(supabase, userId),
    supabase.from("advisor_notes").select("anchor").eq("user_id", userId).eq("kind", "question").limit(500),
  ]);

  const latest = new Map<string, { as_of: string; balance_cents: number }>();
  for (const b of balQ.data ?? []) if (!latest.has(b.account_id)) latest.set(b.account_id, b);
  const accounts: AccountInfo[] = (acctQ.data ?? []).map((a) => ({
    id: a.id, name: a.name, institution: a.institution, kind: a.kind,
    balanceCents: latest.get(a.id)?.balance_cents ?? null, balanceAsOf: latest.get(a.id)?.as_of ?? null,
    creditLimitCents: a.credit_limit_cents, loanApr: a.loan_apr, loanPaymentCents: a.loan_payment_cents, loanPaymentsLeft: a.loan_payments_left,
  }));
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  const rows = txQ.data ?? [];
  const classifier = { patterns: essentialPatterns(planRows), memory: tagMemory(rows.filter((r) => r.spend_class)) };
  const txns: Txn[] = rows.map((r) => ({
    id: r.id, date: r.posted_on, cents: r.amount_cents, merchant: r.merchant, key: normalizeMerchant(r.merchant),
    category: r.category, account: acctById.get(r.account_id)?.name ?? "", accountKind: acctById.get(r.account_id)?.kind ?? "",
    tag: spendClass(r, classifier), pending: r.status === "pending", isIncome: r.is_income, isTransfer: r.is_transfer,
  }));
  const spend = txns.filter((t) => isSpend({ amount_cents: t.cents, is_income: t.isIncome, is_transfer: t.isTransfer, merchant: t.merchant, category: t.category }));

  const paychecks = (payQ.data ?? []).map((p) => ({ date: p.pay_date, cents: p.net_cents }));
  const recentPay = paychecks.filter((p) => p.date >= new Date(now.getTime() - 92 * 86400_000).toISOString().slice(0, 10));
  const incomeCents = settings.paycheckNetCents ? settings.paycheckNetCents * settings.payDays.length : recentPay.length ? Math.round(recentPay.reduce((t, p) => t + p.cents, 0) / 3) : 0;

  const monthStartGrace = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), -3)).toISOString().slice(0, 10);
  const planTxns = rows.filter((r) => r.posted_on >= monthStartGrace).map((r) => ({ id: r.id, posted_on: r.posted_on, amount_cents: r.amount_cents, merchant: r.merchant, category: r.category, is_transfer: r.is_transfer, is_income: r.is_income, spend_class: r.spend_class }));
  const plan = planRows.length ? computePlan(planRows, planTxns, incomeCents, now) : null;
  const available = Math.max(0, incomeCents - (plan?.totalCents ?? 0));

  return {
    today, month: ym(today), dayOfMonth: now.getUTCDate(), daysInMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate(),
    txns, spend, accounts, settings, planRows, plan, incomeCents,
    discretionaryCapCents: settings.discretionaryBudgetCents ?? defaultBudgetCents(available),
    paychecks, memories: (memQ.data ?? []).map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at })), conversations,
    askedQuestionIds: new Set((askedQ.data ?? []).map((r) => String((r.anchor as { qid?: string } | null)?.qid ?? ""))),
  };
}

// The last dozen conversations, each reduced to its opening question and the start of the answer, so Sterling
// can pick up threads from earlier sessions without being told twice.
async function loadConversations(supabase: SupabaseClient, userId: string): Promise<PastConversation[]> {
  const { data: threads } = await supabase.from("chat_threads").select("id,title,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(12);
  if (!threads?.length) return [];
  const { data: msgs } = await supabase.from("chat_messages").select("thread_id,role,content,created_at").in("thread_id", threads.map((t) => t.id)).order("created_at", { ascending: true }).limit(400);
  return threads.map((t) => {
    const mine = (msgs ?? []).filter((m) => m.thread_id === t.id);
    const q = mine.find((m) => m.role === "user");
    const a = mine.find((m) => m.role === "assistant" && m.created_at >= (q?.created_at ?? ""));
    return { id: t.id, title: t.title, updatedAt: t.updated_at, asked: clean(q?.content ?? "").slice(0, 160), answered: clean(a?.content ?? "").slice(0, 240) };
  }).filter((c) => c.asked);
}
