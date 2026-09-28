"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanItem } from "@/lib/types";
import { money, moneyExact, dateLabel } from "@/lib/format";
import { call, toCents } from "./api";
import s from "./sections.module.css";

type Msg = { busy: boolean; err?: string };

interface Form {
  name: string;
  category: string;
  mode: "fixed" | "range" | "pct" | "varies";
  amount: string;
  min: string;
  max: string;
  pct: string;
  pattern: string;
  dueDay: string;
  reimbursed: boolean;
}

const blank: Form = { name: "", category: "Utilities", mode: "fixed", amount: "", min: "", max: "", pct: "", pattern: "", dueDay: "", reimbursed: false };

function toForm(i: PlanItem): Form {
  return {
    name: i.name,
    category: i.category,
    mode: i.pctOfIncome != null ? "pct" : i.amountCents != null ? "fixed" : i.amountMinCents != null ? "range" : "varies",
    amount: i.amountCents != null ? (i.amountCents / 100).toFixed(2) : "",
    min: i.amountMinCents != null ? String(i.amountMinCents / 100) : "",
    max: i.amountMaxCents != null ? String(i.amountMaxCents / 100) : "",
    pct: i.pctOfIncome != null ? String(i.pctOfIncome) : "",
    pattern: i.merchantPattern ?? "",
    dueDay: i.dueDay != null ? String(i.dueDay) : "",
    reimbursed: i.isReimbursed,
  };
}

function toBody(f: Form) {
  const dueDay = f.dueDay.trim() ? Number(f.dueDay) : null;
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) throw new Error("Due day is a day of the month.");
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    category: f.reimbursed ? "Reimbursed" : f.category,
    merchantPattern: f.pattern.trim() || null,
    dueDay,
    isReimbursed: f.reimbursed,
    amountCents: null,
    amountMinCents: null,
    amountMaxCents: null,
    pctOfIncome: null,
  };
  if (!body.name) throw new Error("Give it a name.");
  if (f.mode === "fixed") {
    const c = toCents(f.amount);
    if (!Number.isFinite(c) || c < 0) throw new Error("Amount must be a dollar figure.");
    body.amountCents = c;
  } else if (f.mode === "range") {
    const lo = toCents(f.min), hi = toCents(f.max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) throw new Error("Range needs a low and a high.");
    body.amountMinCents = lo;
    body.amountMaxCents = hi;
  } else if (f.mode === "pct") {
    const p = Number(f.pct);
    if (!Number.isFinite(p) || p <= 0 || p > 100) throw new Error("Percent of income, 0–100.");
    body.pctOfIncome = p;
  }
  return body;
}

function StatusPill({ item }: { item: PlanItem }) {
  const cls = item.status === "paid" ? s.pillPaid : item.status === "overdue" ? s.pillOverdue : item.status === "varies" ? s.pillVaries : s.pillDue;
  const text =
    item.status === "paid" ? `Paid ${item.paidOn ? dateLabel(item.paidOn) : ""}`.trim()
    : item.status === "overdue" ? `Overdue · due ${item.dueDay}${suffix(item.dueDay ?? 0)}`
    : item.status === "varies" ? "Varies"
    : item.dueDay ? `Due ${item.dueDay}${suffix(item.dueDay)}` : "Due";
  return <span className={`${s.pill} ${cls}`}>{text}</span>;
}

