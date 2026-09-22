"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { money, moneyExact, dateLabel } from "@/lib/format";
import s from "./SlicePopup.module.css";

export interface PopupRow {
  postedOn: string;
  merchant: string;
  amountCents: number;
}

export interface SlicePopupProps {
  x: number;
  y: number;
  title: string;
  meta: string;
  rows?: PopupRow[];
  totalCents: number;
  totalCount?: number;
  summary?: string;
  loading?: boolean;
  maxRows?: number;
}

export function SlicePopup({ x, y, title, meta, rows, totalCents, totalCount, summary, loading, maxRows = 8 }: SlicePopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y - 12 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x + 16;
    let top = y - 12;
    if (left + r.width > window.innerWidth - 12) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - 12) top = window.innerHeight - r.height - 12;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    setPos({ left, top });
  }, [x, y, rows, summary, loading]);

  const shown = rows ? rows.slice(0, maxRows) : [];
  const hidden = rows ? rows.slice(maxRows) : [];
  const hiddenCents = hidden.reduce((t, r) => t + Math.abs(r.amountCents), 0);

  return (
    <div ref={ref} className={s.pop} role="tooltip" style={{ left: pos.left, top: pos.top }}>
      <h4>
        {title} <b>{meta}</b>
      </h4>
      {summary ? <p className={s.summary}>{summary}</p> : null}
      {loading ? <p className={s.summary}>Loading…</p> : null}
      {rows && !loading ? (
        <>
          <ul>
            {shown.map((r, i) => (
              <li key={`${r.postedOn}-${r.merchant}-${i}`}>
                <span className={s.d}>{dateLabel(r.postedOn)}</span>
                <span className={s.m}>{r.merchant}</span>
                <span className={`${s.a} num`}>{moneyExact(Math.abs(r.amountCents))}</span>
              </li>
            ))}
          </ul>
          {hidden.length ? <div className={s.more}>+{hidden.length} more · {money(hiddenCents)}</div> : null}
          <div className={s.tot}>
            <span>{totalCount ?? rows.length} transactions</span>
            <b className="num">{money(totalCents)}</b>
          </div>
        </>
      ) : null}
    </div>
  );
}
