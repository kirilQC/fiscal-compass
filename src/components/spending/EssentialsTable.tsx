"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanItem } from "@/lib/types";
import { money, dateLabel } from "@/lib/format";
import { call } from "@/components/sections/api";
import s from "./SpendingPage.module.css";

function estimateLabel(i: PlanItem) {
  if (i.amountMinCents != null && i.amountMaxCents != null && i.amountCents == null) return `${money(i.amountMinCents)}–${money(i.amountMaxCents)}`;
  if (i.pctOfIncome != null) return `${money(i.expectedCents)} · ${i.pctOfIncome}%`;
  if (i.amountCents == null) return "varies";
  return money(i.expectedCents);
}

function statusLabel(i: PlanItem, isCurrent: boolean) {
  if (i.status === "paid") return { text: `Paid${i.paidOn ? ` ${dateLabel(i.paidOn)}` : ""}`, cls: s.paid };
  if (i.status === "overdue") return { text: isCurrent ? `Overdue${i.dueDay ? ` · day ${i.dueDay}` : ""}` : "Not seen", cls: s.over };
  if (i.status === "due") return { text: isCurrent ? (i.dueDay ? `Due day ${i.dueDay}` : "Due") : "Not seen", cls: "" };
  return { text: i.paidCents > 0 ? "Varies" : "Varies · nothing yet", cls: "" };
}

function EstimateCell({ item }: { item: PlanItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.amountCents != null ? (item.amountCents / 100).toFixed(2) : "");
  const [err, setErr] = useState<string | null>(null);
  const editable = item.amountCents != null;
  if (!editable) return <span className={s.r}>{estimateLabel(item)}</span>;
  if (!editing) {
    return (
      <button type="button" className={`${s.r} num`} style={{ color: "inherit" }} title="Click to edit the estimate" onClick={() => setEditing(true)}>
        {money(item.expectedCents)}
      </button>
    );
  }
  async function save() {
    const cents = Math.round(Number(val) * 100);
    if (!Number.isFinite(cents) || cents < 0) return setErr("Enter a dollar amount.");
    const r = await call("/api/plan", "PATCH", { id: item.id, amountCents: cents });
    if (!r.ok) return setErr(r.error);
    setEditing(false);
    setErr(null);
    router.refresh();
  }
  return (
    <span style={{ display: "inline-grid", justifyItems: "end" }}>
      <input
        className={`${s.est} num`}
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        aria-label={`Estimated ${item.name}`}
      />
      {err ? <span className={s.err}>{err}</span> : null}
    </span>
  );
}

export function EssentialsTable({ items, isCurrent }: { items: PlanItem[]; isCurrent: boolean }) {
  const rows = items.filter((i) => !i.isReimbursed);
  const estTotal = rows.reduce((t, i) => t + i.expectedCents, 0);
  const actTotal = rows.reduce((t, i) => t + i.paidCents, 0);
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th>Expense</th>
          <th className={s.r}>Estimated</th>
          <th className={s.r}>Actual</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => {
          const st = statusLabel(i, isCurrent);
          return (
            <tr key={i.id}>
              <td>{i.name}<span className={s.muted}>{i.category}</span></td>
              <td className={s.r}><EstimateCell item={i} /></td>
              <td className={`${s.r} num`}>{i.paidCents ? money(i.paidCents) : "—"}</td>
              <td className={`${s.st} ${st.cls}`}>{st.text}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className={`${s.r} num`}><b>{money(estTotal)}</b></td>
          <td className={`${s.r} num`}><b>{money(actTotal)}</b></td>
          <td className={s.st}>{rows.filter((i) => i.status === "paid").length} of {rows.filter((i) => i.status !== "varies").length} paid</td>
        </tr>
      </tfoot>
    </table>
  );
}
