import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { PayoffChart, toneVar } from "@/components/charts";
import { money } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import { monthYear } from "./util";
import s from "./overview.module.css";

export function GoalsSpread({ d }: { d: Dashboard }) {
  const loan = d.loans[0];
  const loanKnown = !!loan && loan.balanceCents > 0 && loan.payoffCurve.length > 1;
  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Goals</h2>
        <p className={s.sub}>{d.goals.length ? `${d.goals.length} in progress` : "nothing set yet"}</p>
        {d.goals.length === 0 ? (
          <p className={s.empty}>
            Tell me what you&rsquo;re saving for — an emergency fund, a trip, a down payment — with a date and a monthly amount, and I&rsquo;ll track whether it lands. <Link href="/goals">Add your first goal</Link>.
          </p>
        ) : null}
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
          <h2 className={s.h2}>{prettyName(loan.name)}</h2>
          {loanKnown ? (
            <>
              <p className={s.sub}>
                {money(loan.balanceCents)} · {loan.apr}% · {money(loan.paymentCents)} a month · {loan.paymentsLeft} payments left
              </p>
              <PayoffChart
                ariaLabel="Loan payoff projection"
                base={loan.payoffCurve}
                accelerated={loan.acceleratedCurve}
                startLabel={`now · ${money(loan.balanceCents)}`}
                endLabel={monthYear(loan.payoffCurve[loan.payoffCurve.length - 1].date)}
                altLabel={loan.acceleratedCurve.length ? `+$100/mo · ${monthYear(loan.acceleratedCurve[loan.acceleratedCurve.length - 1].date)}` : undefined}
                altLegend={`$100 extra a month · ${loan.monthsSavedWithExtra} months sooner`}
              />
            </>
          ) : (
            <>
              <p className={s.sub}>{loan.paymentCents ? `${money(loan.paymentCents)} a month` : "balance unknown"}</p>
              <p className={s.empty}>
                Chase doesn&rsquo;t expose loan balances over Stripe, so I only see the payments leaving checking. <Link href="/settings">Enter the balance, rate and payment in Settings</Link> and you get a payoff date — and what an extra $100 a month would do to it.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
