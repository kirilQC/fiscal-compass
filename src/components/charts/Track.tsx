import styles from "./charts.module.css";

export type Tone = "accent" | "good" | "warn" | "crit" | "muted";

export interface TrackProps {
  pct: number;
  pacePct?: number;
  paceLabel?: string;
  tone?: Tone;
  className?: string;
  ariaLabel?: string;
}

export const toneVar: Record<Tone, string> = {
  accent: "var(--accent)",
  good: "var(--good)",
  warn: "var(--warn)",
  crit: "var(--crit)",
  muted: "var(--ink3)",
};

export function Track({ pct, pacePct, paceLabel = "pace", tone = "accent", className, ariaLabel }: TrackProps) {
  return (
    <div className={`${styles.track} ${className ?? ""}`} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
      <i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: toneVar[tone] }} />
      {pacePct !== undefined ? (
        <span className={styles.pace} style={{ left: `${Math.min(100, Math.max(0, pacePct))}%` }} data-label={paceLabel} />
      ) : null}
    </div>
  );
}

export function toneFor(pctUsed: number, warnAt = 90): Tone {
  if (pctUsed >= 100) return "crit";
  if (pctUsed >= warnAt) return "warn";
  return "accent";
}
