import styles from "./charts.module.css";

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  ariaLabel: string;
  formatValue?: (v: number) => string;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  maxSlices?: number;
  className?: string;
}

const SLOT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];

export function Donut({ slices: input, ariaLabel, formatValue = (v) => String(v), size = 260, thickness = 58, centerLabel, centerSub, maxSlices = 7, className }: DonutProps) {
  const total = input.reduce((t, s) => t + Math.max(0, s.value), 0);
  if (total <= 0) return null;
  const sorted = [...input].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices);
  const slices = rest.length ? [...kept, { label: "Other", value: rest.reduce((t, s) => t + s.value, 0) }] : kept;
  const c = size / 2;
  const rOuter = c - 4;
  const rInner = rOuter - thickness;
  const rLabel = (rOuter + rInner) / 2;
  const gapRad = (2 / rOuter) * 1;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const a0 = angle + gapRad / 2;
    const a1 = angle + frac * 2 * Math.PI - gapRad / 2;
    angle += frac * 2 * Math.PI;
    const mid = (a0 + a1) / 2;
    const color = s.color ?? (s.label === "Other" && rest.length ? "var(--ink3)" : SLOT[i % SLOT.length]);
    return { ...s, frac, a0, a1: Math.max(a0, a1), mid, color };
  });
  const pt = (r: number, a: number) => [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  const path = (a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(rOuter, a0);
    const [x1, y1] = pt(rOuter, a1);
    const [x2, y2] = pt(rInner, a1);
    const [x3, y3] = pt(rInner, a0);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${rOuter},${rOuter} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${rInner},${rInner} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
  };
  return (
    <div className={`${styles.donutWrap} ${className ?? ""}`}>
      <svg className={`chart ${styles.donut}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} style={{ width: size, height: size }}>
        {arcs.map((a) => (
          <path key={a.label} d={path(a.a0, a.a1)} fill={a.color}>
            <title>{`${a.label}: ${formatValue(a.value)} (${Math.round(a.frac * 100)}%)`}</title>
          </path>
        ))}
        {arcs
          .filter((a) => a.frac >= 0.09)
          .map((a) => {
            const [lx, ly] = pt(rLabel, a.mid);
            return (
              <text key={a.label} x={lx} y={ly} textAnchor="middle" className={styles.donutLabel}>
                <tspan x={lx} dy="-2">{formatValue(a.value)}</tspan>
                <tspan x={lx} dy="13">{Math.round(a.frac * 100)}%</tspan>
              </text>
            );
          })}
        {centerLabel ? (
          <text x={c} y={c - (centerSub ? 2 : -8)} textAnchor="middle" className={styles.ringLabel}>{centerLabel}</text>
        ) : null}
        {centerSub ? (
          <text x={c} y={c + 16} textAnchor="middle">{centerSub}</text>
        ) : null}
      </svg>
      <ul className={styles.donutLegend}>
        {arcs.map((a) => (
          <li key={a.label}>
            <i style={{ background: a.color }} />
            <span>{a.label}</span>
            <b className="num">{formatValue(a.value)}</b>
            <small className="num">{Math.round(a.frac * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
