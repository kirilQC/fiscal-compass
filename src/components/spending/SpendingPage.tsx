"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dashboard, PlanItem, SeriesPoint } from "@/lib/types";
import { computePlan, type PlanRow } from "@/lib/plan";
import { money, prettyMerchant } from "@/lib/format";
import { monthlyIncomeCents } from "@/components/overview/IncomePie";
import { Heatmap, type DayTxn } from "./Heatmap";
import { AddExpense } from "./EssentialsTable";
import { EssentialsSection } from "./EssentialsSection";
import { Comparisons } from "./Comparisons";
import { TransactionLists, type Txn } from "./TransactionLists";
import { TagReview } from "./TagReview";
import { SpendSplitPie } from "./SpendSplitPie";
import type { SpendClass } from "@/lib/spend";
import s from "./SpendingPage.module.css";

const longMonth = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
const prevMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
const isSpend = (t: Txn) => t.spendClass !== null;

function toPlanRow(i: PlanItem): PlanRow {
  return {
    id: i.id,
    name: i.name,
    category: i.isDebtPayment ? "Transfer" : i.category,
    amount_cents: i.amountCents,
    amount_min_cents: i.amountMinCents,
    amount_max_cents: i.amountMaxCents,
    pct_of_income: i.pctOfIncome,
    merchant_pattern: i.merchantPattern,
    due_day: i.dueDay,
    is_reimbursed: i.isReimbursed,
    is_active: true,
    sort: 0,
  } as PlanRow;
}

function cumulativeSeries(txns: Txn[], month: string, upTo: string): SeriesPoint[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map<string, number>();
  for (const t of txns) if (isSpend(t) && t.postedOn.startsWith(month)) byDay.set(t.postedOn, (byDay.get(t.postedOn) ?? 0) - t.amountCents);
  const out: SeriesPoint[] = [];
  let run = 0;
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (date > upTo) break;
    run += byDay.get(date) ?? 0;
    out.push({ date, valueCents: run });
  }
  return out;
}

