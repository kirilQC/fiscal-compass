"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { call, toCents } from "./api";
import s from "./sections.module.css";

const CLASSES = [
  ["us_equity", "US equity"],
  ["intl_equity", "International equity"],
  ["bond", "Bonds"],
  ["cash", "Cash"],
  ["other", "Other"],
];

export function ImportPositions({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [state, setState] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!csv.trim()) return setState({ busy: false, err: "Choose the Positions CSV exported from Fidelity first." });
    setState({ busy: true });
    const r = await call<{ imported: number }>("/api/holdings/import", "POST", { accountId, csv });
    if (r.ok) {
      setState({ busy: false, msg: `Imported ${r.data.imported} position${r.data.imported === 1 ? "" : "s"}.` });
      setCsv("");
      router.refresh();
    } else setState({ busy: false, err: r.error });
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor="imp-account">Brokerage account</label>
          <select id="imp-account" className={s.select} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.institution} · {a.name}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="imp-file">Positions CSV</label>
          <input id="imp-file" type="file" accept=".csv,text/csv" className={s.file} onChange={onFile} />
        </div>
      </div>
      <div className={s.field}>
        <label htmlFor="imp-csv">Or paste the CSV</label>
        <textarea id="imp-csv" className={s.textarea} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,…" />
      </div>
      <div className={s.actions}>
        <button type="submit" className={s.button} disabled={state.busy || !accountId}>{state.busy ? "Importing…" : "Import positions"}</button>
        <p className={s.hint}>Fidelity → Accounts &amp; Trade → Positions → Download. Today&apos;s values replace any earlier import for the same day.</p>
      </div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
      {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
    </form>
  );
}

export function AddHolding({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [f, setF] = useState({ accountId: accounts[0]?.id ?? "", symbol: "", name: "", assetClass: "us_equity", value: "", targetPct: "" });
  const [state, setState] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valueCents = toCents(f.value);
    if (!f.symbol.trim()) return setState({ busy: false, err: "Symbol is required." });
    if (!Number.isFinite(valueCents) || valueCents < 0) return setState({ busy: false, err: "Enter the current value in dollars." });
    setState({ busy: true });
    const r = await call("/api/holdings", "POST", {
      accountId: f.accountId,
      symbol: f.symbol.trim(),
      name: f.name.trim() || undefined,
      assetClass: f.assetClass,
      valueCents,
      targetPct: f.targetPct === "" ? null : Number(f.targetPct),
    });
    if (r.ok) {
      setState({ busy: false, msg: `${f.symbol.toUpperCase()} saved.` });
      setF({ ...f, symbol: "", name: "", value: "", targetPct: "" });
      router.refresh();
    } else setState({ busy: false, err: r.error });
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor="h-account">Account</label>
          <select id="h-account" className={s.select} value={f.accountId} onChange={set("accountId")}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.institution} · {a.name}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="h-symbol">Symbol</label>
          <input id="h-symbol" className={s.input} value={f.symbol} onChange={set("symbol")} placeholder="FXAIX" />
        </div>
        <div className={s.field}>
          <label htmlFor="h-name">Name</label>
          <input id="h-name" className={s.input} value={f.name} onChange={set("name")} placeholder="Fidelity 500 Index" />
        </div>
      </div>
      <div className={s.formRow}>
        <div className={s.field}>
          <label htmlFor="h-class">Asset class</label>
          <select id="h-class" className={s.select} value={f.assetClass} onChange={set("assetClass")}>
            {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="h-value">Current value ($)</label>
          <input id="h-value" className={`${s.input} num`} inputMode="decimal" value={f.value} onChange={set("value")} placeholder="31,200" />
        </div>
        <div className={s.field}>
          <label htmlFor="h-target">Target %</label>
          <input id="h-target" className={`${s.input} num`} inputMode="decimal" value={f.targetPct} onChange={set("targetPct")} placeholder="45" />
        </div>
      </div>
      <div className={s.actions}>
        <button type="submit" className={s.button} disabled={state.busy || !f.accountId}>{state.busy ? "Saving…" : "Add holding"}</button>
      </div>
      {state.err ? <p className={s.err}>{state.err}</p> : null}
      {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
    </form>
  );
}
