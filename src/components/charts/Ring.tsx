import styles from "./charts.module.css";

export interface RingSegment {
  pct: number;
  color?: string;
  opacity?: number;
}

export interface RingProps {
  segments: RingSegment[];
  ariaLabel: string;
  label: string;
  sub?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Ring({ segments, ariaLabel, label, sub, size = 150, strokeWidth = 3, className }: RingProps) {
  const c = size / 2;
  const r = c - 15;
  const circ = 2 * Math.PI * r;
  const gap = 2;
  let offset = 0;
  return (
    <svg className={`chart ${styles.svg} ${styles.ring} ${className ?? ""}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} style={{ width: size, height: size }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--rule)" strokeWidth={strokeWidth} />
      <g transform={`rotate(-90 ${c} ${c})`} fill="none" strokeWidth={strokeWidth}>
        {segments.map((s, i) => {
          const len = Math.max(0, (s.pct / 100) * circ - gap);
          const el = <circle key={i} cx={c} cy={c} r={r} stroke={s.color ?? "var(--accent)"} opacity={s.opacity ?? 1} strokeDasharray={`${len.toFixed(1)} ${circ.toFixed(1)}`} strokeDashoffset={(-offset).toFixed(1)} />;
          offset += (s.pct / 100) * circ;
          return el;
        })}
      </g>
      <text x={c} y={c - 5} textAnchor="middle" className={styles.ringLabel}>
        {label}
      </text>
      {sub ? (
        <text x={c} y={c + 13} textAnchor="middle">
          {sub}
        </text>
      ) : null}
    </svg>
  );
}
