"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { money } from "@/lib/format";
import { call, toCents } from "@/components/sections/api";
import { prettyName } from "@/components/sections/names";
import { LinkAccountButton } from "@/components/LinkAccountButton";
import { BrandLogo } from "@/components/BrandLogo";
import s from "./Settings.module.css";

const KIND_LABEL: Record<string, string> = { checking: "Checking", savings: "Savings", credit: "Credit card", loan: "Loan", investment: "Investment", other: "Other" };

function Mark({ a }: { a: Account }) {
  const inst = a.institution.toLowerCase();
  const kind = inst.includes("chase") ? "chase-mark" : inst.includes("fidelity") ? "fidelity" : null;
  return <span className={s.mark}>{kind ? <BrandLogo kind={kind} size={36} /> : <b>{a.institution.slice(0, 1)}</b>}</span>;
}

function AccountCard({ a, asOf }: { a: Account; asOf: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: prettyName(a.name),
    limit: a.creditLimitCents ? String(a.creditLimitCents / 100) : "",
    apr: a.loanApr !== null ? String(a.loanApr) : "",
    payment: a.loanPaymentCents ? String(a.loanPaymentCents / 100) : "",
    left: a.loanPaymentsLeft !== null ? String(a.loanPaymentsLeft) : "",
  });
  const [st, setSt] = useState<{ busy: boolean; err?: string; confirm?: boolean }>({ busy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return setSt({ busy: false, err: "Give the account a name." });
    setSt({ busy: true });
    const body: Record<string, unknown> = { id: a.id, name: f.name.trim() };
    if (a.kind === "credit") body.creditLimitCents = f.limit ? toCents(f.limit) : null;
    if (a.kind === "loan") {
      body.loanApr = f.apr ? Number(f.apr) : null;
      body.loanPaymentCents = f.payment ? toCents(f.payment) : null;
      body.loanPaymentsLeft = f.left ? Number(f.left) : null;
    }
    const r = await call("/api/accounts", "PATCH", body);
    if (r.ok) { setSt({ busy: false }); setOpen(false); router.refresh(); } else setSt({ busy: false, err: r.error });
  }
  async function hide() {
    setSt({ busy: true });
    const r = await call("/api/accounts", "PATCH", { id: a.id, isActive: false });
    if (r.ok) router.refresh(); else setSt({ busy: false, err: r.error });
  }

  const detail = [KIND_LABEL[a.kind], a.last4 ? `···${a.last4}` : null,
    a.kind === "credit" ? (a.creditLimitCents ? `${money(a.creditLimitCents)} limit · ${Math.round((Math.abs(a.balanceCents) / a.creditLimitCents) * 100)}% used` : "limit not set") : null,
    a.kind === "loan" ? [a.loanApr !== null ? `${a.loanApr}% APR` : null, a.loanPaymentCents ? `${money(a.loanPaymentCents)}/mo` : null].filter(Boolean).join(" · ") || null : null,
  ].filter(Boolean).join(" · ");
  const mtd = a.changeMtdCents;

  return (
    <div className={s.acct}>
      <div className={s.acctRow}>
        <Mark a={a} />
        <span className={s.acctName}><b>{a.institution} {prettyName(a.name)}</b><small>{detail}</small></span>
        <span className={s.sync}>syncing</span>
        <span className={s.bal}>{a.balanceCents < 0 ? "-" : ""}{money(Math.abs(a.balanceCents))}{mtd ? <small className={mtd > 0 ? s.up : s.down}>{mtd > 0 ? "+" : "-"}{money(Math.abs(mtd))} this month</small> : null}</span>
        <button type="button" className={s.link} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Edit"}</button>
      </div>
      {open ? (
        <div className={s.edit}>
          <div className={s.fields}>
            <div className={s.field}><label htmlFor={`an-${a.id}`}>Name</label><input id={`an-${a.id}`} className={s.input} value={f.name} onChange={set("name")} /></div>
            {a.kind === "credit" ? <div className={s.field}><label htmlFor={`al-${a.id}`}>Credit limit ($)</label><input id={`al-${a.id}`} className={s.input} inputMode="numeric" value={f.limit} onChange={set("limit")} placeholder="Banks don't share this" /></div> : null}
            {a.kind === "loan" ? (
              <>
                <div className={s.field}><label htmlFor={`aa-${a.id}`}>APR (%)</label><input id={`aa-${a.id}`} className={s.input} inputMode="decimal" value={f.apr} onChange={set("apr")} /></div>
                <div className={s.field}><label htmlFor={`ap-${a.id}`}>Monthly payment ($)</label><input id={`ap-${a.id}`} className={s.input} inputMode="decimal" value={f.payment} onChange={set("payment")} /></div>
                <div className={s.field}><label htmlFor={`ax-${a.id}`}>Payments left</label><input id={`ax-${a.id}`} className={s.input} inputMode="numeric" value={f.left} onChange={set("left")} /></div>
              </>
            ) : null}
          </div>
          <div className={s.btns}>
            <button type="button" className={s.btn} onClick={save} disabled={st.busy}>{st.busy ? "Saving…" : "Save"}</button>
            {st.confirm ? (
              <><span className={s.hint}>Hide it? History stays, but it stops counting toward net worth.</span><button type="button" className={s.btn2} onClick={hide} disabled={st.busy}>Hide account</button><button type="button" className={s.link} onClick={() => setSt({ busy: false })}>Keep it</button></>
            ) : <button type="button" className={s.btn2} onClick={() => setSt({ busy: false, confirm: true })}>Hide</button>}
            <span className={s.hint}>Balance as of {asOf}</span>
          </div>
          {st.err ? <p className={s.err}>{st.err}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Hidden({ hidden }: { hidden: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!hidden.length) return null;
  async function show(a: Account) {
    setBusy(a.id);
    const r = await call("/api/accounts", "PATCH", { id: a.id, isActive: true });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <div className={s.hidden}>
      <span>{hidden.length} hidden account{hidden.length === 1 ? "" : "s"} · not counted toward net worth · <button type="button" className={s.link} onClick={() => setOpen(!open)}>{open ? "hide list" : "show"}</button></span>
      {open ? hidden.map((a) => (
        <div key={a.id}>{a.institution} {prettyName(a.name)} ···{a.last4} · {money(a.balanceCents)} <button type="button" className={s.link} onClick={() => show(a)} disabled={busy === a.id}>{busy === a.id ? "…" : "Show again"}</button></div>
      )) : null}
    </div>
  );
}

function SyncActions({ accountCount }: { accountCount: number }) {
  const router = useRouter();
  const [st, setSt] = useState<{ busy: boolean; confirm?: boolean; msg?: string; err?: string }>({ busy: false });
  const est = (accountCount * 0.1).toFixed(2);
  async function run(force: boolean) {
    setSt({ busy: true });
    const r = await call<{ estUsd?: number; paid?: { balance: number; transactions: number } }>(`/api/sync${force ? "?force=1" : ""}`, "POST");
    if (!r.ok) return setSt({ busy: false, err: r.error });
    const p = r.data?.paid;
    setSt({ busy: false, msg: force && p ? `Pulled ${p.balance} balance${p.balance === 1 ? "" : "s"} and ${p.transactions} transaction feed${p.transactions === 1 ? "" : "s"} · $${(r.data?.estUsd ?? 0).toFixed(2)}` : "Refreshed from what Stripe already holds." });
    router.refresh();
  }
  return (
    <>
      <button type="button" className={s.btn2} onClick={() => setSt({ busy: false, confirm: true })} disabled={st.busy}>{st.busy ? "Pulling…" : "Pull from bank now"}</button>
      <button type="button" className={s.btn2} onClick={() => run(false)} disabled={st.busy}>Recompute (free)</button>
      {st.confirm ? <span className={s.hint}>Fresh balances for {accountCount} accounts, about ${est}. <button type="button" className={s.link} onClick={() => run(true)}>Pull · ${est}</button> <button type="button" className={s.link} onClick={() => setSt({ busy: false })}>Cancel</button></span> : null}
      {st.msg ? <span className={s.ok}>{st.msg}</span> : null}
      {st.err ? <span className={s.err}>{st.err}</span> : null}
    </>
  );
}

export function AccountsPanel({ accounts, hidden, asOf, monthUsd }: { accounts: Account[]; hidden: Account[]; asOf: string; monthUsd: number | null }) {
  return (
    <>
      <div className={s.head}><h2>Linked accounts</h2><p>Chase and Fidelity through Stripe Financial Connections · balances as of {asOf}</p></div>
      {accounts.map((a) => <AccountCard key={a.id} a={a} asOf={asOf} />)}
      <Hidden hidden={hidden} />
      <div className={s.btns}>
        <LinkAccountButton label="Link a bank" className={s.btn} />
        <SyncActions accountCount={accounts.filter((a) => a.kind !== "other").length} />
      </div>
      <p className={s.hint}>{monthUsd !== null ? `Stripe fees this month: $${monthUsd.toFixed(2)} · ` : ""}transactions refresh daily for a flat $0.30 per bank a month; balances refresh every morning at $0.10 each.</p>
    </>
  );
}
