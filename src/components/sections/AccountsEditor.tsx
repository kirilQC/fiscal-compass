"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { money } from "@/lib/format";
import { call, toCents } from "./api";
import { prettyName } from "./names";
import s from "./sections.module.css";

const KIND_LABEL: Record<string, string> = { checking: "Checking", savings: "Savings", credit: "Credit card", loan: "Loan", investment: "Investment", other: "Other" };
const KINDS = Object.entries(KIND_LABEL);

export function AccountsEditor({ accounts, asOf }: { accounts: Account[]; asOf: string }) {
  return (
    <div className={s.list}>
      {accounts.map((a) => <AccountRow key={a.id} a={a} asOf={asOf} />)}
    </div>
  );
}

function AccountRow({ a, asOf }: { a: Account; asOf: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: prettyName(a.name),
    kind: a.kind,
    limit: a.creditLimitCents ? String(a.creditLimitCents / 100) : "",
    apr: a.loanApr !== null ? String(a.loanApr) : "",
    payment: a.loanPaymentCents ? String(a.loanPaymentCents / 100) : "",
    left: a.loanPaymentsLeft !== null ? String(a.loanPaymentsLeft) : "",
    balance: a.balanceCents ? String(Math.abs(a.balanceCents) / 100) : "",
  });
  const [state, setState] = useState<{ busy: boolean; err?: string; msg?: string }>({ busy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const isLiability = f.kind === "credit" || f.kind === "loan";
  const balanceKnown = a.balanceCents !== 0;

  async function save() {
    if (!f.name.trim()) return setState({ busy: false, err: "Give the account a name." });
    setState({ busy: true });
    const body: Record<string, unknown> = { id: a.id, name: f.name.trim(), kind: f.kind };
    if (f.kind === "credit") body.creditLimitCents = f.limit ? toCents(f.limit) : null;
    if (f.kind === "loan") {
      body.loanApr = f.apr ? Number(f.apr) : null;
      body.loanPaymentCents = f.payment ? toCents(f.payment) : null;
      body.loanPaymentsLeft = f.left ? Number(f.left) : null;
    }
    if (f.balance !== "" && toCents(f.balance) !== Math.abs(a.balanceCents)) {
      const cents = toCents(f.balance);
      if (!Number.isFinite(cents)) return setState({ busy: false, err: "Balance must be a dollar amount." });
      body.balanceCents = isLiability ? -Math.abs(cents) : cents;
    }
    const r = await call("/api/accounts", "PATCH", body);
    if (r.ok) { setState({ busy: false, msg: "Saved." }); setOpen(false); router.refresh(); }
    else setState({ busy: false, err: r.error });
  }

  async function remove() {
    if (!confirm(`Remove ${f.name} from Fiscal Compass? Its history stays in the database but it stops counting toward net worth.`)) return;
    setState({ busy: true });
    const r = await call("/api/accounts", "PATCH", { id: a.id, isActive: false });
    if (r.ok) router.refresh();
    else setState({ busy: false, err: r.error });
  }

  const detail = [
    KIND_LABEL[a.kind],
    a.last4 ? `···${a.last4}` : null,
    a.kind === "credit" ? (a.creditLimitCents ? `${money(a.creditLimitCents)} limit` : "limit not set") : null,
    a.kind === "loan" ? (a.loanApr !== null ? `${a.loanApr}%` : "rate not set") : null,
    a.kind === "loan" && a.loanPaymentCents ? `${money(a.loanPaymentCents)}/mo` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={s.acct}>
      <div className={s.row}>
        <span className={s.n}>
          {a.institution} {prettyName(a.name)}
          <small>{detail}</small>
        </span>
        <button type="button" className={s.link} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Edit"}</button>
        <span className={`${s.v} num ${a.balanceCents < 0 ? "muted" : ""}`}>
          {balanceKnown ? <>{a.balanceCents < 0 ? "−" : ""}{money(Math.abs(a.balanceCents))}</> : <span className="warn">balance unknown</span>}
          {balanceKnown && a.changeMtdCents !== null && a.changeMtdCents !== 0 ? (
            <small className={a.changeMtdCents >= 0 ? "good" : "crit"}>{a.changeMtdCents >= 0 ? "+" : "−"}{money(Math.abs(a.changeMtdCents))} this month</small>
          ) : null}
        </span>
      </div>
      {open ? (
        <div className={s.acctForm}>
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor={`n-${a.id}`}>Name</label>
              <input id={`n-${a.id}`} className={s.input} value={f.name} onChange={set("name")} />
            </div>
            <div className={s.field}>
              <label htmlFor={`k-${a.id}`}>Type</label>
              <select id={`k-${a.id}`} className={s.select} value={f.kind} onChange={set("kind")}>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor={`b-${a.id}`}>{isLiability ? "Owed today ($)" : "Balance today ($)"}</label>
              <input id={`b-${a.id}`} className={`${s.input} num`} inputMode="decimal" value={f.balance} onChange={set("balance")} placeholder={balanceKnown ? "" : "Stripe couldn't read this"} />
            </div>
          </div>
          {f.kind === "credit" ? (
            <div className={s.formRow}>
              <div className={s.field}>
                <label htmlFor={`l-${a.id}`}>Credit limit ($)</label>
                <input id={`l-${a.id}`} className={`${s.input} num`} inputMode="numeric" value={f.limit} onChange={set("limit")} placeholder="Banks don't share this over Stripe" />
              </div>
            </div>
          ) : null}
          {f.kind === "loan" ? (
            <div className={s.formRow}>
              <div className={s.field}>
                <label htmlFor={`a-${a.id}`}>APR (%)</label>
                <input id={`a-${a.id}`} className={`${s.input} num`} inputMode="decimal" value={f.apr} onChange={set("apr")} />
              </div>
              <div className={s.field}>
                <label htmlFor={`p-${a.id}`}>Monthly payment ($)</label>
                <input id={`p-${a.id}`} className={`${s.input} num`} inputMode="decimal" value={f.payment} onChange={set("payment")} />
              </div>
              <div className={s.field}>
                <label htmlFor={`pl-${a.id}`}>Payments left</label>
                <input id={`pl-${a.id}`} className={`${s.input} num`} inputMode="numeric" value={f.left} onChange={set("left")} />
              </div>
            </div>
          ) : null}
          <div className={s.actions}>
            <button type="button" className={s.button} onClick={save} disabled={state.busy}>{state.busy ? "Saving…" : "Save"}</button>
            <button type="button" className={`${s.button} ${s.ghost}`} onClick={remove} disabled={state.busy}>Remove</button>
            <span className={s.hint}>Balance is recorded as of {asOf}.</span>
          </div>
          {state.err ? <p className={s.err}>{state.err}</p> : null}
        </div>
      ) : state.msg ? <p className={s.ok} style={{ margin: "6px 0 0" }}>{state.msg}</p> : null}
    </div>
  );
}
