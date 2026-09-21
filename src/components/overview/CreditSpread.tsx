import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { BarChart, LineChart } from "@/components/charts";
import { dateLabel, money, monthLabel } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import s from "./overview.module.css";

export function CreditSpread({ d }: { d: Dashboard }) {
  const c = d.credit[0];
  if (!c) return null;
  const name = prettyName(c.name);
  const hasLimit = c.limitCents > 0;
  const statements = c.statements.filter((st) => st.balanceCents > 0 || c.statements.length > 1);
  const avg = statements.length ? Math.round(statements.reduce((sum, st) => sum + st.balanceCents, 0) / statements.length) : 0;
  const util = hasLimit ? statements.map((st) => ({ date: `${st.month}-01`, valueCents: Math.round((st.balanceCents / c.limitCents) * 100) })) : [];
  const mid = Math.floor(util.length / 2);

  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Credit</h2>
        <p className={s.sub}>
          {name}{hasLimit ? ` · ${money(c.limitCents)} limit` : ""}
        </p>
        {hasLimit ? (
          <>
            <div className={`${s.fig} num`}>
              {c.utilizationPct}%
              <small>
                utilization · {money(c.balanceCents)} owed{c.dueOn ? ` · due ${dateLabel(c.dueOn)}` : ""}
              </small>
            </div>
            {util.length > 1 ? (
              <LineChart
                ariaLabel="Utilization over six months"
                series={[{ id: "util", points: util, area: true }]}
                width={520}
                height={130}
                pad={{ top: 10, right: 8, bottom: 30 }}
                yTicks={0}
                yMin={0}
                yMax={Math.max(35, ...util.map((u) => u.valueCents + 5))}
                endpointLabel={false}
                references={[{ value: 30, label: "30% — keep below", color: "var(--warn)" }]}
                xLabel={(p, i, n) => (i === 0 || i === mid || i === n - 1 ? `${monthLabel(p.date.slice(0, 7))} · ${p.valueCents}%` : null)}
                style={{ marginTop: 14 }}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className={`${s.fig} num`}>
              {money(c.balanceCents)}
              <small>owed on the card</small>
            </div>
            <p className={s.empty}>
              Chase doesn&rsquo;t share the credit limit over Stripe. <Link href="/settings">Add it in Settings</Link> and this turns into utilization — the number your credit score actually watches.
            </p>
          </>
        )}
      </div>
      <div>
        <p className={`${s.sub} ${s.subOffset}`}>Balance at month end · each bar one month</p>
        {statements.length > 1 ? (
          <BarChart
            ariaLabel="Month-end balances"
            bars={statements.map((st, i, arr) => ({ label: monthLabel(st.month), value: st.balanceCents, emphasis: i === arr.length - 1 }))}
            references={[{ value: avg, label: `avg ${money(avg)}`, color: "var(--rule2)" }]}
            formatValue={money}
          />
        ) : (
          <p className={s.empty}>
            One balance so far — <b>{money(c.balanceCents)}</b> today. Each morning&rsquo;s sync adds a point, so the statement history draws itself in over the coming weeks.
          </p>
        )}
      </div>
    </section>
  );
}
