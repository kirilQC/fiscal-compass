"use client";

import { useState } from "react";
import { money, moneyExact } from "@/lib/format";
import { SlicePopup, type PopupRow } from "@/components/overview/SlicePopup";
import type { PlanItem } from "@/lib/types";
import s from "./SpendingPage.module.css";

export interface DayTxn extends PopupRow {
  id: string;
}

export function Heatmap({ month, today, byDay, plan }: { month: string; today: string; byDay: Map<string, DayTxn[]>; plan: PlanItem[] }) {
  const [hover, setHover] = useState<{ date: string; x: number; y: number } | null>(null);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const totals = new Map<string, number>();
  for (const [d, rows] of byDay) totals.set(d, rows.reduce((t, r) => t + Math.abs(r.amountCents), 0));
  const max = Math.max(1, ...totals.values());
  const dots = new Map<number, { paid: number; due: number; overdue: number }>();
  for (const p of plan) {
    if (p.isReimbursed) continue;
    const day = p.paidOn && p.paidOn.startsWith(month) ? Number(p.paidOn.slice(8, 10)) : p.dueDay;
    if (!day) continue;
    const cur = dots.get(day) ?? { paid: 0, due: 0, overdue: 0 };
    cur[p.status === "paid" ? "paid" : p.status === "overdue" ? "overdue" : "due"]++;
    dots.set(day, cur);
  }
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const hoverRows = hover ? [...(byDay.get(hover.date) ?? [])].sort((a, z) => a.amountCents - z.amountCents) : [];

  return (
    <div>
      <div className={s.cal}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className={s.dow}>{d}</div>)}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const date = iso(d);
          const total = totals.get(date) ?? 0;
          const h = total ? Math.max(0.06, Math.sqrt(total / max)) : 0;
          const dd = dots.get(d);
          const cls = [s.cd, date > today ? s.fut : "", date === today ? s.today : "", h > 0.55 ? s.hot : ""].join(" ");
          return (
            <div
              key={date}
              className={cls}
              style={{ ["--h" as string]: h.toFixed(2) }}
              onMouseEnter={(e) => total && setHover({ date, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => hover && setHover({ date, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              <span className="n">{d}</span>
              {dd ? (
                <span className={s.dots}>
                  {dd.paid ? <i style={{ background: "var(--good)" }} title={`${dd.paid} paid`} /> : null}
                  {dd.due ? <i style={{ background: "var(--accent)" }} title={`${dd.due} due`} /> : null}
                  {dd.overdue ? <i style={{ background: "var(--crit)" }} title={`${dd.overdue} overdue`} /> : null}
                </span>
              ) : null}
              {total ? <b>{total >= 100000 ? money(total) : moneyExact(total)}</b> : <span />}
            </div>
          );
        })}
      </div>
      <div className={s.legend}>
        <span>Tint = discretionary spend that day</span>
        <span><i style={{ background: "var(--good)" }} />bill paid</span>
        <span><i style={{ background: "var(--accent)" }} />bill due</span>
        <span><i style={{ background: "var(--crit)" }} />overdue</span>
      </div>
      {hover && hoverRows.length ? (
        <SlicePopup
          x={hover.x}
          y={hover.y}
          title={new Date(`${hover.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
          meta={money(totals.get(hover.date) ?? 0)}
          rows={hoverRows}
          totalCents={totals.get(hover.date) ?? 0}
          maxRows={8}
        />
      ) : null}
    </div>
  );
}
