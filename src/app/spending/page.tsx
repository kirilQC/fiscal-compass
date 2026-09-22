import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { BarChart, Donut, Track } from "@/components/charts";
import { money, monthLabel } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { BudgetEditor } from "@/components/sections/BudgetEditor";
import { MonthLedger } from "@/components/sections/MonthLedger";
import { RulesPanel } from "@/components/sections/RulesPanel";
import { SaveSuggestedBudget } from "@/components/sections/SaveSuggestedBudget";
import { PlanPanel } from "@/components/sections/PlanPanel";
import { PlanDonut } from "@/components/overview/PlanDonut";
import s from "@/components/sections/sections.module.css";

const DEFAULT_CATEGORIES = ["Groceries", "Dining", "Transport", "Shopping", "Subscriptions", "Utilities", "Housing", "Insurance", "Health", "Entertainment", "Giving", "Business", "Fees", "Travel", "Other"];

export default async function SpendingPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const b = d.budget;
  const plan = d.plan ?? null;
  const flows = d.monthlyFlow;
  const thisMonth = flows[flows.length - 1];
  const currentMonth = thisMonth?.month ?? d.asOf.slice(0, 7);
  const categories = Array.from(new Set([...(b?.categories.map((c) => c.category) ?? []), ...DEFAULT_CATEGORIES]));
  const monthName = new Date(`${currentMonth}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const pacePct = b ? (b.dayOfMonth / b.daysInMonth) * 100 : 0;
  const under = b ? b.totalCents - b.projectedCents : 0;
  const over = b?.categories.filter((c) => !c.isCommitment && c.limitCents > 0 && c.spentCents > c.limitCents) ?? [];
  const fullMonths = flows.slice(0, -1).filter((f) => f.spendCents > 0);
  const avgSpend = fullMonths.length ? Math.round(fullMonths.reduce((sum, f) => sum + f.spendCents, 0) / fullMonths.length) : 0;
  const paidMonths = fullMonths.filter((f) => f.incomeCents > 0);
  const typicalIncome = paidMonths.length ? paidMonths[paidMonths.length - 1].incomeCents : 0;
  const hasIncome = flows.some((f) => f.incomeCents > 0);
  const budgetWord = b?.source === "plan" ? "planned essentials" : b?.isSuggested ? "suggested budget" : "budget";
  const plannedSlices = plan
    ? Object.entries(plan.items.filter((i) => !i.isReimbursed).reduce<Record<string, number>>((acc, i) => { const k = i.isDebtPayment ? "Debt" : i.category; acc[k] = (acc[k] ?? 0) + i.expectedCents; return acc; }, {})).map(([label, value]) => ({ label, value }))
    : [];
  const planCounts = plan ? plan.items.filter((i) => !i.isReimbursed).reduce((acc, i) => { acc[i.status]++; return acc; }, { paid: 0, due: 0, overdue: 0, varies: 0 }) : null;

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <PageHead
          title="Spending"
          lede={b
            ? `${monthName} · day ${b.dayOfMonth} of ${b.daysInMonth} · ${money(b.totalCents)} ${budgetWord}`
            : `${monthName} · ${money(thisMonth?.spendCents ?? 0)} spent so far · no budget set yet`}
          figs={b ? [
            { value: money(b.spentCents), label: `spent · ${Math.round(b.pctUsed)}%` },
            { value: money(Math.abs(b.remainingCents)), label: b.remainingCents >= 0 ? "left this month" : "over budget", tone: b.remainingCents >= 0 ? "" : "crit" },
            { value: money(b.projectedCents), label: `projected · ${money(Math.abs(under))} ${under >= 0 ? "under" : "over"}`, tone: under >= 0 ? "good" : "crit" },
          ] : [
            { value: money(thisMonth?.spendCents ?? 0), label: `spent in ${monthName}` },
            ...(avgSpend ? [{ value: money(avgSpend), label: "average month" }] : []),
          ]}
        />

        {b ? (
          <section className={`${s.section} ${s.two}`}>
            <div>
              <h2 className={s.h2}>This month</h2>
              <p className={s.sub}>budget used against the day of the month</p>
              {b.isSuggested ? <SaveSuggestedBudget budget={b} /> : null}
              <Track pct={b.pctUsed} pacePct={pacePct} tone={b.pctUsed > pacePct + 10 ? "warn" : "accent"} ariaLabel="Budget used versus pace" />
              <div className={s.meta}>
                <span>{Math.round(b.pctUsed)}% used · {Math.round(pacePct)}% of the month gone</span>
                <span>{money(Math.max(0, Math.round(b.remainingCents / Math.max(1, b.daysInMonth - b.dayOfMonth))))} a day for the rest of {monthName}</span>
              </div>
              <p className={s.voice}>
                {b.pctUsed <= pacePct
                  ? <>You&apos;re <b>{Math.round(pacePct - b.pctUsed)} points under pace</b>. Hold here and the month ends about {money(Math.abs(under))} under {b.isSuggested ? "your usual" : "budget"}.</>
                  : <>You&apos;re <b>{Math.round(b.pctUsed - pacePct)} points ahead of pace</b>. At this rate the month lands at {money(b.projectedCents)} — {money(Math.abs(under))} {under >= 0 ? "under" : "over"}.</>}
                {b.source === "plan"
                  ? <> The limits come from your essentials plan below; anything past them is discretionary.</>
                  : b.isSuggested
                  ? <> The category limits are your own three-month averages — save them, then tighten the ones that matter.</>
                  : over.length ? <> {over.map((c) => c.category).join(" and ")} {over.length === 1 ? "is" : "are"} already over: {over.map((c) => `${c.category} by ${money(c.spentCents - c.limitCents)}`).join(", ")}.</> : null}
              </p>
            </div>
            <div>
              <h2 className={s.h2}>Where it goes</h2>
              <p className={s.sub}>{plan ? "where your money is planned to go, beside where it actually went" : `${monthName} spending by category`}</p>
              {plan ? (
                <PlanDonut
                  planned={{ label: "Planned each month", slices: plannedSlices, totalCents: plan.totalCents, centerSub: "planned" }}
                  actual={{ label: `Where ${monthName} went`, slices: b.categories.filter((c) => c.spentCents > 0).map((c) => ({ label: c.category, value: c.spentCents })), totalCents: b.spentCents, centerSub: "spent" }}
                  size={240}
                  thickness={54}
                  maxSlices={7}
                />
              ) : (
                <Donut slices={b.categories.filter((c) => c.spentCents > 0).map((c) => ({ label: c.category, value: c.spentCents }))} ariaLabel={`Spending by category, ${monthName}`} formatValue={money} size={240} thickness={54} maxSlices={7} centerLabel={money(b.spentCents)} centerSub="spent" />
              )}
            </div>
          </section>
        ) : (
          <section className={s.section}>
            <p className={s.voice}>
              There&apos;s no budget for {monthName} yet, so I can only tell you what left — <b>{money(thisMonth?.spendCents ?? 0)}</b> so far{avgSpend ? <>, against a typical month of {money(avgSpend)}</> : null}. Once a few weeks of transactions land I&apos;ll suggest limits from your own averages; you can also set them by hand below.
            </p>
          </section>
        )}

        {plan ? (
          <section className={s.section}>
            <h2 className={s.h2}>Essential expenses</h2>
            <p className={s.sub}>what leaves every month, checked off as each charge posts · click a row to edit</p>
            <div className={s.planTotals}>
              <div><b className="num">{money(plan.totalCents)}</b><span>planned each month</span></div>
              <div><b className="num">{money(plan.paidCents)}</b><span>paid so far in {monthName}</span></div>
              <div><b className="num">{money(plan.incomeCents)}</b><span>income · {d.settings?.payDays.length ?? 2} paychecks</span></div>
              <div><b className={`num ${plan.leftoverCents < 0 ? "crit" : ""}`}>{money(plan.leftoverCents)}</b><span>left after essentials</span></div>
              {planCounts ? <div><b className="num">{planCounts.paid} / {planCounts.paid + planCounts.due + planCounts.overdue}</b><span>bills paid{planCounts.overdue ? ` · ${planCounts.overdue} overdue` : ""}</span></div> : null}
            </div>
            <PlanPanel items={plan.items} categories={categories} />
          </section>
        ) : null}

        {b ? (
          <section className={s.section}>
            <h2 className={s.h2}>Categories</h2>
            <p className={s.sub}>spent against each limit</p>
            <BudgetEditor budget={b} />
          </section>
        ) : null}

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Six months</h2>
            <p className={s.sub}>monthly spend{b ? " · dashed is projected to month end" : ""}</p>
            <BarChart
              ariaLabel="Monthly spending, six months"
              bars={flows.map((f, i, arr) => ({
                label: monthLabel(f.month),
                value: f.spendCents,
                emphasis: i === arr.length - 1,
                projected: i === arr.length - 1 && b ? b.projectedCents : undefined,
              }))}
              references={[
                ...(b ? [{ value: b.totalCents, label: `budget ${money(b.totalCents)}` }] : []),
                ...(avgSpend ? [{ value: avgSpend, label: `avg ${money(avgSpend)}`, color: "var(--rule2)", align: "start" as const }] : []),
              ]}
              formatValue={money}
              height={190}
            />
          </div>
          <div>
            <h2 className={s.h2}>Income against spend</h2>
            <p className={s.sub}>
              {hasIncome ? <>deposits each month · spending beside it{d.savingsRatePct !== null ? ` · saving ${d.savingsRatePct}%` : ""}</> : "no income detected yet — add paychecks in Settings"}
            </p>
            {hasIncome ? (
              <>
                <BarChart
                  ariaLabel="Income and spending, six months"
                  bars={flows.flatMap((f) => [
                    { label: monthLabel(f.month), value: f.incomeCents, color: "var(--rule2)" },
                    { label: "", value: f.spendCents, emphasis: true },
                  ])}
                  references={typicalIncome ? [{ value: typicalIncome, label: `typical pay ${money(typicalIncome)}`, color: "var(--ink3)" }] : []}
                  showValues={false}
                  height={190}
                />
                <div className={s.meta} style={{ marginTop: 8 }}>
                  <span>grey · income</span>
                  <span>accent · spending</span>
                </div>
              </>
            ) : (
              <p className={s.empty}>Payroll deposits are picked up automatically once they appear in checking. Until then the savings rate stays blank rather than guessing.</p>
            )}
          </div>
        </section>

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Transactions</h2>
            <p className={s.sub}>change a category here and it sticks; add a rule to make it permanent</p>
            <MonthLedger initialMonth={currentMonth} categories={categories} />
          </div>
          <div>
            <h2 className={s.h2}>Rules</h2>
            <p className={s.sub}>merchant patterns that set a category on every sync</p>
            <RulesPanel categories={categories} />
          </div>
        </section>

        <PageFoot isSample={d.isSample} />
      </main>
    </>
  );
}
