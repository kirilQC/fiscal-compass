"use client";

import { BarChart, LineChart } from "@/components/charts";
import { money, monthLabel } from "@/lib/format";
import type { MonthlySpending, SeriesPoint } from "@/lib/types";
import s from "./SpendingPage.module.css";

export function Comparisons({
  months,
  selected,
  onSelect,
  incomeCents,
  cumulative,
  prevCumulative,
  monthName,
  prevName,
}: {
  months: MonthlySpending[];
  selected: string;
  onSelect: (month: string) => void;
  incomeCents: number;
  cumulative: SeriesPoint[];
  prevCumulative: SeriesPoint[];
  monthName: string;
  prevName: string;
}) {
  const idx = months.findIndex((m) => m.month === selected);
  const bars = months.map((m) => ({ label: monthLabel(m.month), value: m.spentCents }));
  const pairs = months.flatMap((m) => [
    { label: `${monthLabel(m.month)} in`, value: m.incomeCents, color: "var(--rule2)" },
    { label: `${monthLabel(m.month)} out`, value: m.spentCents },
  ]);
  return (
    <div className={s.three}>
      <div>
        <h2 className={s.h2}>Six months</h2>
        <p className={s.lede}>spend per month · click a bar to switch</p>
        <BarChart
          bars={bars}
          ariaLabel="Spending by month"
          height={190}
          selectedIndex={idx}
          onSelect={(i) => onSelect(months[i].month)}
          references={incomeCents ? [{ value: incomeCents, label: `income ${money(incomeCents)}`, color: "var(--rule2)", dashed: true }] : []}
          showValues="emphasis"
          formatValue={money}
        />
      </div>
      <div>
        <h2 className={s.h2}>Income vs spend</h2>
        <p className={s.lede}>received · spent, each month</p>
        <BarChart bars={pairs} ariaLabel="Income versus spend by month" height={190} showValues={false} formatValue={money} />
      </div>
      <div>
        <h2 className={s.h2}>Pace</h2>
        <p className={s.lede}>cumulative spend, {monthName} against {prevName}</p>
        {cumulative.length > 1 ? (
          <LineChart
            series={[
              { id: "cur", label: monthName, points: cumulative, area: true },
              { id: "prev", label: prevName, points: prevCumulative, color: "var(--ink3)", dashed: true },
            ]}
            ariaLabel={`Cumulative spend, ${monthName} versus ${prevName}`}
            width={520}
            height={190}
            pad={{ top: 10, right: 70, bottom: 26 }}
            yTicks={3}
            xLabel={(p, i, n) => (i === 0 || i === n - 1 ? String(Number(p.date.slice(8, 10))) : null)}
            endpointLabel
          />
        ) : (
          <p className={s.hint}>Not enough days yet.</p>
        )}
      </div>
    </div>
  );
}
