import styles from "./charts.module.css";

export interface PieSlice {
  label: string;
  value: number;
}

export interface PieProps {
  slices: PieSlice[];
  title: string;
  ariaLabel: string;
  formatValue: (v: number) => string;
  size?: number;
  labelMinPct?: number;
  className?: string;
}

export const PIE_COLORS = ["#6089ff", "#ffbe6e", "#f062c8", "#ffa6e0", "#b8c8ff", "#ffe9d6", "#7ee0c8", "#c7a6ff"];

const R = 100;
const C = 104;

function polar(angle: number, r: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

export function Pie({ slices, title, ariaLabel, formatValue, size = 560, labelMinPct = 8, className }: PieProps) {
  const data = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value).slice(0, PIE_COLORS.length);
  const total = data.reduce((t, s) => t + s.value, 0);
  if (!total) return null;
  const starts = data.map((_, i) => data.slice(0, i).reduce((t, s) => t + s.value, 0));
  const arcs = data.map((s, i) => {
    const start = (starts[i] / total) * Math.PI * 2;
    const end = ((starts[i] + s.value) / total) * Math.PI * 2;
    const pct = (s.value / total) * 100;
    const [x0, y0] = polar(start, R);
    const [x1, y1] = polar(end, R);
    const large = end - start > Math.PI ? 1 : 0;
    const d = data.length === 1 ? `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z` : `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const [lx, ly] = polar((start + end) / 2, R * 0.6);
    return { ...s, pct, d, lx, ly, color: PIE_COLORS[i] };
  });

  return (
    <figure className={`${styles.pieFig} ${className ?? ""}`}>
      <figcaption className={styles.pieTitle}>{title}</figcaption>
      <ul className={styles.pieLegend}>
        {arcs.map((a) => (
          <li key={a.label}>
            <i style={{ background: a.color }} />
            <span>{a.label} : {a.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <svg className={styles.pie} viewBox="0 0 208 208" role="img" aria-label={ariaLabel} style={{ maxWidth: size }}>
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} stroke="var(--bg)" strokeWidth="1.6" strokeLinejoin="round" />
        ))}
        {arcs.filter((a) => a.pct >= labelMinPct).map((a) => (
          <text key={a.label} x={a.lx} y={a.ly} textAnchor="middle" className={styles.pieLabel}>
            <tspan x={a.lx} dy="-0.35em">{a.label}</tspan>
            <tspan x={a.lx} dy="1.25em">{formatValue(a.value)} ({a.pct.toFixed(1)}%)</tspan>
          </text>
        ))}
      </svg>
    </figure>
  );
}
