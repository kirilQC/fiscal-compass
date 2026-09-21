"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BudgetSummary } from "@/lib/types";
import { toneVar } from "@/components/charts";
import { money } from "@/lib/format";
import { call, toCents } from "./api";
import s from "./sections.module.css";

const toneOf = (pct: number): "crit" | "warn" | "good" => (pct >= 100 ? "crit" : pct >= 90 ? "warn" : "good");

export function BudgetEditor({ budget }: { budget: BudgetSummary }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(String(Math.round(budget.totalCents / 100)));
  const [limits, setLimits] = useState<Record<string, string>>(Object.fromEntries(budget.categories.map((c) => [c.category, String(Math.round(c.limitCents / 100))])));
  const [newCat, setNewCat] = useState("");
  const [state, setState] = useState<{ busy: boolean; err?: string; msg?: string }>({ busy: false });

  const cats = Array.from(new Set([...budget.categories.map((c) => c.category), ...Object.keys(limits)]));
  const sumLimits = cats.reduce((sum, c) => sum + (Number(limits[c]) || 0), 0);

  async function save() {
    const totalCents = toCents(total);
    if (!Number.isFinite(totalCents) || totalCents < 0) return setState({ busy: false, err: "Enter a monthly total in dollars." });
    setState({ busy: true });
    const r = await call("/api/budget", "POST", {
      month: budget.month,
      totalCents,
      categories: cats.filter((c) => limits[c] !== undefined && limits[c] !== "").map((c) => ({ category: c, limitCents: toCents(limits[c]) })),
    });
    if (r.ok) {
      setState({ busy: false, msg: "Budget saved." });
      setEditing(false);
      router.refresh();
    } else setState({ busy: false, err: r.error });
  }

  function addCategory() {
    const name = newCat.trim();
    if (!name || limits[name] !== undefined) return;
    setLimits({ ...limits, [name]: "" });
    setNewCat("");
  }

  return (
    <div>
      <div className={s.meta} style={{ marginBottom: 14 }}>
        <span>Categories · of budget</span>
        {editing ? (
          <span className="num">limits total {money(sumLimits * 100)} of {money(toCents(total) || 0)}</span>
        ) : (
          <button type="button" className={s.link} onClick={() => setEditing(true)}>Edit limits</button>
        )}
      </div>
      {cats.map((c) => {
        const row = budget.categories.find((x) => x.category === c);
        const spent = row?.spentCents ?? 0;
        const limit = editing ? toCents(limits[c] || "0") : row?.limitCents ?? 0;
        const pct = limit ? (spent / limit) * 100 : 0;
        const tone = row?.isCommitment ? "accent" : toneOf(pct);
        return (
          <div className={s.catRow} key={c}>
            <span>
              <i style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: toneVar[tone], marginRight: 8, verticalAlign: "middle" }} />
              {c}
              {row?.isCommitment ? <span className="faint" style={{ fontSize: 11, letterSpacing: "0.1em", marginLeft: 8 }}>COMMITMENT</span> : pct >= 100 ? <span className="crit" style={{ fontSize: 11, letterSpacing: "0.1em", marginLeft: 8 }}>OVER</span> : null}
            </span>
            <div className={s.catTrack}>
              <i style={{ width: `${Math.min(100, pct)}%`, background: tone === "good" ? "var(--accent)" : toneVar[tone] }} />
            </div>
            <span className={`${s.catAmt} num ${tone !== "good" ? tone : ""}`}>{money(spent)}</span>
            {editing ? (
              <span className={s.catLimit}>
                / $<input aria-label={`${c} limit`} inputMode="numeric" value={limits[c] ?? ""} onChange={(e) => setLimits({ ...limits, [c]: e.target.value })} />
              </span>
            ) : (
              <span className={`${s.catLimit} num`}>/ {Math.round(limit / 100)}</span>
            )}
          </div>
        );
      })}
      {editing ? (
        <div className={s.form} style={{ marginTop: 24 }}>
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor="b-total">Monthly total ($)</label>
              <input id="b-total" className={`${s.input} num`} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div className={s.field}>
              <label htmlFor="b-newcat">New category</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input id="b-newcat" className={s.input} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Travel" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }} />
                <button type="button" className={s.link} onClick={addCategory}>Add</button>
              </div>
            </div>
          </div>
          <div className={s.actions}>
            <button type="button" className={s.button} onClick={save} disabled={state.busy}>{state.busy ? "Saving…" : "Save budget"}</button>
            <button type="button" className={`${s.button} ${s.ghost}`} onClick={() => setEditing(false)}>Cancel</button>
          </div>
          {state.err ? <p className={s.err}>{state.err}</p> : null}
        </div>
      ) : state.msg ? <p className={s.ok} style={{ marginTop: 12 }}>{state.msg}</p> : null}
    </div>
  );
}
