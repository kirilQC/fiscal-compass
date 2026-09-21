import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { LineChart, PayoffChart, Track, toneVar } from "@/components/charts";
import { money } from "@/lib/format";
import type { Goal, SeriesPoint } from "@/lib/types";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { AddGoal, EditGoal } from "@/components/sections/GoalForms";
import s from "@/components/sections/sections.module.css";

const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function projection(g: Goal, asOf: string): SeriesPoint[] {
  const start = new Date(`${asOf}T00:00:00Z`);
  const end = g.targetDate ? new Date(`${g.targetDate}T00:00:00Z`) : new Date(Date.UTC(start.getUTCFullYear() + 2, start.getUTCMonth(), 1));
  const months = Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()));
  const rate = g.monthlyPlanCents ?? 0;
  const pts: SeriesPoint[] = [{ date: asOf, valueCents: g.savedCents }];
  for (let i = 1; i <= months; i++) {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    pts.push({ date: dt.toISOString().slice(0, 10), valueCents: g.savedCents + rate * i });
  }
  return pts;
}

export default async function GoalsPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const totalTarget = d.goals.reduce((sum, g) => sum + g.targetCents, 0);
  const totalSaved = d.goals.reduce((sum, g) => sum + g.savedCents, 0);
  const monthlyPlan = d.goals.reduce((sum, g) => sum + (g.monthlyPlanCents ?? 0), 0);
  const offTrack = d.goals.filter((g) => !g.onTrack);

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} />
      <main className="wrap">
        <PageHead
          title="Goals"
          lede={d.goals.length ? `${d.goals.length} in progress · ${offTrack.length ? `${offTrack.map((g) => g.name).join(", ")} behind plan` : "all on track"}` : "Nothing yet — add the first goal below."}
          figs={d.goals.length ? [
            { value: money(totalSaved), label: `saved of ${money(totalTarget)}` },
            { value: `${Math.round((totalSaved / Math.max(1, totalTarget)) * 100)}%`, label: "funded overall" },
            { value: money(monthlyPlan), label: "committed each month" },
          ] : undefined}
        />

        {d.goals.map((g) => {
          const pct = g.targetCents ? Math.round((g.savedCents / g.targetCents) * 100) : 0;
          const tone = g.onTrack ? "good" : "warn";
          const when = g.targetDate ? monthYear(g.targetDate) : null;
          const proj = projection(g, d.asOf);
          const gap = (g.requiredMonthlyCents ?? 0) - (g.monthlyPlanCents ?? 0);
          const lands = proj[proj.length - 1].valueCents;
          return (
            <section className={`${s.section} ${s.two}`} key={g.id}>
              <div>
                <div className={s.goalHead}>
                  <h2 className={s.h2}>{g.name}</h2>
                  <span className={`${s.goalPct} num`}>{pct}%</span>
                </div>
                <p className={s.sub}>
                  {money(g.savedCents)} of {money(g.targetCents)}{when ? ` · by ${when}` : ""}
                </p>
                <Track pct={pct} tone={g.onTrack ? "accent" : "warn"} ariaLabel={`${g.name} progress`} />
                <div className={s.meta}>
                  <span className={s.status}>
                    <i style={{ background: toneVar[tone] }} />
                    {g.onTrack ? "on track" : "behind plan"}
                  </span>
                  <span className="num">{money(g.targetCents - g.savedCents)} to go</span>
                </div>
                <div className={s.list} style={{ marginTop: 26 }}>
                  <div className={s.row}>
                    <span className={s.n}>Saving each month<small>your plan</small></span>
                    <span />
                    <span className={`${s.v} num`}>{g.monthlyPlanCents === null ? "—" : money(g.monthlyPlanCents)}</span>
                  </div>
                  <div className={s.row}>
                    <span className={s.n}>Needed each month<small>{when ? `to land by ${when}` : "no date set"}</small></span>
                    <span />
                    <span className={`${s.v} num ${!g.onTrack ? "warn" : ""}`}>{g.requiredMonthlyCents === null ? "—" : money(g.requiredMonthlyCents)}</span>
                  </div>
                </div>
                <p className={s.voice}>
                  {g.onTrack
                    ? <>At {g.monthlyPlanCents === null ? "the current rate" : `${money(g.monthlyPlanCents)} a month`} you reach <b>{money(g.targetCents)}</b>{when ? ` ahead of ${when}` : ""}. Keep the transfer automatic and forget about it.</>
                    : gap > 0
                      ? <>You&apos;re <b>{money(gap)} a month short</b>. Raise the transfer to {money(g.requiredMonthlyCents ?? 0)}{when ? ` to make ${when}` : ""}, or push the date out{g.monthlyPlanCents ? ` — at ${money(g.monthlyPlanCents)} a month you land at ${money(lands)} instead` : ""}.</>
                      : <>Set a monthly amount and a date and I&apos;ll tell you whether it lands.</>}
                </p>
                <EditGoal goal={g} />
              </div>
              <div>
                <p className={s.sub} style={{ marginTop: 46 }}>Projection · saved balance at your monthly rate</p>
                <LineChart
                  ariaLabel={`${g.name} projected balance`}
                  series={[{ id: "saved", label: "at your rate", points: proj, area: true, color: g.onTrack ? "var(--accent)" : "var(--warn)" }]}
                  height={220}
                  yTicks={2}
                  yMin={0}
                  yMax={Math.max(g.targetCents, lands) * 1.08}
                  formatY={money}
                  references={[{ value: g.targetCents, label: `target ${money(g.targetCents)}`, color: "var(--ink3)" }]}
                  xLabel={(p, i, n) => (i === 0 ? "now" : i === n - 1 ? monthYear(p.date) : null)}
                />
              </div>
            </section>
          );
        })}

        {d.loans.map((loan) => (
          <section className={`${s.section} ${s.two}`} key={loan.accountId}>
            <div>
              <h2 className={s.h2}>{loan.name}</h2>
              <p className={s.sub}>
                {money(loan.balanceCents)} · {loan.apr}% · {money(loan.paymentCents)} a month · {loan.paymentsLeft} payments left
              </p>
              <p className={s.voice}>
                An extra <b>$100 a month</b> clears it {loan.monthsSavedWithExtra} months sooner. Weigh that against the {loan.apr}% rate — if your savings earn more than that, the loan can wait.
              </p>
            </div>
            <div>
              <p className={s.sub} style={{ marginTop: 46 }}>Payoff · scheduled and accelerated</p>
              <PayoffChart
                ariaLabel="Loan payoff projection"
                base={loan.payoffCurve}
                accelerated={loan.acceleratedCurve}
                startLabel={`now · ${money(loan.balanceCents)}`}
                endLabel={monthYear(loan.payoffCurve[loan.payoffCurve.length - 1].date)}
                altLabel={`+$100/mo · ${monthYear(loan.acceleratedCurve[loan.acceleratedCurve.length - 1].date)}`}
                altLegend={`$100 extra a month · ${loan.monthsSavedWithExtra} months sooner`}
              />
            </div>
          </section>
        ))}

        <section className={s.section}>
          <h2 className={s.h2}>Add a goal</h2>
          <p className={s.sub}>a target, a date, and what you can put toward it each month</p>
          <AddGoal />
        </section>

        <PageFoot isSample={d.isSample} />
      </main>
    </>
  );
}
