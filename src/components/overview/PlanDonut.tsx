"use client";

import { useState } from "react";
import { Donut } from "@/components/charts";
import { money } from "@/lib/format";
import styles from "./PlanDonut.module.css";

export interface DonutSet {
  label: string;
  slices: { label: string; value: number }[];
  totalCents: number;
  centerSub: string;
}

export function PlanDonut({ planned, actual, size = 220, thickness = 50, maxSlices = 6, initial = "planned" }: { planned: DonutSet; actual: DonutSet; size?: number; thickness?: number; maxSlices?: number; initial?: "planned" | "actual" }) {
  const [mode, setMode] = useState<"planned" | "actual">(initial);
  const set = mode === "planned" ? planned : actual;
  return (
    <div>
      <div className={styles.head}>
        <p className={styles.title}>{set.label} · {money(set.totalCents)}</p>
        <div className={styles.toggle} role="tablist" aria-label="Planned or actual spending">
          <button type="button" role="tab" aria-selected={mode === "planned"} className={mode === "planned" ? styles.on : undefined} onClick={() => setMode("planned")}>planned</button>
          <span aria-hidden="true">·</span>
          <button type="button" role="tab" aria-selected={mode === "actual"} className={mode === "actual" ? styles.on : undefined} onClick={() => setMode("actual")}>actual</button>
        </div>
      </div>
      {set.slices.length ? (
        <Donut slices={set.slices} ariaLabel={set.label} formatValue={money} size={size} thickness={thickness} maxSlices={maxSlices} centerLabel={money(set.totalCents)} centerSub={set.centerSub} />
      ) : (
        <p className={styles.empty}>Nothing here yet.</p>
      )}
    </div>
  );
}
