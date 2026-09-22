import styles from "./charts.module.css";

export interface BulletRow {
  label: string;
  actual: number;
  planned: number;
}

export interface BulletChartProps {
  rows: BulletRow[];
  ariaLabel: string;
  formatValue: (v: number) => string;
  width?: number;
}

const L = 150;
const RIGHT = 150;
const ROW = 32;

export function BulletChart({ rows: rowsIn, ariaLabel, formatValue, width = 720 }: BulletChartProps) {
  const rows = rowsIn.filter((r) => r.actual > 0 || r.planned > 0).sort((a, b) => (b.actual - b.planned) - (a.actual - a.planned));
  if (!rows.length) return null;
  const W = width - L - RIGHT;
  const max = Math.max(...rows.map((r) => Math.max(r.actual, r.planned)));
  const actualTotal = rows.reduce((t, r) => t + r.actual, 0);
  const plannedTotal = rows.reduce((t, r) => t + r.planned, 0);
  const H = rows.length * ROW + 64;

  return (
    <svg className={`chart ${styles.svg}`} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel}>
      <text x={L} y="12" className={styles.bulletHead}>actual {formatValue(actualTotal)} · planned {formatValue(plannedTotal)}</text>
      {rows.map((r, i) => {
        const y = i * ROW + 26;
        const pw = (r.planned / max) * W;
        const aw = (r.actual / max) * W;
        const note = r.planned && r.actual > r.planned ? ` · ${formatValue(r.actual - r.planned)} over` : r.planned && r.actual < r.planned ? ` · ${formatValue(r.planned - r.actual)} left` : "";
        const tx = L + Math.max(aw, pw) + 8;
        return (
          <g key={r.label}>
            <text x={L - 12} y={y + 15} textAnchor="end" className={styles.bulletName}>{r.label}</text>
            {r.planned ? <rect x={L} y={y + 2} width={pw.toFixed(1)} height="20" fill="var(--rule2)" rx="1" /> : null}
            <rect x={L} y={y + 7} width={Math.min(aw, pw || aw).toFixed(1)} height="10" fill="var(--accent)" />
            {r.planned && aw > pw ? <rect x={(L + pw).toFixed(1)} y={y + 7} width={(aw - pw).toFixed(1)} height="10" fill="var(--over, #ff8a9a)" /> : null}
            {r.planned ? <line x1={(L + pw).toFixed(1)} x2={(L + pw).toFixed(1)} y1={y - 1} y2={y + 25} stroke="var(--ink2)" strokeWidth="1.5" /> : null}
            <text x={tx} y={y + 16} className={styles.bulletValue}>
              {formatValue(r.actual)}
              <tspan className={styles.bulletNote}>{note}</tspan>
            </text>
          </g>
        );
      })}
      <g transform={`translate(${L},${rows.length * ROW + 40})`}>
        <rect width="18" height="8" fill="var(--rule2)" />
        <text x="24" y="8">planned</text>
        <rect x="90" y="-1" width="18" height="10" fill="var(--accent)" />
        <text x="114" y="8">actual</text>
        <rect x="170" y="-1" width="18" height="10" fill="var(--over, #ff8a9a)" />
        <text x="194" y="8">over plan</text>
      </g>
    </svg>
  );
}
