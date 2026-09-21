import type { SeriesPoint } from "@/lib/types";
import { compact } from "@/lib/format";
import { domain, r1, ticks, xIndex, yScale, type Pad } from "./scale";
import styles from "./charts.module.css";

export interface LineSeries {
  id: string;
  label?: string;
  points: SeriesPoint[];
  color?: string;
  dashed?: boolean;
  area?: boolean;
}

export interface LineAnnotation {
  date: string;
  text: string;
}

export interface ReferenceLine {
  value: number;
  label?: string;
  color?: string;
  dashed?: boolean;
  align?: "start" | "end";
}

export interface LineChartProps {
  series: LineSeries[];
  ariaLabel: string;
  width?: number;
  height?: number;
  pad?: Partial<Pad>;
  yTicks?: number;
  yMin?: number;
  yMax?: number;
  formatY?: (v: number) => string;
  xLabel?: (p: SeriesPoint, i: number, n: number) => string | null;
  annotations?: LineAnnotation[];
  endpointLabel?: boolean | ((v: number) => string);
  references?: ReferenceLine[];
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_PAD: Pad = { top: 12, right: 110, bottom: 40, left: 0 };

export function LineChart({
  series,
  ariaLabel,
  width = 1200,
  height = 240,
  pad: padIn,
  yTicks = 3,
  yMin,
  yMax,
  formatY = compact,
  xLabel,
  annotations = [],
  endpointLabel = true,
  references = [],
  className,
  style,
}: LineChartProps) {
  const pad = { ...DEFAULT_PAD, ...padIn };
  const all = series.flatMap((s) => s.points.map((p) => p.valueCents)).concat(references.map((r) => r.value));
  const { lo, hi } = domain(all, yMin, yMax);
  const plotTop = pad.top;
  const plotBottom = height - pad.bottom;
  const y = yScale(lo, hi, plotTop, plotBottom);
  const n = Math.max(...series.map((s) => s.points.length));
  const x = xIndex(n, pad.left + (yTicks ? 60 : 0), width - pad.right);
  const gridYs = yTicks > 0 ? ticks(lo, hi, yTicks) : [];
  const primary = series[0];
  const fmtEnd = typeof endpointLabel === "function" ? endpointLabel : formatY;

  return (
    <>
      <svg className={`chart ${styles.svg} ${className ?? ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} style={style}>
        {yTicks === 0 ? <line x1={pad.left} y1={r1(plotBottom)} x2={width} y2={r1(plotBottom)} className="axis" /> : null}
        {gridYs.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} y1={r1(y(t))} x2={width} y2={r1(y(t))} className={i === 0 ? "axis" : "grid"} />
            <text x={pad.left} y={r1(y(t) - 4)}>{formatY(t)}</text>
          </g>
        ))}
        {references.map((ref, i) => (
          <g key={`ref-${i}`}>
            <line x1={pad.left} y1={r1(y(ref.value))} x2={width} y2={r1(y(ref.value))} stroke={ref.color ?? "var(--ink3)"} strokeDasharray={ref.dashed === false ? undefined : "3 4"} />
            {ref.label ? (
              <text x={ref.align === "start" ? pad.left : width} y={r1(y(ref.value) - 4)} textAnchor={ref.align === "start" ? "start" : "end"} style={{ fill: ref.color ?? "var(--ink3)" }}>
                {ref.label}
              </text>
            ) : null}
          </g>
        ))}
        {series.map((s) => {
          const color = s.color ?? "var(--accent)";
          const pts = s.points.map((p, i) => `${r1(x(i))},${r1(y(p.valueCents))}`).join(" ");
          const last = s.points[s.points.length - 1];
          const lastX = r1(x(s.points.length - 1));
          const lastY = r1(y(last.valueCents));
          return (
            <g key={s.id}>
              {s.area ? (
                <path d={`M${pts.split(" ").join(" L")} L${lastX},${r1(plotBottom)} L${r1(x(0))},${r1(plotBottom)} Z`} fill={s.id === primary.id ? "var(--accent-faint)" : "none"} opacity={s.id === primary.id ? 1 : 0} />
              ) : null}
              <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeDasharray={s.dashed ? "4 3" : undefined} points={pts} />
              <circle cx={lastX} cy={lastY} r="4.5" fill={color} stroke="var(--bg)" strokeWidth="2" />
              {endpointLabel && s.id === primary.id ? (
                <text x={lastX + 14} y={lastY + 4} style={{ fill: "var(--ink)", fontSize: 13 }}>
                  {fmtEnd(last.valueCents)}
                </text>
              ) : null}
            </g>
          );
        })}
        {annotations.map((a, i) => {
          const idx = primary.points.findIndex((p) => p.date === a.date);
          if (idx < 0) return null;
          const px = r1(x(idx));
          const py = r1(y(primary.points[idx].valueCents));
          const below = py < plotBottom - 34;
          const ty = below ? py + 26 : py - 18;
          return (
            <g key={`ann-${i}`}>
              <circle cx={px} cy={py} r="3" fill="var(--bg)" stroke="var(--ink3)" strokeWidth="1.5" />
              <line x1={px} y1={below ? py + 5 : py - 5} x2={px} y2={below ? ty - 12 : ty + 4} stroke="var(--rule2)" />
              <text x={px} y={ty} textAnchor="middle" className={styles.note}>
                {a.text}
              </text>
            </g>
          );
        })}
        {xLabel
          ? primary.points.map((p, i) => {
              const label = xLabel(p, i, primary.points.length);
              if (!label) return null;
              const anchor = i === primary.points.length - 1 ? "middle" : "start";
              return (
                <text key={`x-${i}`} x={r1(x(i))} y={height - pad.bottom + 22} textAnchor={anchor}>
                  {label}
                </text>
              );
            })
          : null}
      </svg>
      {series.length >= 2 ? (
        <div className={styles.legend}>
          {series.map((s) => (
            <span key={s.id}>
              <i style={{ background: s.color ?? "var(--accent)", opacity: s.dashed ? 0.7 : 1 }} />
              {s.label ?? s.id}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
