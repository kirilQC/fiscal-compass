"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money, moneyExact } from "@/lib/format";
import { call, toCents, todayIso } from "./api";
import s from "./sections.module.css";

type Msg = { busy: boolean; err?: string; msg?: string };

export function SyncNow() {
  const router = useRouter();
  const [state, setState] = useState<Msg>({ busy: false });
  async function sync() {
    setState({ busy: true });
    const r = await call("/api/sync", "POST");
    if (r.ok) { setState({ busy: false, msg: "Synced." }); router.refresh(); } else setState({ busy: false, err: r.error });
  }
  return (
    <span style={{ display: "inline-grid", gap: 6 }}>
      <button type="button" className={`${s.button} ${s.ghost}`} onClick={sync} disabled={state.busy}>{state.busy ? "Syncing…" : "Sync now"}</button>
      {state.err ? <span className={s.err}>{state.err}</span> : null}
      {state.msg ? <span className={s.ok}>{state.msg}</span> : null}
    </span>
  );
}

const KINDS = [["checking", "Checking"], ["savings", "Savings"], ["credit", "Credit card"], ["loan", "Loan"], ["investment", "Investment"], ["other", "Other"]];

export function AddManualAccount() {
  const router = useRouter();
  const [f, setF] = useState({ institution: "", name: "", kind: "loan", last4: "", balance: "", limit: "", apr: "", payment: "", left: "" });
  const [state, setState] = useState<Msg>({ busy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const isLiability = f.kind === "loan" || f.kind === "credit";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.institution.trim() || !f.name.trim()) return setState({ busy: false, err: "Institution and account name are required." });
    const bal = toCents(f.balance || "0");
    if (!Number.isFinite(bal)) return setState({ busy: false, err: "Enter the current balance in dollars." });
    setState({ busy: true });
    const r = await call("/api/accounts", "POST", {
      institution: f.institution.trim(),
      name: f.name.trim(),
      kind: f.kind,
      last4: f.last4.trim() || undefined,
      balanceCents: isLiability ? -Math.abs(bal) : bal,
      creditLimitCents: f.kind === "credit" && f.limit ? toCents(f.limit) : null,
      loanApr: f.kind === "loan" && f.apr ? Number(f.apr) : null,
      loanPaymentCents: f.kind === "loan" && f.payment ? toCents(f.payment) : null,
      loanPaymentsLeft: f.kind === "loan" && f.left ? Number(f.left) : null,
    });
    if (r.ok) { setState({ busy: false, msg: `${f.name} added.` }); setF({ ...f, name: "", last4: "", balance: "", limit: "", apr: "", payment: "", left: "" }); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <div className={s.formRow}>
        <div className={s.field}><label htmlFor="a-inst">Institution</label><input id="a-inst" className={s.input} value={f.institution} onChange={set("institution")} placeholder="Chase Auto" /></div>
        <div className={s.field}><label htmlFor="a-name">Account name</label><input id="a-name" className={s.input} value={f.name} onChange={set("name")} placeholder="Car loan" /></div>
        <div className={s.field}>
          <label htmlFor="a-kind">Type</label>
          <select id="a-kind" className={s.select} value={f.kind} onChange={set("kind")}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <div className={s.formRow}>
        <div className={s.field}><label htmlFor="a-bal">{isLiability ? "Amount owed ($)" : "Balance ($)"}</label><input id="a-bal" className={`${s.input} num`} inputMode="decimal" value={f.balance} onChange={set("balance")} placeholder="14,650" /></div>
        <div className={s.field}><label htmlFor="a-last4">Last 4</label><input id="a-last4" className={`${s.input} num`} maxLength={4} value={f.last4} onChange={set("last4")} placeholder="7730" /></div>
        {f.kind === "credit" ? <div className={s.field}><label htmlFor="a-limit">Credit limit ($)</label><input id="a-limit" className={`${s.input} num`} inputMode="decimal" value={f.limit} onChange={set("limit")} placeholder="12,000" /></div> : null}
      </div>
      {f.kind === "loan" ? (
        <div className={s.formRow}>
          <div className={s.field}><label htmlFor="a-apr">APR %</label><input id="a-apr" className={`${s.input} num`} inputMode="decimal" value={f.apr} onChange={set("apr")} placeholder="4.9" /></div>
          <div className={s.field}><label htmlFor="a-pay">Monthly payment ($)</label><input id="a-pay" className={`${s.input} num`} inputMode="decimal" value={f.payment} onChange={set("payment")} placeholder="412" /></div>
          <div className={s.field}><label htmlFor="a-left">Payments left</label><input id="a-left" className={`${s.input} num`} inputMode="numeric" value={f.left} onChange={set("left")} placeholder="38" /></div>
        </div>
      ) : null}
      <div className={s.actions}><button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : "Add account"}</button></div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
      {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
    </form>
  );
}

type Paycheck = { id: string; pay_date: string; employer: string | null; gross_cents: number; net_cents: number; taxes_cents: number | null; retirement_cents: number | null };

export function Paychecks() {
  const router = useRouter();
  const [list, setList] = useState<Paycheck[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [f, setF] = useState({ payDate: todayIso(), employer: "", gross: "", net: "", taxes: "", retirement: "" });
  const [state, setState] = useState<Msg>({ busy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function load() {
    const r = await call<Paycheck[]>("/api/paychecks", "GET");
    if (r.ok) setList(r.data); else { setList([]); setLoadErr(r.error); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const gross = toCents(f.gross), net = toCents(f.net);
    if (!Number.isFinite(gross) || !Number.isFinite(net) || net <= 0) return setState({ busy: false, err: "Gross and net pay are required, in dollars." });
    setState({ busy: true });
    const r = await call("/api/paychecks", "POST", {
      payDate: f.payDate,
      employer: f.employer.trim() || undefined,
      grossCents: gross,
      netCents: net,
      taxesCents: f.taxes ? toCents(f.taxes) : null,
      retirementCents: f.retirement ? toCents(f.retirement) : null,
    });
    if (r.ok) { setState({ busy: false, msg: "Paycheck saved." }); setF({ ...f, gross: "", net: "", taxes: "", retirement: "" }); load(); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  async function remove(id: string) {
    const r = await call("/api/paychecks", "DELETE", { id });
    if (r.ok) { load(); router.refresh(); } else setState({ busy: false, err: r.error });
  }

  return (
    <div className={s.stack}>
      <div className={s.list}>
        {list === null ? <p className={s.hint}>Loading…</p> : null}
        {list?.length === 0 ? <p className={s.hint}>{loadErr ?? "No paychecks yet. Enter each stub and the savings rate becomes real."}</p> : null}
        {list?.slice(0, 8).map((p) => (
          <div className={s.row} key={p.id}>
            <span className={s.n}>{p.pay_date}<small>{p.employer ?? "Payroll"} · gross {money(p.gross_cents)}{p.retirement_cents ? ` · 401k ${money(p.retirement_cents)}` : ""}</small></span>
            <span className={`${s.v} num`}>{moneyExact(p.net_cents)}<small>net</small></span>
            <button type="button" className={s.link} onClick={() => remove(p.id)}>Remove</button>
          </div>
        ))}
      </div>
      <form className={s.form} onSubmit={submit}>
        <div className={s.formRow}>
          <div className={s.field}><label htmlFor="p-date">Pay date</label><input id="p-date" type="date" className={`${s.input} num`} value={f.payDate} onChange={set("payDate")} /></div>
          <div className={s.field}><label htmlFor="p-emp">Employer</label><input id="p-emp" className={s.input} value={f.employer} onChange={set("employer")} placeholder="QC Growth" /></div>
        </div>
        <div className={s.formRow}>
          <div className={s.field}><label htmlFor="p-gross">Gross ($)</label><input id="p-gross" className={`${s.input} num`} inputMode="decimal" value={f.gross} onChange={set("gross")} /></div>
          <div className={s.field}><label htmlFor="p-net">Net ($)</label><input id="p-net" className={`${s.input} num`} inputMode="decimal" value={f.net} onChange={set("net")} /></div>
          <div className={s.field}><label htmlFor="p-tax">Taxes ($)</label><input id="p-tax" className={`${s.input} num`} inputMode="decimal" value={f.taxes} onChange={set("taxes")} /></div>
          <div className={s.field}><label htmlFor="p-ret">Retirement ($)</label><input id="p-ret" className={`${s.input} num`} inputMode="decimal" value={f.retirement} onChange={set("retirement")} /></div>
        </div>
        <div className={s.actions}><button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : "Add paycheck"}</button></div>
        {state.err ? <p className={s.err}>{state.err}</p> : null}
        {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
      </form>
    </div>
  );
}

export function BriefPreview() {
  const [state, setState] = useState<{ busy: boolean; brief?: string; err?: string }>({ busy: false });
  async function preview() {
    setState({ busy: true });
    const r = await call<{ brief: string }>("/api/brief-ai", "GET");
    if (r.ok) setState({ busy: false, brief: r.data.brief }); else setState({ busy: false, err: r.error });
  }
  return (
    <div>
      <button type="button" className={`${s.button} ${s.ghost}`} onClick={preview} disabled={state.busy}>{state.busy ? "Writing…" : "Preview today's brief"}</button>
      {state.brief ? <p className={s.brief}>{state.brief}</p> : null}
      {state.err ? <p className={s.err} style={{ marginTop: 10 }}>{state.err}</p> : null}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function out() {
    setBusy(true);
    try { await createClient().auth.signOut(); } catch { /* no session in sample mode */ }
    router.push("/login");
  }
  return <button type="button" className={`${s.button} ${s.ghost}`} onClick={out} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>;
}
