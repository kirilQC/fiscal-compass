import type { Dashboard } from "@/lib/types";
import { BarChart, Track, toneVar } from "@/components/charts";
import { dateLabel, money, monthLabel, moneyExact } from "@/lib/format";
import { toneOf } from "./util";
import s from "./overview.module.css";

export function SpendingSpread({ d }: { d: Dashboard }) {
  const b = d.budget;
  if (!b) return null;
  const pacePct = (b.dayOfMonth / b.daysInMonth) * 100;
  const under = b.totalCents - b.projectedCents;
  const monthName = new Date(`${b.month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const flows = d.monthlyFlow;
  const typicalIncome = flows.length > 1 ? flows[flows.length - 2].incomeCents : flows[0]?.incomeCents ?? 0;
  const anomaly = d.recentTransactions.find((t) => t.anomalyNote);

  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Spending</h2>
        <p className={s.sub}>
          {monthName} · day {b.dayOfMonth} of {b.daysInMonth} · {money(b.totalCents)} budget
        </p>
        <div className={`${s.fig} num`}>
          {money(b.spentCents)}
          <small>spent · {money(Math.abs(b.remainingCents))} {b.remainingCents >= 0 ? "left" : "over"}</small>
        </div>
        <Track pct={b.pctUsed} pacePct={pacePct} tone={b.pctUsed > pacePct + 10 ? "warn" : "accent"} ariaLabel="Budget used versus pace" />
        <div className={s.meta}>
          <span>{Math.round(b.pctUsed)}% used</span>
          <span>
            projected {money(b.projectedCents)} · {money(Math.abs(under))} {under >= 0 ? "under" : "over"}
          </span>
        </div>
        <BarChart
          ariaLabel="Monthly spending against budget, six months"
          bars={flows.map((f, i, arr) => ({
            label: monthLabel(f.month),
            value: f.spendCents,
            emphasis: i === arr.length - 1,
            projected: i === arr.length - 1 ? b.projectedCents : undefined,
          }))}
          references={[
            { value: b.totalCents, label: `budget ${money(b.totalCents)}` },
            { value: typicalIncome, label: `income ${money(typicalIncome)}`, color: "var(--rule)", dashed: false, align: "start" },
          ]}
          showValues={false}
          height={150}
          style={{ marginTop: 30 }}
        />
        <div className={s.meta} style={{ marginTop: 6 }}>
          <span>{d.savingsRatePct !== null ? `savings rate ${d.savingsRatePct}% this year` : ""}</span>
          <span>dashed = projected to month end</span>
        </div>
      </div>
      <div>
        <p className={`${s.sub} ${s.subOffset}`}>Categories · of budget</p>
        {b.categories.map((c) => {
          const pct = c.limitCents ? (c.spentCents / c.limitCents) * 100 : 0;
          const tone = toneOf(pct);
          const color = tone === "good" ? "var(--accent)" : toneVar[tone];
          return (
            <div className={s.cat} key={c.category}>
              <span>
                <i className={s.dot} style={{ background: toneVar[tone] }} />
                {c.category}
              </span>
              <div className={s.t}>
                <i style={{ width: `${Math.min(100, pct)}%`, background: color }} />
              </div>
              <span className={`${s.a} num ${tone !== "good" ? tone : ""}`}>
                {money(c.spentCents)} / {Math.round(c.limitCents / 100)}
              </span>
            </div>
          );
        })}
        {anomaly ? (
          <div className={s.note}>
            <b>Unusual</b> — {anomaly.merchant} {moneyExact(Math.abs(anomaly.amountCents))} on {dateLabel(anomaly.postedOn)} is {anomaly.anomalyNote}.
          </div>
        ) : null}
      </div>
    </section>
  );
}
