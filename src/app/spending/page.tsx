import { Fragment } from "react";
import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { BarChart, Track } from "@/components/charts";
import { money, moneyExact, monthLabel } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { BudgetEditor } from "@/components/sections/BudgetEditor";
import { CategorySelect } from "@/components/sections/CategorySelect";
import { RulesPanel } from "@/components/sections/RulesPanel";
import s from "@/components/sections/sections.module.css";

const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export default async function SpendingPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const b = d.budget;
  const flows = d.monthlyFlow;
  const categories = b?.categories.map((c) => c.category) ?? ["Groceries", "Dining", "Transport", "Shopping", "Subscriptions", "Other"];
  const monthName = b ? new Date(`${b.month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" }) : "";
  const pacePct = b ? (b.dayOfMonth / b.daysInMonth) * 100 : 0;
  const under = b ? b.totalCents - b.projectedCents : 0;
  const over = b?.categories.filter((c) => c.spentCents > c.limitCents) ?? [];
  const typicalIncome = flows.length > 1 ? flows[flows.length - 2].incomeCents : flows[0]?.incomeCents ?? 0;
  const fullMonths = flows.slice(0, -1);
  const avgSpend = fullMonths.length ? Math.round(fullMonths.reduce((sum, f) => sum + f.spendCents, 0) / fullMonths.length) : 0;

  const byDay = new Map<string, typeof d.recentTransactions>();
  for (const t of d.recentTransactions) byDay.set(t.postedOn, [...(byDay.get(t.postedOn) ?? []), t]);

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <PageHead
          title="Spending"
          lede={b ? `${monthName} · day ${b.dayOfMonth} of ${b.daysInMonth} · ${money(b.totalCents)} budget` : "No budget set for this month yet."}
          figs={b ? [
            { value: money(b.spentCents), label: `spent · ${Math.round(b.pctUsed)}%` },
            { value: money(Math.abs(b.remainingCents)), label: b.remainingCents >= 0 ? "left this month" : "over budget", tone: b.remainingCents >= 0 ? "" : "crit" },
            { value: money(b.projectedCents), label: `projected · ${money(Math.abs(under))} ${under >= 0 ? "under" : "over"}`, tone: under >= 0 ? "good" : "crit" },
          ] : undefined}
        />

        {b ? (
          <section className={`${s.section} ${s.two}`}>
            <div>
              <h2 className={s.h2}>This month</h2>
              <p className={s.sub}>budget used against the day of the month</p>
              <Track pct={b.pctUsed} pacePct={pacePct} tone={b.pctUsed > pacePct + 10 ? "warn" : "accent"} ariaLabel="Budget used versus pace" />
              <div className={s.meta}>
                <span>{Math.round(b.pctUsed)}% used · {Math.round(pacePct)}% of the month gone</span>
                <span>{money(Math.round(b.remainingCents / Math.max(1, b.daysInMonth - b.dayOfMonth)))} a day for the rest of {monthName}</span>
              </div>
              <p className={s.voice}>
                {b.pctUsed <= pacePct
                  ? <>You&apos;re <b>{Math.round(pacePct - b.pctUsed)} points under pace</b>. Hold here and the month ends about {money(Math.abs(under))} under budget.</>
                  : <>You&apos;re <b>{Math.round(b.pctUsed - pacePct)} points ahead of pace</b>. At this rate the month lands at {money(b.projectedCents)} — {money(Math.abs(under))} {under >= 0 ? "under" : "over"}.</>}
                {over.length ? <> {over.map((c) => c.category).join(" and ")} {over.length === 1 ? "is" : "are"} already over: {over.map((c) => `${c.category} by ${money(c.spentCents - c.limitCents)}`).join(", ")}.</> : null}
              </p>
            </div>
            <div>
              <BudgetEditor budget={b} />
            </div>
          </section>
        ) : null}

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Six months</h2>
            <p className={s.sub}>monthly spend · dashed is projected to month end</p>
            <BarChart
              ariaLabel="Monthly spending against budget, six months"
              bars={flows.map((f, i, arr) => ({
                label: monthLabel(f.month),
                value: f.spendCents,
                emphasis: i === arr.length - 1,
                projected: i === arr.length - 1 && b ? b.projectedCents : undefined,
              }))}
              references={[
                ...(b ? [{ value: b.totalCents, label: `budget ${money(b.totalCents)}` }] : []),
                { value: avgSpend, label: `avg ${money(avgSpend)}`, color: "var(--rule2)", align: "start" as const },
              ]}
              formatValue={money}
              height={190}
            />
          </div>
          <div>
            <h2 className={s.h2}>Income against spend</h2>
            <p className={s.sub}>
              net pay each month · spending beside it{d.savingsRatePct !== null ? ` · saving ${d.savingsRatePct}%` : ""}
            </p>
            <BarChart
              ariaLabel="Income and spending, six months"
              bars={flows.flatMap((f) => [
                { label: monthLabel(f.month), value: f.incomeCents, color: "var(--rule2)" },
                { label: "", value: f.spendCents, emphasis: true },
              ])}
              references={[{ value: typicalIncome, label: `typical pay ${money(typicalIncome)}`, color: "var(--ink3)" }]}
              showValues={false}
              height={190}
            />
            <div className={s.meta} style={{ marginTop: 8 }}>
              <span>grey · net income</span>
              <span>accent · spending</span>
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Transactions</h2>
            <p className={s.sub}>change a category here and it sticks; add a rule to make it permanent</p>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th className={s.hideNarrow}>Account</th>
                  <th>Category</th>
                  <th className={s.r}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byDay.entries()).map(([day, txns]) => (
                  <Fragment key={day}>
                    <tr className={s.dayHead}><td colSpan={4}>{longDay(day)}</td></tr>
                    {txns.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {t.merchant}
                          {t.anomalyNote ? <span className={s.flag}>Unusual · {t.anomalyNote}</span> : null}
                        </td>
                        <td className={`${s.hideNarrow} ${s.dim}`}>{t.accountName}</td>
                        <td>{t.isIncome ? <span className={s.dim}>Income</span> : <CategorySelect id={t.id} value={t.category} options={categories} />}</td>
                        <td className={`${s.r} ${s.amt} num ${t.isIncome ? "good" : ""}`}>{t.amountCents < 0 ? "−" : "+"}{moneyExact(Math.abs(t.amountCents))}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
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
