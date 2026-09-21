import styles from "./charts.module.css";

export interface StripItem {
  label: string;
  value: number;
}

export interface BarStripProps {
  items: StripItem[];
  ariaLabel: string;
  caption?: string;
  note?: string;
  width?: number;
  height?: number;
  color?: string;
}

// Horizontal strip of proportional bars laid end to end; each bar's length is its value.
export function BarStrip({ items, ariaLabel, caption, note, width = 1200, height = 16, color = "var(--accent)" }: BarStripProps) {
  const captionW = caption ? 80 : 0;
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const scale = (width * 0.34) / total;
  let cursor = captionW + 60;
  const rects = items.map((it, i) => {
    const w = Math.max(2, it.value * scale);
    const rect = <rect key={i} x={cursor.toFixed(1)} y={height / 2 - 3} width={w.toFixed(1)} height="6" fill={color} opacity={0.3 + (0.7 * i) / Math.max(1, items.length - 1)} />;
    cursor += w + 2;
    return rect;
  });
  return (
    <svg className={`chart ${styles.svg}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {caption ? (
        <text x="60" y={height / 2 + 4} className={styles.caption}>
          {caption}
        </text>
      ) : null}
      {rects}
      {note ? (
        <text x={cursor + 8} y={height / 2 + 4}>
          {note}
        </text>
      ) : null}
    </svg>
  );
}
