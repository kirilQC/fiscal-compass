import type { Dashboard } from "@/lib/types";
import { LineChart, BarStrip } from "@/components/charts";
import { compact, money } from "@/lib/format";
import { monthShort, monthYear } from "./util";
import s from "./overview.module.css";

export function NetWorthSpread({ d }: { d: Dashboard }) {
  const annotations = d.annotations.filter((a) => a.series === "net_worth").map((a) => ({ date: a.date, text: a.text }));
  const years = d.netWorth5y.map((p, i, arr) => ({
    label: i === arr.length - 1 ? "now" : p.date.slice(0, 4),
    value: p.valueCents,
  }));
  const note = years.map((y, i) => `${i === 0 ? y.label : y.label === "now" ? "now" : y.label.slice(2)} ${compact(y.value)}`).join(" → ") + " · each bar is a year, length is the balance";
  return (
    <section className={s.full}>
      <LineChart
        ariaLabel="Net worth, last twelve months"
        series={[{ id: "net_worth", points: d.netWorth12m, area: true }]}
        height={240}
        annotations={annotations}
        endpointLabel={money}
        formatY={(v) => `$${Math.round(v / 100000)}k`}
        xLabel={(p, i, n) => (i === n - 1 ? monthShort(p.date) : i === 0 ? monthYear(p.date) : i % 2 === 0 ? monthShort(p.date) : null)}
      />
      {d.historyNote ? <p className={s.histNote}>{d.historyNote}</p> : null}
      {years.length > 1 ? <BarStrip items={years} ariaLabel="Net worth by year, five years" caption="Five years" note={note} /> : null}
    </section>
  );
}
