import type { Dashboard } from "./types";
import { money, signed } from "./format";

export function buildBrief(d: Dashboard) {
  const monthName = new Date(`${d.asOf}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const b = d.budget;
  const overCategories = (b?.categories ?? [])
    .filter((c) => c.limitCents > 0 && c.spentCents > c.limitCents)
    .map((c) => ({ category: c.category, overCents: c.spentCents - c.limitCents }));
  const goalsOffTrack = d.goals
    .filter((g) => !g.onTrack)
    .map((g) => ({ name: g.name, requiredMonthlyCents: g.requiredMonthlyCents, monthlyPlanCents: g.monthlyPlanCents, targetDate: g.targetDate }));
  const anomalies = d.recentTransactions
    .filter((t) => t.anomalyNote)
    .map((t) => ({ merchant: t.merchant, amountCents: Math.abs(t.amountCents), note: t.anomalyNote, postedOn: t.postedOn }));
  const upcoming = d.credit
    .filter((c) => c.dueOn)
    .map((c) => ({ label: `${c.name} payment`, amountCents: c.balanceCents, date: c.dueOn }));

  const parts: string[] = ["Morning."];
  if (b) {
    parts.push(
      `You've used ${b.pctUsed}% of ${monthName}'s budget on day ${b.dayOfMonth} of ${b.daysInMonth} — projected ${money(b.projectedCents)} of ${money(b.totalCents)}, ${money(Math.abs(b.remainingCents))} ${b.remainingCents >= 0 ? "left" : "over"}.`,
    );
    if (overCategories.length) {
      parts.push(overCategories.map((c) => `${c.category} is ${money(c.overCents)} over`).join("; ") + ".");
    }
  } else {
    parts.push("No budget is set for this month.");
  }
  parts.push(`Net worth ${money(d.netWorthCents)} (${signed(d.changeMtdCents)} this month).`);
  if (goalsOffTrack.length) {
    const g = goalsOffTrack[0];
    parts.push(
      `${g.name} needs ${money(g.requiredMonthlyCents ?? 0)}/mo${g.monthlyPlanCents !== null ? ` — you're at ${money(g.monthlyPlanCents ?? 0)}` : ""}.`,
    );
  }
  if (anomalies.length) parts.push(`Flagged: ${anomalies[0].merchant} ${money(anomalies[0].amountCents)} — ${anomalies[0].note}.`);

  return {
    asOf: d.asOf,
    isSample: d.isSample,
    netWorth: d.netWorthCents / 100,
    changeMtd: d.changeMtdCents / 100,
    budget: b
      ? {
          total: b.totalCents / 100,
          spent: b.spentCents / 100,
          remaining: b.remainingCents / 100,
          pctUsed: b.pctUsed,
          dayOfMonth: b.dayOfMonth,
          daysInMonth: b.daysInMonth,
          projected: b.projectedCents / 100,
          overCategories: overCategories.map((c) => ({ category: c.category, over: c.overCents / 100 })),
        }
      : null,
    upcoming: upcoming.map((u) => ({ label: u.label, amount: u.amountCents / 100, date: u.date })),
    goalsOffTrack: goalsOffTrack.map((g) => ({
      name: g.name,
      requiredMonthly: g.requiredMonthlyCents === null ? null : g.requiredMonthlyCents / 100,
      monthlyPlan: g.monthlyPlanCents === null ? null : g.monthlyPlanCents / 100,
      targetDate: g.targetDate,
    })),
    anomalies: anomalies.map((a) => ({ merchant: a.merchant, amount: a.amountCents / 100, note: a.note, postedOn: a.postedOn })),
    text: parts.join(" "),
  };
}
