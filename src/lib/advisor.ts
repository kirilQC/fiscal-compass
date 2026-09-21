import OpenAI from "openai";
import type { Dashboard } from "./types";
import { money, signed, pct } from "./format";

const MODEL = process.env.OPENAI_MODEL || "gpt-5";

let client: OpenAI | null = null;
export function openai() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const kindLabel: Record<string, string> = {
  checking: "checking",
  savings: "savings",
  credit: "credit card",
  loan: "loan",
  investment: "investment",
  other: "other",
};

export function buildContext(d: Dashboard): string {
  const L: string[] = [];
  L.push(`Date: ${d.asOf}${d.isSample ? " (SAMPLE DATA — accounts not yet linked)" : ""}`);
  L.push(`Net worth: ${money(d.netWorthCents)} (${signed(d.changeMtdCents)} this month, ${signed(d.changeYtdCents)} / ${pct(d.changeYtdPct)} YTD)`);
  if (d.netWorth12m.length) {
    L.push(`Net worth, last 12 months: ${d.netWorth12m.map((p) => `${p.date.slice(0, 7)} ${money(p.valueCents)}`).join("; ")}`);
  }
  if (d.savingsRatePct != null) L.push(`Savings rate: ${d.savingsRatePct}%`);

  const st = d.settings;
  if (st) {
    L.push("\nStanding commitments and context:");
    L.push(`- Tithe: ${st.tithePct}% of income to church, a fixed commitment (sometimes more). Never treat Giving as overspending or suggest cutting it.`);
    if (st.paycheckNetCents) L.push(`- Expected take-home per paycheck: ${money(st.paycheckNetCents)}, landing on day(s) ${st.payDays.join(" and ")} of each month (about ${money(st.paycheckNetCents * st.payDays.length)}/month).`);
    else L.push(`- Paychecks land on day(s) ${st.payDays.join(" and ")} of each month (Gusto payroll deposits are detected automatically).`);
    if (st.notes.trim()) L.push(`- Notes from Kiril: ${st.notes.trim()}`);
  }

  L.push("\nAccounts:");
  for (const a of d.accounts) {
    const extra: string[] = [];
    if (a.creditLimitCents) extra.push(`limit ${money(a.creditLimitCents)}`);
    if (a.loanApr != null) extra.push(`${a.loanApr}% APR`);
    if (a.loanPaymentCents) extra.push(`${money(a.loanPaymentCents)}/mo`);
    if (a.loanPaymentsLeft != null) extra.push(`${a.loanPaymentsLeft} payments left`);
    if (a.changeMtdCents != null) extra.push(`${signed(a.changeMtdCents)} MTD`);
    L.push(`- ${a.institution} ${a.name} (${kindLabel[a.kind] ?? a.kind}): ${money(a.balanceCents)}${extra.length ? ` — ${extra.join(", ")}` : ""}`);
  }

  if (d.holdings.length) {
    L.push(`\nInvestments: ${money(d.investmentTotalCents)}${d.investmentChangeMtdPct != null ? ` (${pct(d.investmentChangeMtdPct)} MTD)` : ""}`);
    for (const h of d.holdings) {
      L.push(`- ${h.symbol}${h.name ? ` ${h.name}` : ""}: ${money(h.valueCents)}, ${h.weightPct}% of portfolio${h.targetPct != null ? ` (target ${h.targetPct}%)` : ""}${h.changeMtdPct != null ? `, ${pct(h.changeMtdPct)} MTD` : ""}`);
    }
  }

  if (d.budget) {
    const b = d.budget;
    L.push(`\nBudget ${b.month}: ${money(b.totalCents)} total, spent ${money(b.spentCents)} (${b.pctUsed}%) on day ${b.dayOfMonth} of ${b.daysInMonth}; ${money(b.remainingCents)} left; projected month-end ${money(b.projectedCents)}`);
    for (const c of b.categories) {
      const over = c.spentCents > c.limitCents && c.category !== "Giving";
      L.push(`- ${c.category}: ${money(c.spentCents)} / ${money(c.limitCents)}${c.category === "Giving" ? " — tithe, a commitment" : over ? ` — OVER by ${money(c.spentCents - c.limitCents)}` : c.limitCents && c.spentCents / c.limitCents > 0.9 ? " — near limit" : ""}`);
    }
  } else {
    L.push("\nBudget: none set.");
  }

  if (d.monthlyFlow.length) {
    L.push("\nIncome vs spend by month:");
    for (const m of d.monthlyFlow) L.push(`- ${m.month}: in ${money(m.incomeCents)}, out ${money(m.spendCents)}`);
  }

  for (const c of d.credit) {
    L.push(`\nCredit — ${c.name}: owes ${money(c.balanceCents)} of ${money(c.limitCents)} limit (${c.utilizationPct}% utilization)${c.dueOn ? `, due ${c.dueOn}` : ""}`);
    if (c.statements.length) L.push(`  Statement balances: ${c.statements.map((s) => `${s.month} ${money(s.balanceCents)}`).join("; ")}`);
  }

  for (const l of d.loans) {
    L.push(`\nLoan — ${l.name}: ${money(l.balanceCents)} at ${l.apr}% APR, ${money(l.paymentCents)}/mo, ${l.paymentsLeft} payments left (${l.payoffCurve.at(-1)?.date ?? "n/a"} payoff). Paying +$100/mo finishes ${l.monthsSavedWithExtra} months sooner.`);
  }

  if (d.goals.length) {
    L.push("\nGoals:");
    for (const g of d.goals) {
      const p = Math.round((g.savedCents / g.targetCents) * 100);
      L.push(`- ${g.name}: ${money(g.savedCents)} / ${money(g.targetCents)} (${p}%)${g.targetDate ? `, target ${g.targetDate}` : ""}${g.monthlyPlanCents != null ? `, saving ${money(g.monthlyPlanCents)}/mo` : ""}${g.requiredMonthlyCents != null ? `, needs ${money(g.requiredMonthlyCents)}/mo` : ""} — ${g.onTrack ? "on track" : "BEHIND"}`);
    }
  }

  if (d.recentTransactions.length) {
    L.push("\nRecent transactions:");
    for (const t of d.recentTransactions.slice(0, 8)) {
      L.push(`- ${t.postedOn} ${t.merchant} ${signed(t.amountCents)} [${t.category}, ${t.accountName}]${t.anomalyNote ? ` — ANOMALY: ${t.anomalyNote}` : ""}`);
    }
  }

  if (d.annotations.length) {
    L.push("\nNotable events:");
    for (const a of d.annotations) L.push(`- ${a.date} (${a.series}): ${a.text}`);
  }

  return L.join("\n");
}

