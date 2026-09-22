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
  colors?: string[];
  sortSlices?: boolean;
  /** 0–99: hollow the center by this percent of the radius (a thick ring that still reads as a pie). */
  innerRadiusPct?: number;
  /** Up to two lines rendered in the hollow center. */
  centerLines?: [string, string?];
  /** Hover wiring — pass from a client component; without these the pie is static. */
  hoveredIndex?: number | null;
  hoverScale?: number;
  onSliceHover?: (index: number | null, event?: React.MouseEvent) => void;
  onSliceMove?: (index: number, event: React.MouseEvent) => void;
  showLabels?: boolean;
}

// Rose tints only, lightest first: the largest slice reads as the softest.
export const PIE_COLORS = ["#f7cdd6", "#f1aab8", "#ec95a6", "#e46d84", "#cc5068", "#ad4659", "#8f3c4d", "#6f2f3d"];
const DARK_INK_ON = new Set(["#f7cdd6", "#f1aab8", "#ec95a6", "#e46d84", "#cc5068"]);
const inkFor = (color: string) => (DARK_INK_ON.has(color.toLowerCase()) ? "#1d1a1b" : "var(--ink)");

const R = 100;
const C = 104;

function polar(angle: number, r: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function shortName(label: string) {
  return label.length > 16 ? label.split(" & ")[0] : label;
}

export function Pie({
  slices,
  title,
  ariaLabel,
  formatValue,
  size = 560,
  labelMinPct = 10,
  className,
  colors = PIE_COLORS,
  sortSlices = true,
  innerRadiusPct = 0,
  centerLines,
  hoveredIndex = null,
  hoverScale = 1.06,
  onSliceHover,
  onSliceMove,
  showLabels = true,
}: PieProps) {
  const filtered = slices.filter((s) => s.value > 0);
  const data = (sortSlices ? [...filtered].sort((a, b) => b.value - a.value) : filtered).slice(0, colors.length);
  const total = data.reduce((t, s) => t + s.value, 0);
  if (!total) return null;
  const r0 = Math.max(0, Math.min(99, innerRadiusPct)) / 100 * R;
  const starts = data.map((_, i) => data.slice(0, i).reduce((t, s) => t + s.value, 0));
  const arcs = data.map((s, i) => {
    const start = (starts[i] / total) * Math.PI * 2;
    const end = ((starts[i] + s.value) / total) * Math.PI * 2;
    const pct = (s.value / total) * 100;
    const [x0, y0] = polar(start, R);
    const [x1, y1] = polar(end, R);
    const large = end - start > Math.PI ? 1 : 0;
    let d: string;
    if (data.length === 1) {
      d = r0
        ? `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z M${C} ${C - r0} A${r0} ${r0} 0 1 0 ${C + 0.01} ${C - r0} Z`
        : `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
    } else if (r0) {
      const [ix0, iy0] = polar(start, r0);
      const [ix1, iy1] = polar(end, r0);
      d = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
    } else {
      d = `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    }
    const labelR = r0 ? (r0 + R) / 2 : R * 0.6;
    const [lx, ly] = polar((start + end) / 2, labelR);
    return { ...s, pct, d, lx, ly, color: colors[i] };
  });
  const interactive = !!onSliceHover;

  return (
    <figure className={`${styles.pieFig} ${className ?? ""}`}>
      {title ? (
        <div className={styles.pieHead}>
          <figcaption className={styles.pieTitle}>{title}</figcaption>
        </div>
      ) : null}
      <svg
        className={`${styles.pie} ${interactive ? styles.pieHover : ""}`}
        viewBox="0 0 208 208"
        role="img"
        aria-label={ariaLabel}
        style={{ maxWidth: size }}
        onMouseLeave={interactive ? () => onSliceHover?.(null) : undefined}
      >
        {arcs.map((a, i) => (
          <path
            key={a.label}
            d={a.d}
            fill={a.color}
            stroke="var(--bg)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={styles.pieSlice}
            style={hoveredIndex === i ? { transform: `scale(${hoverScale})`, filter: "brightness(1.1)" } : undefined}
            onMouseEnter={interactive ? (e) => onSliceHover?.(i, e) : undefined}
            onMouseMove={interactive && onSliceMove ? (e) => onSliceMove(i, e) : undefined}
          />
        ))}
        {showLabels
          ? arcs
              .filter((a) => a.pct >= labelMinPct)
              .map((a) => (
                <text key={a.label} x={a.lx} y={a.ly} textAnchor="middle" className={styles.pieLabel} style={{ fill: inkFor(a.color) }} pointerEvents="none">
                  <tspan x={a.lx} dy="-0.35em">{shortName(a.label)}</tspan>
                  <tspan x={a.lx} dy="1.25em">{formatValue(a.value)} · {a.pct.toFixed(1)}%</tspan>
                </text>
              ))
          : null}
        {r0 && centerLines ? (
          <>
            <text x={C} y={centerLines[1] ? C + 1 : C + 4} textAnchor="middle" className={styles.pieCenter} pointerEvents="none">{centerLines[0]}</text>
            {centerLines[1] ? <text x={C} y={C + 12} textAnchor="middle" className={styles.pieCenterSub} pointerEvents="none">{centerLines[1]}</text> : null}
          </>
        ) : null}
      </svg>
      <ul className={styles.pieLegend}>
          {arcs.map((a, i) => (
            <li
              key={a.label}
              className={hoveredIndex === i ? styles.pieLegendHot : undefined}
              onMouseEnter={interactive ? (e) => onSliceHover?.(i, e) : undefined}
              onMouseLeave={interactive ? () => onSliceHover?.(null) : undefined}
            >
              <i style={{ background: a.color }} />
              <span>
                {a.label} <b>{a.pct.toFixed(1)}%</b>
              </span>
            </li>
          ))}
      </ul>
    </figure>
  );
}
