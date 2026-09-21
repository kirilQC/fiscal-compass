"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Goal } from "@/lib/types";
import { call, toCents } from "./api";
import s from "./sections.module.css";

type Draft = { name: string; target: string; saved: string; targetDate: string; monthly: string };
const empty: Draft = { name: "", target: "", saved: "", targetDate: "", monthly: "" };
const fromGoal = (g: Goal): Draft => ({
  name: g.name,
  target: String(g.targetCents / 100),
  saved: String(g.savedCents / 100),
  targetDate: g.targetDate ?? "",
  monthly: g.monthlyPlanCents === null ? "" : String(g.monthlyPlanCents / 100),
});

function toBody(f: Draft) {
  const targetCents = toCents(f.target);
  const savedCents = toCents(f.saved || "0");
  if (!f.name.trim()) throw new Error("Give the goal a name.");
  if (!Number.isFinite(targetCents) || targetCents <= 0) throw new Error("Enter a target amount in dollars.");
  if (!Number.isFinite(savedCents) || savedCents < 0) throw new Error("Saved so far must be zero or more.");
  return {
    name: f.name.trim(),
    targetCents,
    savedCents,
    targetDate: f.targetDate || null,
    monthlyPlanCents: f.monthly === "" ? null : toCents(f.monthly),
  };
}

function Fields({ f, setF, prefix }: { f: Draft; setF: (d: Draft) => void; prefix: string }) {
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor={`${prefix}-name`}>Goal</label>
          <input id={`${prefix}-name`} className={s.input} value={f.name} onChange={set("name")} placeholder="Japan trip" />
        </div>
        <div className={s.field}>
          <label htmlFor={`${prefix}-target`}>Target ($)</label>
          <input id={`${prefix}-target`} className={`${s.input} num`} inputMode="decimal" value={f.target} onChange={set("target")} placeholder="6,000" />
        </div>
        <div className={s.field}>
          <label htmlFor={`${prefix}-saved`}>Saved so far ($)</label>
          <input id={`${prefix}-saved`} className={`${s.input} num`} inputMode="decimal" value={f.saved} onChange={set("saved")} placeholder="0" />
        </div>
      </div>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor={`${prefix}-date`}>Target date</label>
          <input id={`${prefix}-date`} type="date" className={`${s.input} num`} value={f.targetDate} onChange={set("targetDate")} />
        </div>
        <div className={s.field}>
          <label htmlFor={`${prefix}-monthly`}>Saving each month ($)</label>
          <input id={`${prefix}-monthly`} className={`${s.input} num`} inputMode="decimal" value={f.monthly} onChange={set("monthly")} placeholder="410" />
        </div>
      </div>
    </>
  );
}

export function AddGoal() {
  const router = useRouter();
  const [f, setF] = useState<Draft>(empty);
  const [state, setState] = useState<{ busy: boolean; err?: string; msg?: string }>({ busy: false });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let body;
    try { body = toBody(f); } catch (err) { return setState({ busy: false, err: (err as Error).message }); }
    setState({ busy: true });
    const r = await call("/api/goals", "POST", body);
    if (r.ok) { setState({ busy: false, msg: `${body.name} added.` }); setF(empty); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <Fields f={f} setF={setF} prefix="g-new" />
      <div className={s.actions}>
        <button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : "Add goal"}</button>
      </div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
      {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
    </form>
  );
}

export function EditGoal({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Draft>(fromGoal(goal));
  const [state, setState] = useState<{ busy: boolean; err?: string }>({ busy: false });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let body;
    try { body = toBody(f); } catch (err) { return setState({ busy: false, err: (err as Error).message }); }
    setState({ busy: true });
    const r = await call("/api/goals", "PATCH", { id: goal.id, ...body });
    if (r.ok) { setState({ busy: false }); setOpen(false); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  async function remove() {
    if (!confirm(`Delete “${goal.name}”?`)) return;
    setState({ busy: true });
    const r = await call("/api/goals", "DELETE", { id: goal.id });
    if (r.ok) router.refresh();
    else setState({ busy: false, err: r.error });
  }

  if (!open) {
    return (
      <div className={s.actions} style={{ marginTop: 18 }}>
        <button type="button" className={s.link} onClick={() => setOpen(true)}>Edit</button>
        <button type="button" className={s.link} style={{ color: "var(--ink3)" }} onClick={remove}>Delete</button>
        {state.err ? <p className={s.err}>{state.err}</p> : null}
      </div>
    );
  }
  return (
    <form className={s.form} onSubmit={save} style={{ marginTop: 22 }}>
      <Fields f={f} setF={setF} prefix={`g-${goal.id}`} />
      <div className={s.actions}>
        <button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : "Save"}</button>
        <button type="button" className={`${s.button} ${s.ghost}`} onClick={() => { setOpen(false); setF(fromGoal(goal)); }}>Cancel</button>
      </div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
    </form>
  );
}