export function systemPrompt(context: string): string {
  return `You are Kiril's personal financial advisor inside his own app, Fiscal Compass. You see every account he owns.

How to work:
- Be precise and plain-spoken. Lead with the number, then the reasoning, then the action.
- Use ONLY the figures in the snapshot below. Never invent balances, rates, dates, or transactions. If something you need is not in the snapshot (for example paychecks not yet linked, or a holding without history), say so in one sentence and answer with what you have.
- Do arithmetic explicitly and show the key step when it matters (e.g. "$590 − $410 = $180 more per month").
- Give concrete next actions Kiril can take today. Prefer one clear recommendation over a menu.
- Short paragraphs. Bullet lists only when comparing options. No emojis. No headers.
- When giving an opinion about investments, add at most one short line noting it is general guidance, not licensed advice. Do not repeat disclaimers.
- Refer to the user as "you". Do not mention that you are an AI or that this is a snapshot unless asked.

Financial snapshot:
${context}`;
}

export function suggestedPrompts(d: Dashboard): string[] {
  const out: string[] = [];
  const over = d.budget?.categories.find((c) => c.spentCents > c.limitCents);
  if (over) out.push(`How do I get ${over.category} back under ${money(over.limitCents)} this month?`);
  else if (d.budget) out.push(`Am I on pace to stay under ${money(d.budget.totalCents)} this month?`);

  const behind = d.goals.find((g) => !g.onTrack) ?? d.goals[0];
  if (behind) out.push(`Am I on track for the ${behind.name.toLowerCase()}?`);

  const loan = d.loans[0];
  if (loan) out.push(`Should I pay the ${loan.name.toLowerCase()} off faster?`);
  else if (d.holdings.length) out.push("Is my portfolio allocation where it should be?");

  if (out.length < 3) out.push("Why did my net worth change this month?");
  return out.slice(0, 3);
}

export async function generateBrief(d: Dashboard): Promise<string> {
  const ai = openai();
  if (!ai) return fallbackBrief(d);
  try {
    const res = await ai.responses.create({
      model: MODEL,
      instructions: systemPrompt(buildContext(d)),
      input:
        "Write this morning's brief for Kiril: 3 to 5 sentences, one paragraph. Cover budget pace (percent used vs day of month), the most important category or anomaly, and the goal that most needs attention. End with one question offering a specific action.",
    });
    return res.output_text?.trim() || fallbackBrief(d);
  } catch {
    return fallbackBrief(d);
  }
}

function fallbackBrief(d: Dashboard): string {
  if (d.brief) return d.brief;
  const b = d.budget;
  if (!b) return `Net worth is ${money(d.netWorthCents)}, ${signed(d.changeMtdCents)} this month. No budget is set yet.`;
  return `You've used ${b.pctUsed}% of this month's budget on day ${b.dayOfMonth} of ${b.daysInMonth}, with ${money(b.remainingCents)} left. Net worth is ${money(d.netWorthCents)}, ${signed(d.changeMtdCents)} this month.`;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function* streamReply(d: Dashboard, history: ChatTurn[]): AsyncGenerator<string> {
  const ai = openai();
  if (!ai) {
    yield "The advisor isn't connected yet — add OPENAI_API_KEY to the environment and I'll be able to answer.";
    return;
  }
  const instructions = systemPrompt(buildContext(d));
  const input = history.map((m) => ({ role: m.role, content: m.content }));
  try {
    const stream = await ai.responses.create({ model: MODEL, instructions, input, stream: true });
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") yield ev.delta;
    }
  } catch (err) {
    const res = await ai.responses.create({ model: MODEL, instructions, input });
    yield res.output_text ?? `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}
