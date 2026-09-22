"use client";

import { useState } from "react";
import { Pie } from "@/components/charts";
import type { CategoryBudget, PlanItem } from "@/lib/types";
import { money } from "@/lib/format";
import { plannedSlices, actualSlices } from "./slices";
import styles from "./PlanDonut.module.css";

export { plannedSlices, actualSlices };

export function PlanDonut({ items, categories, monthName, initial = "planned", size = 560 }: { items: PlanItem[]; categories: CategoryBudget[]; monthName: string; initial?: "planned" | "actual"; size?: number }) {
  const [mode, setMode] = useState<"planned" | "actual">(initial);
  const slices = mode === "planned" ? plannedSlices(items) : actualSlices(categories);
  const total = slices.reduce((t, s) => t + s.value, 0);
  const title = mode === "planned" ? `Distribution of Monthly Expenses (Total: ${money(total)})` : `Where ${monthName} went (Total: ${money(total)})`;
  return (
    <div>
      <div className={styles.toggle} role="tablist" aria-label="Planned or actual spending">
        <button type="button" role="tab" aria-selected={mode === "planned"} className={mode === "planned" ? styles.on : undefined} onClick={() => setMode("planned")}>planned</button>
        <span aria-hidden="true">·</span>
        <button type="button" role="tab" aria-selected={mode === "actual"} className={mode === "actual" ? styles.on : undefined} onClick={() => setMode("actual")}>actual</button>
      </div>
      {slices.length ? (
        <Pie slices={slices} title={title} ariaLabel={title} formatValue={money} size={size} />
      ) : (
        <p className={styles.empty}>Nothing here yet.</p>
      )}
    </div>
  );
}