export function SpendingPage({ d }: { d: Dashboard }) {
  const today = d.asOf;
  const currentMonth = today.slice(0, 7);
  const months = d.monthlySpending;
  const [selected, setSelected] = useState(currentMonth);
  const [cache, setCache] = useState<Record<string, Txn[]>>({});
  const [reviewKey, setReviewKey] = useState(0);
  // Any tag or plan change can move charges between essential and discretionary: refetch both.
  const changed = () => {
    setCache({});
    setReviewKey((k) => k + 1);
  };
  const isCurrent = selected === currentMonth;
  const prev = prevMonth(selected);

  useEffect(() => {
    for (const ym of [selected, prev]) {
      if (cache[ym]) continue;
      fetch(`/api/transactions?month=${ym}&limit=2000`)
        .then((r) => (r.ok ? r.json() : []))
        .then((j) => setCache((c) => ({ ...c, [ym]: Array.isArray(j) ? j : j.transactions ?? [] })))
        .catch(() => setCache((c) => ({ ...c, [ym]: [] })));
    }
  }, [selected, prev, cache]);

  const retag = (id: string, next: SpendClass) =>
    setCache((c) => ({ ...c, [selected]: (c[selected] ?? []).map((t) => (t.id === id ? { ...t, spendClass: next, spendClassManual: true } : t)) }));

  const txns = cache[selected];
  const prevTxns = cache[prev];
  const loading = !txns || !prevTxns;
  const spend = useMemo(() => (txns ?? []).filter(isSpend).sort((a, z) => (a.postedOn < z.postedOn ? 1 : a.postedOn > z.postedOn ? -1 : 0)), [txns]);
  const all = useMemo(() => [...(txns ?? [])].sort((a, z) => (a.postedOn < z.postedOn ? 1 : a.postedOn > z.postedOn ? -1 : 0)), [txns]);

  const monthRow = months.find((m) => m.month === selected);
  const spentCents = txns ? spend.reduce((t, x) => t - x.amountCents, 0) : monthRow?.spentCents ?? 0;
  const essentialCents = spend.filter((t) => t.spendClass === "essential").reduce((t, x) => t - x.amountCents, 0);
  const discretionaryCents = spend.filter((t) => t.spendClass === "discretionary").reduce((t, x) => t - x.amountCents, 0);
  const untaggedCents = spentCents - essentialCents - discretionaryCents;
  const projectedIncome = monthlyIncomeCents(d) ?? d.plan?.incomeCents ?? 0;
  const receivedIncome = monthRow?.incomeCents ?? 0;
  const incomeCents = projectedIncome || receivedIncome;
  const [y, m] = selected.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Budget = the essentials plan plus the discretionary cap set on the Goals page.
  const budgetCents = (d.discretionary?.essentialsPlannedCents ?? 0) + (d.discretionary?.budgetCents ?? 0);
  const budgetPct = budgetCents ? Math.round((spentCents / budgetCents) * 100) : null;

  const planItems: PlanItem[] = (() => {
    if (!d.plan) return [];
    if (isCurrent || !txns || !prevTxns) return d.plan.items;
    const rows = d.plan.items.map(toPlanRow);
    const pool = [...prevTxns, ...txns].map((t) => ({
      id: t.id,
      posted_on: t.postedOn,
      amount_cents: t.amountCents,
      merchant: t.merchant,
      category: t.category,
      is_transfer: t.isTransfer,
      is_income: t.isIncome,
      spend_class: t.spendClassManual ? t.spendClass : null,
    }));
    return computePlan(rows, pool, incomeCents, new Date(Date.UTC(y, m - 1, daysInMonth))).items;
  })();

  const due = planItems.filter((i) => !i.isReimbursed && (i.status === "due" || i.status === "overdue"));
  const dueCents = due.reduce((t, i) => t + i.expectedCents, 0);
  const tracked = planItems.filter((i) => !i.isReimbursed && i.status !== "varies");
  const paidCount = tracked.filter((i) => i.status === "paid").length;

  // The heatmap tracks discretionary spend only: essential transactions never tint a day.
  const byDay = new Map<string, DayTxn[]>();
  for (const t of spend) {
    if (t.spendClass !== "discretionary") continue;
    const list = byDay.get(t.postedOn) ?? [];
    list.push({ id: t.id, postedOn: t.postedOn, merchant: prettyMerchant(t.merchant), amountCents: t.amountCents, logoUrl: t.logoUrl, category: t.category });
    byDay.set(t.postedOn, list);
  }

  const upTo = isCurrent ? today : `${selected}-${String(daysInMonth).padStart(2, "0")}`;
  const cumulative = cumulativeSeries(txns ?? [], selected, upTo);
  const [py, pm] = prev.split("-").map(Number);
  const pdays = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const prevCumulative = cumulativeSeries(prevTxns ?? [], prev, `${prev}-${String(pdays).padStart(2, "0")}`).map((p, i) => ({
    ...p,
    date: `${selected}-${String(Math.min(i + 1, daysInMonth)).padStart(2, "0")}`,
  }));

  const monthName = longMonth(selected);

  return (
    <main className={`wrap ${s.page}`}>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Spending</h1>
        </div>
        <div className={s.months} role="tablist" aria-label="Month">
          {months.map((mo) => (
            <button key={mo.month} type="button" role="tab" aria-selected={mo.month === selected} className={mo.month === selected ? s.on : undefined} onClick={() => setSelected(mo.month)}>
              {longMonth(mo.month).slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <TagReview onChanged={() => setCache({})} refreshKey={reviewKey} />

      <div className={s.metrics}>
        <div>
          <div className={s.eyebrow}>Spent{isCurrent ? " so far" : ""}</div>
          <div className={`${s.fig} num`}>{money(spentCents)}</div>
        </div>
        <div>
          <div className={s.eyebrow}>Income</div>
          <div className={`${s.fig} num`}>{incomeCents ? money(incomeCents) : "—"}</div>
        </div>
        <div>
          <div className={s.eyebrow}>Left</div>
          <div className={`${s.fig} num ${incomeCents && incomeCents - spentCents < 0 ? "crit" : ""}`}>{incomeCents ? money(incomeCents - spentCents) : "—"}</div>
        </div>
        <div>
          <div className={s.eyebrow}>Still due</div>
          <div className={`${s.fig} num`}>{money(dueCents)}</div>
        </div>
        <div>
          <div className={s.eyebrow}>Budget used</div>
          <div className={`${s.fig} num ${budgetPct !== null && budgetPct > 100 ? "crit" : ""}`}>{budgetPct !== null ? `${budgetPct}%` : "—"}</div>
          {budgetPct !== null ? <div className={s.budgetBar} title={`${money(spentCents)} of a ${money(budgetCents)} budget`}><i style={{ width: `${Math.min(100, budgetPct)}%` }} className={budgetPct > 100 ? s.budgetOver : undefined} /></div> : null}
        </div>
      </div>

      <section className={s.split}>
        <div>
          <h2 className={s.h2}>{monthName}, day by day</h2>
          <Heatmap month={selected} today={today} byDay={byDay} plan={planItems} />
        </div>
        <div>
          <h2 className={s.h2}>Essential vs discretionary</h2>
          <div className={s.splitPie}>{txns ? (
            <SpendSplitPie essentialCents={essentialCents} discretionaryCents={discretionaryCents} untaggedCents={untaggedCents} />
          ) : isCurrent && d.discretionary ? (
            <SpendSplitPie essentialCents={d.discretionary.spentEssentialCents} discretionaryCents={d.discretionary.spentDiscretionaryCents} untaggedCents={0} />
          ) : (
            <p className={s.hint}>Loading…</p>
          )}</div>
          <h2 className={s.h2}>Still due</h2>
          {due.length ? null : <p className={s.lede}>Everything planned has been paid.</p>}
          {due.length ? (
            <>
              <ul className={s.due}>
                {[...due].sort((a, z) => (a.dueDay ?? 99) - (z.dueDay ?? 99)).map((i) => (
                  <li key={i.id}>
                    <span>{i.name}</span>
                    <span className={s.when}>{i.status === "overdue" ? <span className={s.over}>overdue</span> : i.dueDay ? `day ${i.dueDay}` : "any day"}</span>
                    <span className={`${s.amt} num`}>{money(i.expectedCents)}</span>
                  </li>
                ))}
              </ul>
              <div className={s.dueTotal}><span>Total still due</span><b>{money(dueCents)}</b></div>
            </>
          ) : null}
          <div className={s.paidCount}>
            Paid this month <b>{paidCount} of {tracked.length}</b>
            <div className={s.bar}><i style={{ width: `${tracked.length ? (paidCount / tracked.length) * 100 : 0}%` }} /></div>
          </div>
        </div>
      </section>

      <hr className={s.hair} />

      {planItems.length ? (
        <EssentialsSection items={planItems} txns={spend} lookup={[...spend, ...(prevTxns ?? []).filter(isSpend)]} month={selected} today={today} isCurrent={isCurrent} onChanged={changed} />
      ) : (
        <section>
          <h2 className={s.h2}>Essential expenses</h2>
          <p className={s.hint}>No essential expenses yet.</p>
          <AddExpense onChanged={changed} />
        </section>
      )}

      <hr className={s.hair} />

      <Comparisons
        months={months}
        selected={selected}
        onSelect={setSelected}
        incomeCents={incomeCents}
        cumulative={cumulative}
        prevCumulative={prevCumulative}
        monthName={monthName}
        prevName={longMonth(prev)}
      />

      <hr className={s.hair} />

      <TransactionLists spend={spend} all={all} monthName={monthName} loading={loading} onRetag={retag} />
    </main>
  );
}