const suffix = (d: number) => (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");

function expectedLabel(i: PlanItem) {
  if (i.pctOfIncome != null) return `${i.pctOfIncome}% of income · ${money(i.expectedCents)}`;
  if (i.amountCents != null) return moneyExact(i.amountCents);
  if (i.amountMinCents != null && i.amountMaxCents != null) return `${money(i.amountMinCents)}–${money(i.amountMaxCents)}`;
  return "varies";
}

export function PlanPanel({ items, categories }: { items: PlanItem[]; categories: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(blank);
  const [state, setState] = useState<Msg>({ busy: false });

  function startEdit(i: PlanItem) {
    setAdding(false);
    setEditing(i.id);
    setForm(toForm(i));
    setState({ busy: false });
  }
  function startAdd() {
    setEditing(null);
    setAdding(true);
    setForm(blank);
    setState({ busy: false });
  }
  function cancel() {
    setEditing(null);
    setAdding(false);
    setState({ busy: false });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let body: Record<string, unknown>;
    try { body = toBody(form); } catch (err) { return setState({ busy: false, err: (err as Error).message }); }
    setState({ busy: true });
    const r = editing ? await call("/api/plan", "PATCH", { id: editing, ...body }) : await call("/api/plan", "POST", body);
    if (r.ok) { cancel(); router.refresh(); } else setState({ busy: false, err: r.error });
  }

  async function remove(id: string) {
    if (!confirm("Remove this from the plan?")) return;
    setState({ busy: true });
    const r = await call("/api/plan", "DELETE", { id });
    if (r.ok) { cancel(); router.refresh(); } else setState({ busy: false, err: r.error });
  }

  const cats = Array.from(new Set([...categories, "Transfer", "Reimbursed"]));

  const editor = (
    <form className={`${s.form} ${s.planForm}`} onSubmit={save}>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor="pl-name">Name</label>
          <input id="pl-name" className={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rent (Dover Glen)" />
        </div>
        <div className={s.field}>
          <label htmlFor="pl-cat">Category</label>
          <select id="pl-cat" className={s.select} value={form.reimbursed ? "Reimbursed" : form.category} disabled={form.reimbursed} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {cats.map((c) => <option key={c} value={c}>{c === "Transfer" ? "Debt payment" : c}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="pl-mode">Amount</label>
          <select id="pl-mode" className={s.select} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Form["mode"] })}>
            <option value="fixed">Fixed each month</option>
            <option value="range">A range</option>
            <option value="pct">Percent of income</option>
            <option value="varies">Varies</option>
          </select>
        </div>
      </div>
      <div className={s.formRow}>
        {form.mode === "fixed" ? (
          <div className={s.field}><label htmlFor="pl-amt">Per month ($)</label><input id="pl-amt" className={`${s.input} num`} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        ) : null}
        {form.mode === "range" ? (
          <>
            <div className={s.field}><label htmlFor="pl-min">Low ($)</label><input id="pl-min" className={`${s.input} num`} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></div>
            <div className={s.field}><label htmlFor="pl-max">High ($)</label><input id="pl-max" className={`${s.input} num`} inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></div>
          </>
        ) : null}
        {form.mode === "pct" ? (
          <div className={s.field}><label htmlFor="pl-pct">% of income</label><input id="pl-pct" className={`${s.input} num`} inputMode="decimal" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} /></div>
        ) : null}
        <div className={s.field}>
          <label htmlFor="pl-pat">Merchant text to match</label>
          <input id="pl-pat" className={s.input} value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="PROGRESSIVE INS" />
        </div>
        <div className={s.field}>
          <label htmlFor="pl-due">Due day</label>
          <input id="pl-due" className={`${s.input} num`} inputMode="numeric" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} placeholder="9" />
        </div>
      </div>
      <label className={s.check}>
        <input type="checkbox" checked={form.reimbursed} onChange={(e) => setForm({ ...form, reimbursed: e.target.checked })} />
        I get reimbursed for this — never count it as spending
      </label>
      <div className={s.actions}>
        <button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : editing ? "Save" : "Add to plan"}</button>
        <button type="button" className={`${s.button} ${s.ghost}`} onClick={cancel}>Cancel</button>
        {editing ? <button type="button" className={s.link} onClick={() => remove(editing)}>Remove</button> : null}
      </div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
    </form>
  );

  const counted = items.filter((i) => !i.isReimbursed);
  const reimbursed = items.filter((i) => i.isReimbursed);

  return (
    <div className={s.list}>
      {counted.map((i) => (
        <div key={i.id} className={s.acct}>
          <button type="button" className={`${s.planRow} ${editing === i.id ? s.planRowActive : ""}`} onClick={() => (editing === i.id ? cancel() : startEdit(i))}>
            <span className={s.planName}>
              {i.name}
              <small>{i.isDebtPayment ? "Debt payment" : i.category}{i.merchantPattern ? ` · matches “${i.merchantPattern}”` : ""}</small>
            </span>
            <span className={`${s.planExp} num`}>{expectedLabel(i)}</span>
            <span className={`${s.planPaid} num`}>{i.paidCents ? moneyExact(i.paidCents) : "—"}</span>
            <StatusPill item={i} />
          </button>
          {editing === i.id ? editor : null}
        </div>
      ))}
      {reimbursed.length ? (
        <div className={s.acct}>
          <p className={s.sub} style={{ margin: "16px 0 4px" }}>Reimbursed · paid by you, paid back · counted as essential spending, left out of the plan total</p>
          {reimbursed.map((i) => (
            <div key={i.id}>
              <button type="button" className={`${s.planRow} ${s.planRowMuted} ${editing === i.id ? s.planRowActive : ""}`} onClick={() => (editing === i.id ? cancel() : startEdit(i))}>
                <span className={s.planName}>{i.name}<small>{i.merchantPattern ? `matches “${i.merchantPattern}”` : ""}</small></span>
                <span className={`${s.planExp} num`}>{expectedLabel(i)}</span>
                <span className={`${s.planPaid} num`}>{i.paidCents ? moneyExact(i.paidCents) : "—"}</span>
                <StatusPill item={i} />
              </button>
              {editing === i.id ? editor : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className={s.acct} style={{ paddingTop: 16 }}>
        {adding ? editor : <button type="button" className={`${s.button} ${s.ghost}`} onClick={startAdd}>Add an expense</button>}
      </div>
    </div>
  );
}
