import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { BarChart, LineChart } from "@/components/charts";
import { money, monthLabel } from "@/lib/format";
import { BrandLogo } from "@/components/BrandLogo";
import s from "./overview.module.css";

export function CreditSpread({ d }: { d: Dashboard }) {
  const c = d.credit[0];
  if (!c) return null;
  const hasLimit = c.limitCents > 0;
  const statements = c.statements.filter((st) => st.balanceCents > 0 || c.statements.length > 1);
  const avg = statements.length ? Math.round(statements.reduce((sum, st) => sum + st.balanceCents, 0) / statements.length) : 0;
  const util = hasLimit ? statements.map((st) => ({ date: `${st.month}-01`, valueCents: Math.round((st.balanceCents / c.limitCents) * 100) })) : [];
  const mid = Math.floor(util.length / 2);

  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Credit</h2>
        <div className={s.cardHero}>
          <BrandLogo kind="chase-card" size={220} />
          <div className={s.heads}>
          <div>
            <span className="eyebrow">Current balance</span>
            <div className={`${s.fig} num`}>{money(c.balanceCents)}</div>
          </div>
          <div>
            <span className="eyebrow">Utilization</span>
            <div className={`${s.fig} num`}>{hasLimit ? `${Math.round((c.balanceCents / c.limitCents) * 100)}%` : "—"}</div>
            {hasLimit ? null : <Link href="/settings" className={s.small}>Set your limit in Settings</Link>}
          </div>
          </div>
        </div>
        {hasLimit && util.length > 1 ? (
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
      </div>
      <div>
        {statements.length > 1 ? (
          <div className={s.subOffset}>
            <BarChart
              ariaLabel="Month-end balances"
              bars={statements.map((st, i, arr) => ({ label: monthLabel(st.month), value: st.balanceCents, emphasis: i === arr.length - 1 }))}
              references={[{ value: avg, label: `avg ${money(avg)}`, color: "var(--rule2)" }]}
              formatValue={money}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
