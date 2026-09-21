"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";
import s from "./sections.module.css";

type Rule = { id: string; merchant_pattern: string; category: string; is_transfer: boolean; is_income: boolean };

export function RulesPanel({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [f, setF] = useState({ pattern: "", category: categories[0] ?? "Other", kind: "spend" });
  const [state, setState] = useState<{ busy: boolean; err?: string; msg?: string }>({ busy: false });

  async function load() {
    const r = await call<Rule[]>("/api/rules", "GET");
    if (r.ok) setRules(r.data);
    else { setRules([]); setLoadErr(r.error); }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.pattern.trim()) return setState({ busy: false, err: "Enter part of the merchant name." });
    setState({ busy: true });
    const r = await call<{ updated: number }>("/api/rules", "POST", {
      merchantPattern: f.pattern.trim(),
      category: f.kind === "income" ? "Income" : f.kind === "transfer" ? "Transfer" : f.category,
      isIncome: f.kind === "income",
      isTransfer: f.kind === "transfer",
      applyToExisting: true,
    });
    if (r.ok) {
      setState({ busy: false, msg: `Rule saved · ${r.data.updated} past transaction${r.data.updated === 1 ? "" : "s"} recategorized.` });
      setF({ ...f, pattern: "" });
      load();
      router.refresh();
    } else setState({ busy: false, err: r.error });
  }

  async function remove(id: string) {
    const r = await call("/api/rules", "DELETE", { id });
    if (r.ok) { load(); router.refresh(); } else setState({ busy: false, err: r.error });
  }

  return (
    <div>
      <div className={s.list} style={{ marginBottom: 28 }}>
        {rules === null ? <p className={s.hint}>Loading rules…</p> : null}
        {rules?.length === 0 ? <p className={s.hint}>{loadErr ?? "No rules yet. Each rule matches merchants by name and sets their category on every sync."}</p> : null}
        {rules?.map((r) => (
          <div className={s.row} key={r.id}>
            <span className={s.n}>
              &ldquo;{r.merchant_pattern}&rdquo;
              <small>{r.is_income ? "counts as income" : r.is_transfer ? "treated as a transfer" : `→ ${r.category}`}</small>
            </span>
            <span />
            <button type="button" className={s.link} onClick={() => remove(r.id)}>Remove</button>
          </div>
        ))}
      </div>
      <form className={s.form} onSubmit={add}>
        <div className={s.formRow}>
          <div className={s.field}>
            <label htmlFor="r-pattern">Merchant contains</label>
            <input id="r-pattern" className={s.input} value={f.pattern} onChange={(e) => setF({ ...f, pattern: e.target.value })} placeholder="TRADER JOE" />
          </div>
          <div className={s.field}>
            <label htmlFor="r-kind">Treat as</label>
            <select id="r-kind" className={s.select} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="spend">Spending</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer (ignored)</option>
            </select>
          </div>
          {f.kind === "spend" ? (
            <div className={s.field}>
              <label htmlFor="r-cat">Category</label>
              <select id="r-cat" className={s.select} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ) : null}
        </div>
        <div className={s.actions}>
          <button type="submit" className={s.button} disabled={state.busy}>{state.busy ? "Saving…" : "Add rule"}</button>
        </div>
        {state.err ? <p className={s.err}>{state.err}</p> : null}
        {state.msg ? <p className={s.ok}>{state.msg}</p> : null}
      </form>
    </div>
  );
}
