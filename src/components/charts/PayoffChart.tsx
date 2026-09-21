import type { SeriesPoint } from "@/lib/types";
import { r1, yScale } from "./scale";
import styles from "./charts.module.css";

export interface PayoffChartProps {
  base: SeriesPoint[];
  accelerated?: SeriesPoint[];
  ariaLabel: string;
  width?: number;
  height?: number;
  startLabel: string;
  endLabel: string;
  altLabel?: string;
  baseLegend?: string;
  altLegend?: string;
  className?: string;
}

export function PayoffChart({ base, accelerated, ariaLabel, width = 520, height = 150, startLabel, endLabel, altLabel, baseLegend = "current plan", altLegend, className }: PayoffChartProps) {
  const bottom = height - 30;
  const hi = Math.max(...base.map((p) => p.valueCents));
  const y = yScale(0, hi, 12, bottom);
  const n = base.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (width - 30));
  const line = (pts: SeriesPoint[]) => pts.map((p, i) => `${r1(x(i))},${r1(y(p.valueCents))}`).join(" ");
  const altEndX = accelerated ? r1(x(accelerated.length - 1)) : null;
  return (
    <>
      <svg className={`chart ${styles.svg} ${className ?? ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <line x1="0" y1={bottom} x2={width} y2={bottom} className="axis" />
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" points={line(base)} />
        {accelerated ? <polyline fill="none" stroke="var(--ink3)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" points={line(accelerated)} /> : null}
        <text x="0" y={bottom + 18}>{startLabel}</text>
        {accelerated && altLabel && altEndX !== null ? (
          <text x={altEndX} y={bottom + 18} textAnchor="middle" style={{ fill: "var(--ink)" }}>
            {altLabel}
          </text>
        ) : null}
        <text x={width} y={bottom + 18} textAnchor="end">{endLabel}</text>
      </svg>
      {accelerated ? (
        <div className={styles.legend}>
          <span><i />{baseLegend}</span>
          <span><i style={{ background: "var(--ink3)" }} />{altLegend}</span>
        </div>
      ) : null}
    </>
  );
}
