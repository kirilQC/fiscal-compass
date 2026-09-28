"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { BarChart, Pie, Track } from "@/components/charts";
import { dateLabel, money, monthLabel, moneyExact } from "@/lib/format";
import { prettyMerchant } from "@/lib/format";
import { SaveSuggestedBudget } from "@/components/sections/SaveSuggestedBudget";
import { actualSlices, groupForCategory } from "./slices";
import { IncomePie, monthlyIncomeCents } from "./IncomePie";
import { SlicePopup, type PopupRow } from "./SlicePopup";
import s from "./overview.module.css";

const PIE_SIZE = 440;
const BAR_HEIGHT = 230;

interface Txn {
  postedOn: string;
  merchant: string;
  amountCents: number;
  category: string;
  isTransfer: boolean;
  isIncome: boolean;
  logoUrl?: string | null;
}

type PieId = "breakdown" | "income";
type Hover = { pie: PieId; index: number; x: number; y: number } | null;

export function SpendingSpread({ d }: { d: Dashboard }) {
  const b = d.budget;
  const months = d.monthlySpending ?? [];
  const flows = d.monthlyFlow;
  const currentMonth = b?.month ?? months[months.length - 1]?.month ?? null;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
  const [hover, setHover] = useState<Hover>(null);
  const [txnCache, setTxnCache] = useState<Record<string, Txn[]>>({});
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFlows = flows.some((f) => f.spendCents > 0 || f.incomeCents > 0);
  const selectedYm = selectedMonth ?? b?.month ?? null;

  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedYm || txnCache[selectedYm] || inFlight.current.has(selectedYm)) return;
    inFlight.current.add(selectedYm);
    fetch(`/api/transactions?month=${selectedYm}&limit=2000`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        const list: Txn[] = Array.isArray(j) ? j : Array.isArray(j?.transactions) ? j.transactions : [];
        setTxnCache((c) => ({ ...c, [selectedYm]: list }));
      })
      .catch(() => setTxnCache((c) => ({ ...c, [selectedYm]: [] })))
      .finally(() => inFlight.current.delete(selectedYm));
  }, [selectedYm, txnCache]);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);
  const hoverFor = useCallback(
    (pie: PieId) => (index: number | null, e?: React.MouseEvent) => {
      clearLeave();
      if (index === null) {
        leaveTimer.current = setTimeout(() => setHover(null), 120);
        return;
      }
      setHover((h) => ({ pie, index, x: e?.clientX ?? h?.x ?? 0, y: e?.clientY ?? h?.y ?? 0 }));
    },
    [clearLeave],
  );
  const moveFor = useCallback((pie: PieId) => (index: number, e: React.MouseEvent) => setHover({ pie, index, x: e.clientX, y: e.clientY }), []);
  useEffect(() => clearLeave, [clearLeave]);

  const isCurrent = !!b && selectedMonth === b.month;
  const sel = months.find((m) => m.month === selectedMonth) ?? null;
  const selFlow = flows.find((f) => f.month === selectedMonth) ?? null;
  const spent = b && isCurrent ? b.spentCents : sel?.spentCents ?? selFlow?.spendCents ?? 0;
  const ym = selectedYm ?? "";
  const rawSlices = b && isCurrent ? actualSlices(b.categories) : actualSlices((sel?.categories ?? []).map((c) => ({ category: c.category, spentCents: c.spentCents, limitCents: 0 })));
  const pieSlices = useMemo(() => [...rawSlices].sort((a, z) => z.value - a.value).slice(0, 8), [rawSlices]);
  const income = monthlyIncomeCents(d) || (sel?.incomeCents || selFlow?.incomeCents || 0);
  const left = Math.max(0, income - spent);
  const cached = txnCache[ym];

  const popup = useMemo(() => {
    if (!hover) return null;
    if (hover.pie === "income") {
      const isSpent = hover.index === 0;
      return {
        title: isSpent ? "Spent" : "Left",
        meta: income ? `${Math.round(((isSpent ? spent : left) / income) * 100)}%` : "",
        summary: `Spent ${money(spent)} · Left ${money(left)} · income ${money(income)}`,
        totalCents: isSpent ? spent : left,
      };
    }
    const slice = pieSlices[hover.index];
    if (!slice) return null;
    const pieTotal = pieSlices.reduce((t, x) => t + x.value, 0);
    const meta = `${money(slice.value)} · ${pieTotal ? ((slice.value / pieTotal) * 100).toFixed(1) : "0.0"}%`;
    if (!cached) return { title: slice.label, meta, loading: true, totalCents: slice.value };
    const rows: PopupRow[] = cached
      .filter((t) => !t.isTransfer && !t.isIncome && t.amountCents < 0 && groupForCategory(t.category) === slice.label)
      .sort((a, z) => a.amountCents - z.amountCents)
      .map((t) => ({ postedOn: t.postedOn, merchant: prettyMerchant(t.merchant), amountCents: t.amountCents, logoUrl: t.logoUrl }));
    return { title: slice.label, meta, rows, totalCents: slice.value, totalCount: rows.length };
  }, [hover, pieSlices, cached, spent, left, income]);

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

  const monthName = new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const pacePct = (b.dayOfMonth / b.daysInMonth) * 100;
  const under = b.totalCents - b.projectedCents;
  const fullMonths = flows.slice(0, -1).filter((f) => f.incomeCents > 0);
  const typicalIncome = fullMonths.length ? fullMonths[fullMonths.length - 1].incomeCents : 0;
  const anomaly = isCurrent ? d.recentTransactions.find((t) => t.anomalyNote) : null;
  const selectedIndex = Math.max(0, flows.findIndex((f) => f.month === ym));

  return (
    <section className={`${s.spread} ${s.spreadWide}`}>
      <div>
        <h2 className={s.h2}>Spending</h2>
        <div className={`${s.fig} num`}>{money(spent)}</div>
        <p className={s.range}>{monthRange(ym)}</p>
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
          formatValue={money}
          height={BAR_HEIGHT}
          style={{ marginTop: 28 }}
          selectedIndex={selectedIndex}
          onSelect={(i) => setSelectedMonth(flows[i]?.month ?? b.month)}
        />
        {isCurrent && b.isSuggested ? <div style={{ marginTop: 28 }}><SaveSuggestedBudget budget={b} compact /></div> : null}
        {anomaly ? (
          <div className={s.note}>
            <b>Unusual</b> — {anomaly.merchant} {moneyExact(Math.abs(anomaly.amountCents))} on {dateLabel(anomaly.postedOn)} is {anomaly.anomalyNote}.
          </div>
        ) : null}
      </div>
      <div className={s.pieCol}>
        <Pie
          slices={pieSlices}
          sortSlices={false}
          title={`Where ${monthName} went · ${money(spent)}`}
          ariaLabel={`Spending by group, ${monthName}`}
          formatValue={money}
          size={PIE_SIZE}
          hoveredIndex={hover?.pie === "breakdown" ? hover.index : null}
          onSliceHover={hoverFor("breakdown")}
          onSliceMove={moveFor("breakdown")}
        />
      </div>
      <div className={s.pieCol}>
        <IncomePie
          d={d}
          size={PIE_SIZE}
          month={ym}
          spentCents={spent}
          incomeCents={income || undefined}
          hoveredIndex={hover?.pie === "income" ? hover.index : null}
          onSliceHover={hoverFor("income")}
          onSliceMove={moveFor("income")}
        />
      </div>
      {hover && popup ? <SlicePopup x={hover.x} y={hover.y} {...popup} /> : null}
    </section>
  );
}

function monthRange(ym: string) {
  const start = new Date(`${ym}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const f = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(start)} – ${f(end)}`;
}

