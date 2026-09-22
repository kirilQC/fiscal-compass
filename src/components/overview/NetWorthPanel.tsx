"use client";

import { useId, useMemo, useState } from "react";
import type { Account, SeriesPoint } from "@/lib/types";
import s from "./NetWorthPanel.module.css";
import { smoothPath, smoothSeries } from "@/components/charts/AreaChart";

type Range = "1M" | "3M" | "6M" | "1Y" | "ALL";
const RANGES: Range[] = ["1M", "3M", "6M", "1Y", "ALL"];
const DAYS: Record<Range, number | null> = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, ALL: null };

const fmtK = (cents: number) => `$${Math.round(cents / 100000)}k`;
const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (iso: string, withYear: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", withYear ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });


export function NetWorthPanel({
  netWorthCents,
  daily,
  accounts,
}: {
  netWorthCents: number;
  daily: SeriesPoint[];
  accounts: Account[];
}) {
  const [range, setRange] = useState<Range>("3M");
  const [mode, setMode] = useState<"line" | "bars">("line");
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();

  const points = useMemo(() => {
    const n = DAYS[range];
    const window = n ? daily.slice(Math.max(0, daily.length - n)) : daily;
    return smoothSeries(window, range === "1M" ? 2 : range === "3M" ? 4 : 7);
  }, [daily, range]);

  const investments = accounts.filter((a) => a.kind === "investment").reduce((t, a) => t + a.balanceCents, 0);
  const cash = accounts.filter((a) => a.kind === "checking" || a.kind === "savings").reduce((t, a) => t + a.balanceCents, 0);
  const credit = -accounts.filter((a) => a.kind === "credit").reduce((t, a) => t + a.balanceCents, 0);
  const loans = accounts.filter((a) => a.kind === "loan");
  const loanOwed = -loans.reduce((t, a) => t + a.balanceCents, 0);
  const loanUnknown = loans.length > 0 && loanOwed === 0;

  const W = 1200;
  const H = 260;
  const padL = 46;
  const padR = 18;
  const top = 14;
  const bottom = H - 28;
  const n = points.length;
  const values = points.map((p) => p.valueCents);
  const lo = Math.min(...values, netWorthCents);
  const hi = Math.max(...values, netWorthCents);
  const span = Math.max(100000, hi - lo);
  const yLo = Math.max(0, Math.floor((lo - span * 0.12) / 100000) * 100000);
  const yHi = Math.ceil((hi + span * 0.08) / 100000) * 100000;
  const ticks = [0, 1, 2, 3].map((i) => yLo + ((yHi - yLo) * i) / 3);
  const x = (i: number) => (n <= 1 ? padL : padL + (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => bottom - ((v - yLo) / (yHi - yLo || 1)) * (bottom - top);

  const coords = points.map((p, i) => [x(i), y(p.valueCents)] as const);
  const linePath = smoothPath(coords);
  const areaPath = n ? `${linePath} L${x(n - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z` : "";

  const monthMarks: { i: number; label: string }[] = [];
  let lastMonth = "";
  points.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    if (m !== lastMonth) {
      if (i > 0 || range === "ALL" || range === "1Y") monthMarks.push({ i, label: monthLabel(p.date, monthMarks.length === 0) });
      lastMonth = m;
    }
  });
  if (monthMarks.length === 0 && n) monthMarks.push({ i: 0, label: monthLabel(points[0].date, true) });


  const monthlyBars = useMemo(() => {
    const out: { label: string; value: number; date: string }[] = [];
    let cur = "";
    for (const p of points) {
      const m = p.date.slice(0, 7);
      if (m !== cur) {
        out.push({ label: monthLabel(p.date, false), value: p.valueCents, date: p.date });
        cur = m;
      } else out[out.length - 1] = { ...out[out.length - 1], value: p.valueCents, date: p.date };
    }
    return out;
  }, [points]);

  const hi_ = hover !== null && hover >= 0 && hover < n ? hover : null;
  const endIdx = n - 1;
  const tipIdx = hi_ ?? endIdx;
  const tipX = n ? x(tipIdx) : 0;
  const tipY = n ? y(points[tipIdx].valueCents) : 0;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = (px - padL) / (W - padL - padR);
    setHover(Math.round(Math.min(1, Math.max(0, t)) * (n - 1)));
  }

  return (
    <section className={s.panel}>
      <div className={s.head}>
        <div className={s.figure}>
          <h1 className={`${s.nw} num`}>
            <sup>$</sup>
            {Math.round(netWorthCents / 100).toLocaleString("en-US")}
          </h1>
        </div>
        <div className={s.strip}>
          <span>
            Investments <b className="num">{fmtMoney(investments)}</b>
          </span>
          <i>·</i>
          <span>
            Cash <b className="num">{fmtMoney(cash)}</b>
          </span>
          <i>·</i>
          <span>
            Credit Debt <b className="num">{fmtMoney(credit)}</b>
          </span>
          {loans.length ? (
            <>
              <i>·</i>
              <span>
                {loans.length === 1 ? loans[0].name : "Loans"} {loanUnknown ? <em>balance unknown</em> : <b className="num">{fmtMoney(loanOwed)}</b>}
              </span>
            </>
          ) : null}
        </div>
        <div className={s.controls} role="group" aria-label="Chart range">
          <button type="button" className={`${s.iconBtn} ${mode === "bars" ? s.iconOn : ""}`} onClick={() => setMode(mode === "line" ? "bars" : "line")} aria-label={mode === "line" ? "Show monthly bars" : "Show daily line"} aria-pressed={mode === "bars"}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="1" y="6" width="2" height="7" fill="currentColor" />
              <rect x="5" y="2" width="2" height="11" fill="currentColor" />
              <rect x="9" y="8" width="2" height="5" fill="currentColor" />
            </svg>
          </button>
          {RANGES.map((r) => (
            <button key={r} type="button" className={`${s.pill} ${r === range ? s.pillOn : ""}`} onClick={() => { setRange(r); setHover(null); }} aria-pressed={r === range}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {mode === "line" ? (
        <div className={s.chartWrap}>
          <svg className={`chart ${s.chart}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net worth, ${range === "ALL" ? "all history" : `last ${range}`}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={W - padR} y1={y(v).toFixed(1)} y2={y(v).toFixed(1)} className="grid" />
                <text x={padL - 10} y={y(v) + 4} textAnchor="end">{fmtK(v)}</text>
              </g>
            ))}
            {n > 1 ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
            {n > 1 ? <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" /> : null}
            {hi_ !== null ? <line x1={tipX} x2={tipX} y1={top} y2={bottom} stroke="var(--accent)" strokeDasharray="3 4" strokeWidth="1" opacity="0.8" /> : null}
            {n ? <circle cx={tipX} cy={tipY} r="4.5" fill="var(--ink)" stroke="var(--accent)" strokeWidth="2" /> : null}
            {n ? (
              <g transform={`translate(${Math.min(W - padR - 96, Math.max(padL, tipX - 48))}, ${Math.max(0, tipY - 36)})`}>
                <rect width="96" height="24" rx="4" fill="var(--surface2)" stroke="var(--rule2)" />
                <text x="48" y="16" textAnchor="middle" className={s.tip}>
                  {shortDate(points[tipIdx].date)} · {fmtMoney(points[tipIdx].valueCents)}
                </text>
              </g>
            ) : null}
          </svg>
          <svg className={`chart ${s.strip2}`} viewBox={`0 0 ${W} 18`} role="presentation" aria-hidden="true">
            {monthMarks.map((m) => (
              <text key={m.i} x={x(m.i)} y={13} textAnchor={m.i === 0 ? "start" : "middle"}>{m.label}</text>
            ))}
          </svg>
        </div>
      ) : (
        <div className={s.chartWrap}>
          <svg className={`chart ${s.chart}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net worth at month end">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={W - padR} y1={y(v).toFixed(1)} y2={y(v).toFixed(1)} className="grid" />
                <text x={padL - 10} y={y(v) + 4} textAnchor="end">{fmtK(v)}</text>
              </g>
            ))}
            {monthlyBars.map((b, i, arr) => {
              const slot = (W - padL - padR) / arr.length;
              const w = Math.min(64, slot * 0.6);
              const cx = padL + slot * i + slot / 2;
              const last = i === arr.length - 1;
              return (
                <g key={b.date}>
                  <rect x={cx - w / 2} y={y(b.value)} width={w} height={Math.max(1, bottom - y(b.value))} rx="2" fill={last ? "var(--accent)" : "var(--accent-soft)"} stroke={last ? "none" : "var(--accent)"} strokeOpacity="0.5" />
                  <text x={cx} y={y(b.value) - 8} textAnchor="middle" fill={last ? "var(--ink)" : undefined}>{fmtMoney(b.value)}</text>
                  <text x={cx} y={H - 8} textAnchor="middle">{b.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}


