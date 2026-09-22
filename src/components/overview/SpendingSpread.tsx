import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { BarChart, Pie, Track, toneVar } from "@/components/charts";
import { dateLabel, money, monthLabel, moneyExact } from "@/lib/format";
import { SaveSuggestedBudget } from "@/components/sections/SaveSuggestedBudget";
import { actualSlices } from "./slices";
import { toneOf } from "./util";
import s from "./overview.module.css";

export function SpendingSpread({ d }: { d: Dashboard }) {
  const b = d.budget;
  const flows = d.monthlyFlow;
  const hasFlows = flows.some((f) => f.spendCents > 0 || f.incomeCents > 0);

  if (!b) {
    if (!hasFlows) return null;
    const thisMonth = flows[flows.length - 1];
    return (
      <section className={s.spread}>
        <div>
          <h2 className={s.h2}>Spending</h2>
          <p className={s.sub}>{monthLabel(thisMonth.month)} so far</p>
          <div className={`${s.fig} num`}>
            {money(thisMonth.spendCents)}
            <small>spent this month</small>
          </div>
          <p className={s.empty}>
            No budget yet, so there&rsquo;s nothing to pace against. <Link href="/spending">Set a monthly budget</Link> and this becomes the number that tells you whether to ease off.
          </p>
        </div>
        <div>
          <p className={`${s.sub} ${s.subOffset}`}>Six months · spend</p>
          <BarChart
            ariaLabel="Monthly spending, six months"
            bars={flows.map((f, i, arr) => ({ label: monthLabel(f.month), value: f.spendCents, emphasis: i === arr.length - 1 }))}
            formatValue={money}
            height={150}
          />
        </div>
      </section>
    );
  }

  const pacePct = (b.dayOfMonth / b.daysInMonth) * 100;
  const under = b.totalCents - b.projectedCents;
  const monthName = new Date(`${b.month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const fullMonths = flows.slice(0, -1).filter((f) => f.incomeCents > 0);
  const typicalIncome = fullMonths.length ? fullMonths[fullMonths.length - 1].incomeCents : 0;
  const anomaly = d.recentTransactions.find((t) => t.anomalyNote);
  const categories = b.categories.filter((c) => c.limitCents > 0 || c.spentCents > 0);

  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Spending</h2>
        <div className={`${s.fig} num`}>{money(b.spentCents)}</div>
        <p className={s.range}>{monthRange(b.month)}</p>
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
            ...(typicalIncome ? [{ value: typicalIncome, label: `income ${money(typicalIncome)}`, color: "var(--rule)", dashed: false, align: "start" as const }] : []),
          ]}
          showValues={false}
          height={150}
          style={{ marginTop: 30 }}
        />
      </div>
      <div>
        <div className={s.subOffset}>
          <Pie slices={actualSlices(b.categories)} title={`Where ${monthName} went (Total: ${money(b.spentCents)})`} ariaLabel={`Spending by group, ${monthName}`} formatValue={money} size={420} />
        </div>
        {b.isSuggested ? <div style={{ marginTop: 34 }}><SaveSuggestedBudget budget={b} compact /></div> : null}
        {categories.map((c) => {
          const pct = c.limitCents ? (c.spentCents / c.limitCents) * 100 : 0;
          const tone = c.isCommitment ? "good" : toneOf(pct);
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
                {money(c.spentCents)}{c.limitCents ? ` / ${Math.round(c.limitCents / 100)}` : ""}
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

function monthRange(ym: string) {
  const start = new Date(`${ym}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const f = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(start)} – ${f(end)}`;
}
