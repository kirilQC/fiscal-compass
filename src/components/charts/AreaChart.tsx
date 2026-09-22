"use client";

import { useId, useMemo, useState } from "react";
import type { SeriesPoint } from "@/lib/types";
import styles from "./charts.module.css";

export type Range = "1M" | "3M" | "6M" | "1Y" | "ALL";
export const RANGES: Range[] = ["1M", "3M", "6M", "1Y", "ALL"];
const DAYS: Record<Range, number | null> = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, ALL: null };

const fmtK = (cents: number) => `$${(cents / 100000).toFixed(1)}k`;
const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (iso: string, withYear: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", withYear ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });

export interface AreaChartProps {
  daily: SeriesPoint[];
  range: Range;
  ariaLabel: string;
  width?: number;
  height?: number;
  /** Pin the y-domain to include this value (e.g. today's exact figure). */
  anchorCents?: number;
  smooth?: boolean;
}

/** Range-filtered, smoothed area chart with crosshair tooltip; the parent owns the range pills. */
export function AreaChart({ daily, range, ariaLabel, width = 1200, height = 260, anchorCents, smooth = true }: AreaChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();

  const points = useMemo(() => {
    const n = DAYS[range];
    const window = n ? daily.slice(Math.max(0, daily.length - n)) : daily;
    return smooth ? smoothSeries(window, range === "1M" ? 2 : range === "3M" ? 4 : 7) : window;
  }, [daily, range, smooth]);

  const W = width;
  const H = height;
  const padL = 54;
  const padR = 18;
  const top = 14;
  const bottom = H - 28;
  const n = points.length;
  if (n === 0) return null;
  const values = points.map((p) => p.valueCents);
  const anchor = anchorCents ?? values[n - 1];
  const lo = Math.min(...values, anchor);
  const hi = Math.max(...values, anchor);
  const span = Math.max(100000, hi - lo);
  const yLo = Math.max(0, Math.floor((lo - span * 0.12) / 100000) * 100000);
  const yHi = Math.ceil((hi + span * 0.08) / 100000) * 100000;
  const ticks = [0, 1, 2, 3, 4].map((i) => yLo + ((yHi - yLo) * i) / 4);
  const x = (i: number) => (n <= 1 ? padL : padL + (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => bottom - ((v - yLo) / (yHi - yLo || 1)) * (bottom - top);

  const coords = points.map((p, i) => [x(i), y(p.valueCents)] as const);
  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;

  const monthMarks: { i: number; label: string }[] = [];
  let lastMonth = "";
  points.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    if (m !== lastMonth) {
      if (i > 0 || range === "ALL" || range === "1Y") monthMarks.push({ i, label: monthLabel(p.date, monthMarks.length === 0) });
      lastMonth = m;
    }
  });
  if (monthMarks.length === 0) monthMarks.push({ i: 0, label: monthLabel(points[0].date, true) });

  const tipIdx = hover !== null && hover >= 0 && hover < n ? hover : n - 1;
  const tipX = x(tipIdx);
  const tipY = y(points[tipIdx].valueCents);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = (px - padL) / (W - padL - padR);
    setHover(Math.round(Math.min(1, Math.max(0, t)) * (n - 1)));
  }

  return (
    <svg className={`chart ${styles.area}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v).toFixed(1)} y2={y(v).toFixed(1)} className="grid" />
          <text x={padL - 10} y={(y(v) + 4).toFixed(1)} textAnchor="end">{fmtK(v)}</text>
        </g>
      ))}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
      {monthMarks.map((m) => (
        <text key={m.i} x={x(m.i).toFixed(1)} y={H - 6} textAnchor={m.i === 0 ? "start" : "middle"}>{m.label}</text>
      ))}
      {hover !== null ? <line x1={tipX} x2={tipX} y1={top} y2={bottom} stroke="var(--accent)" strokeDasharray="3 4" strokeWidth="1" opacity="0.8" /> : null}
      <circle cx={tipX.toFixed(1)} cy={tipY.toFixed(1)} r="4.5" fill="var(--ink)" stroke="var(--accent)" strokeWidth="2" />
      <g transform={`translate(${Math.min(W - padR - 104, Math.max(padL, tipX - 52))}, ${Math.max(0, tipY - 38)})`}>
        <rect width="104" height="24" rx="4" fill="var(--surface2)" stroke="var(--rule2)" />
        <text x="52" y="16" textAnchor="middle" className={styles.areaTip}>
          {shortDate(points[tipIdx].date)} · {fmtMoney(points[tipIdx].valueCents)}
        </text>
      </g>
    </svg>
  );
}

// Monotone cubic interpolation: smooth without overshooting past real values.
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n < 3) return pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    m.push(dy[i] / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

// Centered rolling mean with a Gaussian-ish weight; the final point stays exact so the headline never drifts.
export function smoothSeries(pts: SeriesPoint[], radius: number): SeriesPoint[] {
  if (pts.length < 3 || radius < 1) return pts;
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * (radius / 2) ** 2)));
  return pts.map((p, i) => {
    if (i === pts.length - 1) return p;
    let sum = 0, wsum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= pts.length) continue;
      const w = weights[k + radius];
      sum += pts[j].valueCents * w;
      wsum += w;
    }
    return { date: p.date, valueCents: Math.round(sum / wsum) };
  });
}
