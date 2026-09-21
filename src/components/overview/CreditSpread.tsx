import type { Dashboard } from "@/lib/types";
import { BarChart, LineChart } from "@/components/charts";
import { dateLabel, money, monthLabel } from "@/lib/format";
import s from "./overview.module.css";

export function CreditSpread({ d }: { d: Dashboard }) {
  const c = d.credit[0];
  if (!c || c.statements.length === 0) return null;
  const limit = c.limitCents || 1;
  const util = c.statements.map((st) => ({ date: `${st.month}-01`, valueCents: Math.round((st.balanceCents / limit) * 100) }));
  const avg = Math.round(c.statements.reduce((sum, st) => sum + st.balanceCents, 0) / c.statements.length);
  const mid = Math.floor(util.length / 2);
  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Credit</h2>
        <p className={s.sub}>
          {c.name} · {money(c.limitCents)} limit
        </p>
        <div className={`${s.fig} num`}>
          {c.utilizationPct}%
          <small>
            utilization{c.dueOn ? ` · ${money(c.balanceCents)} due ${dateLabel(c.dueOn)}` : ""}
          </small>
        </div>
        <LineChart
          ariaLabel="Utilization over six months"
          series={[{ id: "util", points: util, area: true }]}
          width={520}
          height={130}
          pad={{ top: 10, right: 8, bottom: 30 }}
          yTicks={0}
          yMin={0}
          yMax={35}
          endpointLabel={false}
          references={[{ value: 30, label: "30% — keep below", color: "var(--warn)" }]}
          xLabel={(p, i, n) => (i === 0 || i === mid || i === n - 1 ? `${monthLabel(p.date.slice(0, 7))} · ${p.valueCents}%` : null)}
          style={{ marginTop: 14 }}
        />
      </div>
      <div>
        <p className={`${s.sub} ${s.subOffset}`}>Statement balance · each bar one statement</p>
        <BarChart
          ariaLabel="Statement balances, six months"
          bars={c.statements.map((st, i, arr) => ({ label: monthLabel(st.month), value: st.balanceCents, emphasis: i === arr.length - 1 }))}
          references={[{ value: avg, label: `avg ${money(avg)}`, color: "var(--rule2)" }]}
          formatValue={money}
        />
      </div>
    </section>
  );
}
