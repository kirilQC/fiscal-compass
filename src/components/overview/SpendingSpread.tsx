"use client";

import { useState } from "react";
import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { BarChart, Pie, Track } from "@/components/charts";
import { dateLabel, money, monthLabel, moneyExact } from "@/lib/format";
import { SaveSuggestedBudget } from "@/components/sections/SaveSuggestedBudget";
import { actualSlices } from "./slices";
import { IncomePie, monthlyIncomeCents } from "./IncomePie";
import s from "./overview.module.css";

const PIE_SIZE = 460;

export function SpendingSpread({ d }: { d: Dashboard }) {
  const b = d.budget;
  const months = d.monthlySpending ?? [];
  const flows = d.monthlyFlow;
  const currentMonth = b?.month ?? months[months.length - 1]?.month ?? null;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
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

  const isCurrent = selectedMonth === b.month;
  const sel = months.find((m) => m.month === selectedMonth) ?? null;
  const selFlow = flows.find((f) => f.month === selectedMonth) ?? null;
  const spent = isCurrent ? b.spentCents : sel?.spentCents ?? selFlow?.spendCents ?? 0;
  const selectedYm = selectedMonth ?? b.month;
  const monthName = new Date(`${selectedYm}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const pieSlices = isCurrent ? actualSlices(b.categories) : actualSlices((sel?.categories ?? []).map((c) => ({ category: c.category, spentCents: c.spentCents, limitCents: 0 })));
  const income = monthlyIncomeCents(d) || (sel?.incomeCents || selFlow?.incomeCents || 0);

  const pacePct = (b.dayOfMonth / b.daysInMonth) * 100;
  const under = b.totalCents - b.projectedCents;
  const fullMonths = flows.slice(0, -1).filter((f) => f.incomeCents > 0);
  const typicalIncome = fullMonths.length ? fullMonths[fullMonths.length - 1].incomeCents : 0;
  const anomaly = isCurrent ? d.recentTransactions.find((t) => t.anomalyNote) : null;
  const selectedIndex = Math.max(0, flows.findIndex((f) => f.month === selectedYm));

  return (
    <section className={`${s.spread} ${s.spreadWide}`}>
      <div>
        <h2 className={s.h2}>Spending</h2>
        <div className={`${s.fig} num`}>{money(spent)}</div>
        <p className={s.range}>{monthRange(selectedYm)}</p>
        {isCurrent ? (
          <>
            <Track pct={b.pctUsed} pacePct={pacePct} tone={b.pctUsed > 100 ? "crit" : "accent"} ariaLabel="Budget used versus pace" />
            <div className={s.meta}>
              <span>{Math.round(b.pctUsed)}% used</span>
              <span>
                projected {money(b.projectedCents)} · {money(Math.abs(under))} {under >= 0 ? "under" : "over"}
              </span>
            </div>
          </>
        ) : (
          <div className={s.meta}>
            <span>{monthName} · full month</span>
            <button type="button" className={s.linkBtn} onClick={() => setSelectedMonth(b.month)}>Back to this month</button>
          </div>
        )}
        <BarChart
          ariaLabel="Monthly spending against budget, six months — click a month to explore it"
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
          selectedIndex={selectedIndex}
          onSelect={(i) => setSelectedMonth(flows[i]?.month ?? b.month)}
        />
      </div>
      <div>
        <div className={s.pies}>
          <Pie slices={pieSlices} title={`Where ${monthName} went (Total: ${money(spent)})`} ariaLabel={`Spending by group, ${monthName}`} formatValue={money} size={PIE_SIZE} />
          <IncomePie d={d} size={PIE_SIZE} month={selectedYm} spentCents={spent} incomeCents={income || undefined} />
        </div>
        {isCurrent && b.isSuggested ? <div style={{ marginTop: 34 }}><SaveSuggestedBudget budget={b} compact /></div> : null}
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
