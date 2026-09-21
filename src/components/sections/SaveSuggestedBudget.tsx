"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BudgetSummary } from "@/lib/types";
import { call } from "./api";
import s from "./sections.module.css";

export function SaveSuggestedBudget({ budget, compact = false }: { budget: BudgetSummary; compact?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; err?: string; done?: boolean }>({ busy: false });

  async function save() {
    setState({ busy: true });
    const r = await call("/api/budget", "POST", {
      month: budget.month,
      totalCents: budget.totalCents,
      categories: budget.categories.filter((c) => c.limitCents > 0).map((c) => ({ category: c.category, limitCents: c.limitCents })),
    });
    if (r.ok) { setState({ busy: false, done: true }); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  return (
    <div className={compact ? s.suggestInline : s.suggest}>
      <div>
        <span className="eyebrow">Suggested from your last three months</span>
        {!compact ? <p className={s.hint} style={{ marginTop: 6 }}>Nothing is saved yet. These limits are your own averages; save them as a starting point and tighten from there.</p> : null}
      </div>
      <div className={s.actions}>
        <button type="button" className={s.button} onClick={save} disabled={state.busy || state.done}>{state.done ? "Saved" : state.busy ? "Saving…" : "Save as my budget"}</button>
        {state.err ? <span className={s.err}>{state.err}</span> : null}
      </div>
    </div>
  );
}
