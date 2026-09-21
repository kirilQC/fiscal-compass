import type { Dashboard } from "@/lib/types";
import { PayoffChart, toneVar } from "@/components/charts";
import { money } from "@/lib/format";
import { monthYear } from "./util";
import s from "./overview.module.css";

export function GoalsSpread({ d }: { d: Dashboard }) {
  const loan = d.loans[0];
  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Goals</h2>
        <p className={s.sub}>{d.goals.length} in progress</p>
        {d.goals.map((g) => {
          const pct = g.targetCents ? Math.round((g.savedCents / g.targetCents) * 100) : 0;
          const tone = g.onTrack ? "good" : "warn";
          const when = g.targetDate ? monthYear(g.targetDate) : null;
          const status = g.onTrack
            ? when ? `on track for ${when}` : "on track"
            : g.requiredMonthlyCents && when
              ? `needs ${money(g.requiredMonthlyCents)}/mo for ${when}${g.monthlyPlanCents ? `, saving ${money(g.monthlyPlanCents)}` : ""}`
              : "behind plan";
          return (
            <div className={s.goal} key={g.id}>
              <span className={s.n}>
                <i className={s.dot} style={{ background: toneVar[tone] }} />
                {g.name}
              </span>
              <span className={`${s.p} num`}>{pct}%</span>
              <span className={s.s}>
                {money(g.savedCents)} of {money(g.targetCents)} · {status}
              </span>
              <div className={s.g}>
                <i style={{ width: `${Math.min(100, pct)}%`, background: g.onTrack ? "var(--accent)" : "var(--warn)" }} />
              </div>
            </div>
          );
        })}
      </div>
      {loan ? (
        <div>
          <h2 className={s.h2}>{loan.name}</h2>
          <p className={s.sub}>
            {money(loan.balanceCents)} · {loan.apr}% · {money(loan.paymentCents)} a month · {loan.paymentsLeft} payments left
          </p>
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
      ) : null}
    </section>
  );
}
