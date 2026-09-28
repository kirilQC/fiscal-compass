import type { PieSlice } from "@/components/charts";
import type { CategoryBudget, PlanItem } from "@/lib/types";

const GROUPS = ["Rent", "Car Costs", "Groceries", "Dining", "Shopping", "Subscriptions & Internet", "Health & Renters Insurance", "Giving", "Utilities", "Travel", "Other"] as const;
export type Group = (typeof GROUPS)[number];

function groupForPlanItem(i: PlanItem): Group {
  const n = i.name.toLowerCase();
  if (i.category === "Housing") return "Rent";
  if (/renters|tricare|dental|concordia|health|gym|fitness/.test(n) || i.category === "Health" || i.category === "Fitness") return "Health & Renters Insurance";
  if (i.isDebtPayment || /\bcar\b|progressive|\bgas\b/.test(n)) return "Car Costs";
  if (i.category === "Groceries") return "Groceries";
  if (i.category === "Giving") return "Giving";
  if (i.category === "Subscriptions" || i.category === "Entertainment" || /at&t|att|t-mobile|tmobile|internet|netflix|playstation/.test(n)) return "Subscriptions & Internet";
  if (i.category === "Utilities") return "Utilities";
  if (i.category === "Transport") return "Car Costs";
  if (i.category === "Insurance") return "Health & Renters Insurance";
  return "Other";
}

export function groupForCategory(c: string): Group {
  switch (c) {
    case "Housing": return "Rent";
    case "Transport": return "Car Costs";
    case "Groceries": return "Groceries";
    case "Dining": return "Dining";
    case "Shopping": case "Personal Care": return "Shopping";
    case "Travel": return "Travel";
    case "Subscriptions": case "Entertainment": return "Subscriptions & Internet";
    case "Health": case "Insurance": case "Fitness": return "Health & Renters Insurance";
    case "Giving": return "Giving";
    case "Utilities": return "Utilities";
    case "Reimbursed": return "Utilities";
    case "Loan Payment": return "Car Costs";
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
  return sum(categories.map((c) => [groupForCategory(c.category), c.spentCents]));
}

