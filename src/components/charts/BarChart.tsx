import { compact } from "@/lib/format";
import { r1, yScale } from "./scale";
import type { ReferenceLine } from "./LineChart";
import styles from "./charts.module.css";

export interface Bar {
  label: string;
  value: number;
  projected?: number;
  emphasis?: boolean;
  color?: string;
}

export interface BarChartProps {
  bars: Bar[];
  ariaLabel: string;
  width?: number;
  height?: number;
  references?: ReferenceLine[];
  yMax?: number;
  showValues?: boolean | "emphasis";
  formatValue?: (v: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

export function BarChart({
  bars,
  ariaLabel,
  width = 520,
  height = 160,
  references = [],
  yMax,
  showValues = true,
  formatValue = compact,
  className,
  style,
}: BarChartProps) {
  if (bars.length === 0) return null;
  const top = 16;
  const bottom = height - 32;
  const hi = yMax ?? Math.max(...bars.map((b) => Math.max(b.value, b.projected ?? 0)), ...references.map((r) => r.value)) * 1.08;
  const y = yScale(0, hi, top, bottom);
  const slot = width / bars.length;
  const barW = r1(slot * 0.68);

  return (
    <svg className={`chart ${styles.svg} ${className ?? ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} style={style}>
      <line x1="0" y1={bottom} x2={width} y2={bottom} className="axis" />
      {references.map((ref, i) => (
        <g key={i}>
          <line x1="0" y1={r1(y(ref.value))} x2={width} y2={r1(y(ref.value))} stroke={ref.color ?? "var(--ink3)"} strokeDasharray={ref.dashed === false ? undefined : "3 4"} />
          {ref.label ? (
            <text x={ref.align === "start" ? 0 : width} y={r1(y(ref.value) - 4)} textAnchor={ref.align === "start" ? "start" : "end"} style={{ fill: ref.color ?? "var(--ink3)" }}>
              {ref.label}
            </text>
          ) : null}
        </g>
      ))}
      {bars.map((b, i) => {
        const cx = r1(slot * i + slot / 2);
        const x0 = r1(cx - barW / 2);
        const yTop = r1(y(b.value));
        const color = b.color ?? "var(--accent)";
        const showVal = showValues === true || (showValues === "emphasis" && b.emphasis);
        return (
          <g key={i}>
            <rect x={x0} y={yTop} width={barW} height={r1(bottom - yTop)} fill={color} opacity={b.emphasis ? 1 : 0.5} />
            {b.projected !== undefined && b.projected > b.value ? (
              <rect x={x0} y={r1(y(b.projected))} width={barW} height={r1(yTop - y(b.projected))} fill="none" stroke={color} strokeDasharray="2 2" />
            ) : null}
            {showVal ? (
              <text x={cx} y={r1((b.projected && b.projected > b.value ? y(b.projected) : yTop) - 7)} textAnchor="middle" style={b.emphasis ? { fill: "var(--ink)" } : undefined}>
                {formatValue(b.value)}
              </text>
            ) : null}
            <text x={cx} y={bottom + 18} textAnchor="middle">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
