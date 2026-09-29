import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionTool } from "openai/resources/responses/responses";
import { computeInsights, monthShift, recurringCharges } from "./insights";
import type { Ledger, Txn } from "./ledger";

// Functions the advisor can call to look things up itself instead of guessing from a summary.
// All amounts go back to the model in dollars (not cents) so it never has to convert.

const d = (c: number) => Math.round(c) / 100;
const out = (t: Txn) => -t.cents;
const str = (description: string) => ({ type: "string", description });
const dateArg = (what: string) => ({ type: ["string", "null"], description: `${what} (YYYY-MM-DD, inclusive). Null for no bound.` });

export const TOOLS: FunctionTool[] = [
  {
    type: "function", name: "search_transactions", strict: false,
    description: "Find individual transactions. Use for questions about specific merchants, purchases, dates or amounts. Matches merchant text case-insensitively.",
    parameters: { type: "object", properties: {
      query: { type: ["string", "null"], description: "Text to match in the merchant name, e.g. 'uber' or 'kroger'." },
      category: { type: ["string", "null"], description: "Exact category, e.g. Dining, Groceries, Transport, Shopping, Subscriptions." },
      tag: { type: ["string", "null"], enum: ["essential", "discretionary", "untagged", null] },
      start: dateArg("Earliest date"), end: dateArg("Latest date"),
      min_amount: { type: ["number", "null"], description: "Minimum dollars spent." },
      include_income: { type: ["boolean", "null"], description: "Also return deposits and transfers." },
      sort: { type: ["string", "null"], enum: ["newest", "largest", null] },
      limit: { type: ["integer", "null"], description: "Max rows, default 40." },
    } },
  },
  {
    type: "function", name: "spending_breakdown", strict: false,
    description: "Total spending over a date range grouped by category, merchant, tag (essential/discretionary), month, week, weekday or account. Use for 'where did my money go', trends, and top merchants.",
    parameters: { type: "object", required: ["group_by"], properties: {
      group_by: { type: "string", enum: ["category", "merchant", "tag", "month", "week", "weekday", "account"] },
      start: dateArg("Start date"), end: dateArg("End date"),
      category: { type: ["string", "null"] }, tag: { type: ["string", "null"], enum: ["essential", "discretionary", "untagged", null] },
      query: { type: ["string", "null"], description: "Only merchants whose name contains this text." },
      top: { type: ["integer", "null"], description: "Keep the largest N groups, default 15." },
    } },
  },
  {
    type: "function", name: "compare_periods", strict: false,
    description: "Compare spending between two date ranges, grouped the same way, with the change for each group. Use for month-over-month or this-month-vs-usual questions.",
    parameters: { type: "object", required: ["a_start", "a_end", "b_start", "b_end", "group_by"], properties: {
      a_start: str("Period A start YYYY-MM-DD"), a_end: str("Period A end YYYY-MM-DD"), b_start: str("Period B start YYYY-MM-DD"), b_end: str("Period B end YYYY-MM-DD"),
      group_by: { type: "string", enum: ["category", "merchant", "tag"] },
      tag: { type: ["string", "null"], enum: ["essential", "discretionary", "untagged", null] },
    } },
  },
  { type: "function", name: "recurring_charges", strict: false, description: "Subscriptions and other charges that repeat monthly: typical amount, usual day, whether this month's charge came, changed or is late, and which are new.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "essentials_status", strict: false, description: "This month's essential expenses plan: each bill's estimate, what was actually caught, paid date, and status (paid, due, overdue, varies).", parameters: { type: "object", properties: {} } },
  { type: "function", name: "accounts_overview", strict: false, description: "Every linked account with its latest balance, credit limits and utilization, and loan terms; plus paychecks received in the last 3 months.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "current_insights", strict: false, description: "The automatic analysis of this month (pace, discretionary cap, essentials over estimate, merchant spikes, new places, recurring changes, cash and credit). Already summarized in your instructions; call only to refresh.", parameters: { type: "object", properties: {} } },
  {
    type: "function", name: "remember", strict: false,
    description: "Save a lasting fact Kiril tells you about his money or preferences (e.g. 'Kings Crossing is the wedding venue', 'I'm saving for a house by 2028'). Use when he states something that should shape future advice. Do not save transient numbers.",
    parameters: { type: "object", required: ["fact"], properties: { fact: str("The fact, one sentence, written about Kiril in third person.") } },
  },
  { type: "function", name: "forget", strict: false, description: "Remove a saved fact that Kiril says is wrong or no longer true.", parameters: { type: "object", required: ["fact_id"], properties: { fact_id: str("The id shown next to the fact in your instructions.") } } },
];

function inRange(t: Txn, start?: string | null, end?: string | null) {
  return (!start || t.date >= start) && (!end || t.date <= end);
}
function matches(t: Txn, a: { category?: string | null; tag?: string | null; query?: string | null }) {
  if (a.category && t.category.toLowerCase() !== a.category.toLowerCase()) return false;
  if (a.tag && t.tag !== a.tag) return false;
  if (a.query && !`${t.merchant} ${t.key}`.toLowerCase().includes(a.query.toLowerCase())) return false;
  return true;
}
const weekOf = (iso: string) => { const dt = new Date(`${iso}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
function groupKey(t: Txn, by: string) {
  switch (by) {
    case "category": return t.category;
    case "merchant": return t.key;
    case "tag": return t.tag ?? "untagged";
    case "month": return t.date.slice(0, 7);
    case "week": return `week of ${weekOf(t.date)}`;
    case "weekday": return new Date(`${t.date}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
    case "account": return t.account;
    default: return t.category;
  }
}
function group(txns: Txn[], by: string) {
  const m = new Map<string, { cents: number; count: number }>();
  for (const t of txns) { const k = groupKey(t, by); const e = m.get(k) ?? { cents: 0, count: 0 }; e.cents += out(t); e.count++; m.set(k, e); }
  return m;
}

type Args = Record<string, unknown>;

export async function runTool(name: string, args: Args, L: Ledger, db: { supabase: SupabaseClient; userId: string }): Promise<unknown> {
  const a = args as Record<string, never>;
  switch (name) {
    case "search_transactions": {
      const pool = a.include_income ? L.txns : L.spend;
      let rows = pool.filter((t) => inRange(t, a.start, a.end) && matches(t, a) && (a.min_amount == null || Math.abs(t.cents) >= Number(a.min_amount) * 100));
      if (a.sort === "largest") rows = [...rows].sort((x, y) => Math.abs(y.cents) - Math.abs(x.cents));
      const total = rows.reduce((s, t) => s + (t.cents < 0 ? out(t) : 0), 0);
      return { matched: rows.length, total_spent: d(total), rows: rows.slice(0, Math.min(Number(a.limit) || 40, 120)).map((t) => ({ date: t.date, merchant: t.merchant, amount: d(t.cents), category: t.category, tag: t.tag, account: t.account, pending: t.pending || undefined })) };
    }
    case "spending_breakdown": {
      const rows = L.spend.filter((t) => inRange(t, a.start, a.end) && matches(t, a));
      const g = [...group(rows, String(a.group_by))].map(([k, v]) => ({ group: k, spent: d(v.cents), count: v.count }));
      if (["month", "week"].includes(String(a.group_by))) g.sort((x, y) => x.group.localeCompare(y.group)); else g.sort((x, y) => y.spent - x.spent);
      const total = rows.reduce((s, t) => s + out(t), 0);
      return { total_spent: d(total), transactions: rows.length, groups: String(a.group_by) === "month" || String(a.group_by) === "week" ? g : g.slice(0, Number(a.top) || 15) };
    }
    case "compare_periods": {
      const pick = (s: string, e: string) => L.spend.filter((t) => inRange(t, s, e) && (!a.tag || t.tag === a.tag));
      const A = group(pick(a.a_start, a.a_end), String(a.group_by)), B = group(pick(a.b_start, a.b_end), String(a.group_by));
      const keys = new Set([...A.keys(), ...B.keys()]);
      const rows = [...keys].map((k) => ({ group: k, a: d(A.get(k)?.cents ?? 0), b: d(B.get(k)?.cents ?? 0) })).map((r) => ({ ...r, change: Math.round((r.b - r.a) * 100) / 100 })).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
      const tot = (m: Map<string, { cents: number }>) => d([...m.values()].reduce((s, v) => s + v.cents, 0));
      return { period_a_total: tot(A), period_b_total: tot(B), note: "change = B minus A", groups: rows.slice(0, 20) };
    }
    case "recurring_charges":
      return recurringCharges(L).map((r) => ({ merchant: r.key, category: r.category, typical_amount: d(r.typicalCents), usual_day: r.typicalDay, months_seen: r.months, this_month: d(r.thisMonthCents), status: r.status, new: r.isNew }));
    case "essentials_status":
      return (L.plan?.items ?? []).map((i) => ({ name: i.name, category: i.category, estimate: d(i.expectedCents), caught: d(i.paidCents), status: i.status, paid_on: i.paidOn, due_day: i.dueDay, reimbursed: i.isReimbursed || undefined }));
    case "accounts_overview":
      return { accounts: L.accounts.map((x) => ({ name: `${x.institution} ${x.name}`, kind: x.kind, balance: x.balanceCents == null ? null : d(x.balanceCents), as_of: x.balanceAsOf, credit_limit: x.creditLimitCents ? d(x.creditLimitCents) : undefined, utilization_pct: x.creditLimitCents && x.balanceCents != null ? Math.round((Math.abs(x.balanceCents) / x.creditLimitCents) * 100) : undefined, apr: x.loanApr ?? undefined, monthly_payment: x.loanPaymentCents ? d(x.loanPaymentCents) : undefined, payments_left: x.loanPaymentsLeft ?? undefined })),
        paychecks: L.paychecks.filter((p) => p.date >= `${monthShift(L.month, -2)}-01`).map((p) => ({ date: p.date, amount: d(p.cents) })) };
    case "current_insights":
      return computeInsights(L).map((i) => ({ level: i.level, title: i.title, detail: i.detail }));
    case "remember": {
      const fact = String(a.fact ?? "").trim().slice(0, 500);
      if (!fact) return { ok: false };
      const { data, error } = await db.supabase.from("advisor_notes").insert({ user_id: db.userId, kind: "memory", body: fact }).select("id").single();
      if (error) return { ok: false, error: error.message };
      L.memories.push({ id: data.id, body: fact, createdAt: new Date().toISOString() });
      return { ok: true, id: data.id };
    }
    case "forget": {
      const { error } = await db.supabase.from("advisor_notes").delete().eq("user_id", db.userId).eq("kind", "memory").eq("id", String(a.fact_id));
      return { ok: !error, error: error?.message };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

/** A short present-tense label for the status line while a tool runs. */
export function toolStatus(name: string, args: Args): string {
  const q = typeof args.query === "string" && args.query ? ` for "${args.query}"` : typeof args.category === "string" && args.category ? ` in ${args.category}` : "";
  switch (name) {
    case "search_transactions": return `Searching transactions${q}`;
    case "spending_breakdown": return `Breaking down spending by ${String(args.group_by ?? "category")}`;
    case "compare_periods": return "Comparing the two periods";
    case "recurring_charges": return "Checking recurring charges";
    case "essentials_status": return "Checking your essential bills";
    case "accounts_overview": return "Looking at your accounts";
    case "current_insights": return "Re-running this month's analysis";
    case "remember": return "Saving that for next time";
    case "forget": return "Forgetting that";
    default: return "Working";
  }
}
