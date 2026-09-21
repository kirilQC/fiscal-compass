import type { SeriesPoint } from "@/lib/types";
import { domain, r1, xIndex, yScale } from "./scale";
import styles from "./charts.module.css";

export interface SparklineProps {
  points: SeriesPoint[];
  ariaLabel: string;
  color?: string;
  width?: number;
  height?: number;
  baseline?: boolean;
  endpoint?: boolean;
  step?: boolean;
  className?: string;
}

export function Sparkline({ points, ariaLabel, color = "var(--accent)", width = 300, height = 50, baseline = true, endpoint = true, step = false, className }: SparklineProps) {
  const { lo, hi } = domain(points.map((p) => p.valueCents), undefined, undefined, 0.12);
  const y = yScale(lo, hi, 6, height - 8);
  const x = xIndex(points.length, 0, width - 4);
  const coords = points.map((p, i) => [r1(x(i)), r1(y(p.valueCents))] as const);
  const path = step
    ? coords.map(([px, py], i) => (i === 0 ? `${px},${py}` : `${r1(coords[i - 1][0] + (px - coords[i - 1][0]) * 0.02)},${py} ${px},${py}`)).join(" ")
    : coords.map(([px, py]) => `${px},${py}`).join(" ");
  const [ex, ey] = coords[coords.length - 1];
  return (
    <svg className={`chart ${styles.svg} ${className ?? ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {baseline ? <line x1="0" y1={height - 6} x2={width} y2={height - 6} className="grid" /> : null}
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={path} />
      {endpoint ? <circle cx={ex} cy={ey} r="3" fill={color} stroke="var(--bg)" strokeWidth="2" /> : null}
    </svg>
  );
}
