"use client";

import { useState } from "react";
import { Pie, type PieSlice } from "@/components/charts";
import type { CategoryBudget, PlanItem } from "@/lib/types";
import { money } from "@/lib/format";
import styles from "./PlanDonut.module.css";

const GROUPS = ["Rent", "Car Costs", "Groceries", "Subscriptions & Internet", "Health & Renters Insurance", "Giving", "Utilities", "Business tools", "Other"] as const;
type Group = (typeof GROUPS)[number];

function groupForPlanItem(i: PlanItem): Group {
  const n = i.name.toLowerCase();
  if (i.category === "Housing") return "Rent";
  if (/renters|tricare|dental|concordia|health|gym|fitness/.test(n) || i.category === "Health" || i.category === "Fitness") return "Health & Renters Insurance";
  if (i.isDebtPayment || /\bcar\b|progressive|\bgas\b/.test(n)) return "Car Costs";
  if (i.category === "Groceries") return "Groceries";
  if (i.category === "Giving") return "Giving";
  if (i.category === "Business") return "Business tools";
  if (i.category === "Subscriptions" || i.category === "Entertainment" || /at&t|att|t-mobile|tmobile|internet|netflix|playstation/.test(n)) return "Subscriptions & Internet";
  if (i.category === "Utilities") return "Utilities";
  if (i.category === "Transport") return "Car Costs";
  if (i.category === "Insurance") return "Health & Renters Insurance";
  return "Other";
}

function groupForCategory(c: string): Group {
  switch (c) {
    case "Housing": return "Rent";
    case "Transport": return "Car Costs";
    case "Groceries": return "Groceries";
    case "Subscriptions": case "Entertainment": return "Subscriptions & Internet";
    case "Health": case "Insurance": case "Fitness": return "Health & Renters Insurance";
    case "Giving": return "Giving";
    case "Utilities": return "Utilities";
    case "Business": return "Business tools";
    default: return "Other";
  }
}

function sum(pairs: [Group, number][]): PieSlice[] {
  const m = new Map<Group, number>();
  for (const [g, v] of pairs) if (v > 0) m.set(g, (m.get(g) ?? 0) + v);
  return GROUPS.filter((g) => m.has(g)).map((g) => ({ label: g, value: m.get(g)! }));
}

export function plannedSlices(items: PlanItem[]): PieSlice[] {
  return sum(items.filter((i) => !i.isReimbursed).map((i) => [groupForPlanItem(i), i.expectedCents]));
}

export function actualSlices(categories: CategoryBudget[]): PieSlice[] {
  return sum(categories.filter((c) => c.category !== "Reimbursed").map((c) => [groupForCategory(c.category), c.spentCents]));
}

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
