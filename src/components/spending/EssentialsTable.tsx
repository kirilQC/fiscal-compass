"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanItem } from "@/lib/types";
import { money, moneyExact, dateLabel, prettyMerchant } from "@/lib/format";
import { call } from "@/components/sections/api";
import { SPEND_CATEGORIES } from "@/lib/spend";
import type { Txn } from "./TransactionLists";
import s from "./SpendingPage.module.css";
import { MerchantCell } from "@/components/MerchantLogo";

const CATEGORIES = SPEND_CATEGORIES.filter((c) => c !== "Reimbursed");

function estimateLabel(i: PlanItem) {
  if (i.amountMinCents != null && i.amountMaxCents != null && i.amountCents == null) return `${money(i.amountMinCents)}–${money(i.amountMaxCents)}`;
  if (i.pctOfIncome != null) return `${money(i.expectedCents)} · ${i.pctOfIncome}%`;
  if (i.amountCents == null) return "varies";
  return money(i.expectedCents);
}

function statusLabel(i: PlanItem, isCurrent: boolean) {
  if (i.status === "paid") return { text: `Paid${i.paidOn ? ` ${dateLabel(i.paidOn)}` : ""}`, cls: s.paid };
  if (i.status === "overdue") return { text: isCurrent ? `Overdue${i.dueDay ? ` · day ${i.dueDay}` : ""}` : "Not seen", cls: s.over };
  if (i.status === "due") return { text: isCurrent ? (i.dueDay ? `Due day ${i.dueDay}` : "Due") : "Not seen", cls: "" };
  return { text: i.paidCents > 0 ? "Varies" : "Varies · nothing yet", cls: "" };
}

const dollars = (cents: number | null) => (cents != null ? (cents / 100).toFixed(2) : "");
const toCents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/[$,\s]/g, "")) * 100));

interface Draft {
  name: string;
  category: string;
  estimate: string;
  pct: string;
  dueDay: string;
}

const draftOf = (i?: PlanItem): Draft => ({
  name: i?.name ?? "",
  category: i?.category ?? "Utilities",
  estimate: i?.pctOfIncome != null ? "" : dollars(i?.amountCents ?? null),
  pct: i?.pctOfIncome != null ? String(i.pctOfIncome) : "",
  dueDay: i?.dueDay != null ? String(i.dueDay) : "",
});

function bodyOf(d: Draft) {
  const amountCents = toCents(d.estimate);
  const pct = d.pct.trim() === "" ? null : Number(d.pct);
  const dueDay = d.dueDay.trim() === "" ? null : Number(d.dueDay);
  if (!d.name.trim()) return { error: "Give it a name." };
  if (amountCents !== null && (!Number.isFinite(amountCents) || amountCents < 0)) return { error: "Estimate must be a dollar amount." };
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return { error: "Percent must be 0–100." };
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return { error: "Due day must be 1–31." };
  return { body: { name: d.name.trim(), category: d.category, amountCents: pct !== null ? null : amountCents, pctOfIncome: pct, dueDay } };
}

function Fields({ draft, set }: { draft: Draft; set: (d: Draft) => void }) {
  return (
    <div className={s.planForm}>
      <label>Name<input value={draft.name} onChange={(e) => set({ ...draft, name: e.target.value })} placeholder="Car insurance" /></label>
      <label>Category
        <select value={draft.category} onChange={(e) => set({ ...draft, category: e.target.value })}>
          {Array.from(new Set([...CATEGORIES, draft.category])).map((c) => <option key={c} value={c}>{c === "Transfer" ? "Debt payment" : c}</option>)}
        </select>
      </label>
      <label>Per month $<input className="num" value={draft.estimate} onChange={(e) => set({ ...draft, estimate: e.target.value, pct: "" })} placeholder="varies" inputMode="decimal" /></label>
      <label>or % of income<input className="num" value={draft.pct} onChange={(e) => set({ ...draft, pct: e.target.value, estimate: "" })} placeholder="—" inputMode="decimal" /></label>
      <label>Due day<input className="num" value={draft.dueDay} onChange={(e) => set({ ...draft, dueDay: e.target.value })} placeholder="—" inputMode="numeric" /></label>
    </div>
  );
}

function Detail({ item, txns, onChanged, onClose }: { item: PlanItem; txns: Txn[]; onChanged: () => void; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(draftOf(item));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matched = txns.filter((t) => item.matchedTxnIds.includes(t.id));
  const catchable = txns.filter((t) => t.spendClass !== null && !item.matchedTxnIds.includes(t.id)).sort((a, z) => z.postedOn.localeCompare(a.postedOn));
  const rawPatterns = (item.merchantPattern ?? "").split("|").map((p) => p.trim()).filter(Boolean);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, close = false) {
    setBusy(true);
    setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Something went wrong.");
    onChanged();
    router.refresh();
    if (close) onClose();
  }

  const save = () => {
    const b = bodyOf(draft);
    if ("error" in b) return setErr(b.error ?? null);
    return run(() => call("/api/plan", "PATCH", { id: item.id, ...b.body }), true);
  };
  const remove = () => {
    if (!window.confirm(`Remove “${item.name}” from your essential expenses?`)) return;
    return run(() => call("/api/plan", "DELETE", { id: item.id }), true);
  };
  const dropPattern = (p: string) => run(() => call("/api/plan", "PATCH", { id: item.id, merchantPattern: rawPatterns.filter((x) => x !== p).join("|") || null }));
  const catchTxn = (id: string) => {
    const t = txns.find((x) => x.id === id);
    if (t) return run(() => call("/api/plan/learn", "POST", { planItemId: item.id, merchant: t.merchant }));
  };

  return (
    <div className={s.planDetail}>
      <Fields draft={draft} set={setDraft} />
      <div className={s.planCatch}>
        <div className={s.eyebrow}>Catches charges from</div>
        {rawPatterns.length ? (
          <div className={s.chips}>
            {rawPatterns.map((p) => (
              <span key={p} className={s.chip}>{p}<button type="button" aria-label={`Stop catching ${p}`} disabled={busy} onClick={() => dropPattern(p)}>×</button></span>
            ))}
          </div>
        ) : (
          <p className={s.hint} style={{ margin: "4px 0" }}>{item.category === "Transport" ? "any gas station" : `any ${item.category} charge`} (no merchant set)</p>
        )}
        <select className={s.inlineSel} value="" disabled={busy} onChange={(e) => catchTxn(e.target.value)} aria-label="Catch a charge">
          <option value="">+ This month, it was paid by…</option>
          {catchable.map((t) => <option key={t.id} value={t.id}>{dateLabel(t.postedOn)} · {prettyMerchant(t.merchant)} · {moneyExact(-t.amountCents)}</option>)}
        </select>
      </div>
      {matched.length ? (
        <ul className={s.planMatched}>
          {matched.map((t) => <li key={t.id}><MerchantCell src={t.logoUrl} name={`${dateLabel(t.postedOn)} · ${prettyMerchant(t.merchant)}`} category={t.category} size={20} /><span className="num">{moneyExact(-t.amountCents)}</span></li>)}
        </ul>
      ) : null}
      <div className={s.planActions}>
        <button type="button" className={s.spendTag} disabled={busy} onClick={save}>Save</button>
        <button type="button" className={`${s.spendTag} ${s.untagged}`} disabled={busy} onClick={onClose}>Close</button>
        <button type="button" className={s.planRemove} disabled={busy} onClick={remove}>Remove expense</button>
      </div>
      {err ? <p className={s.err}>{err}</p> : null}
    </div>
  );
}

function AddExpense({ onChanged }: { onChanged: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(draftOf());
  const [merchant, setMerchant] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" className={s.more} onClick={() => setOpen(true)}>+ Add an essential expense</button>;
  async function add() {
    const b = bodyOf(draft);
    if ("error" in b) return setErr(b.error ?? null);
    const r = await call("/api/plan", "POST", { ...b.body, merchantPattern: merchant.trim() || null, sort: 999 });
    if (!r.ok) return setErr(r.error);
    setOpen(false);
    setDraft(draftOf());
    setMerchant("");
    setErr(null);
    onChanged();
    router.refresh();
  }
  return (
    <div className={s.planDetail}>
      <div className={s.eyebrow} style={{ marginBottom: 8 }}>New essential expense</div>
      <Fields draft={draft} set={setDraft} />
      <div className={s.planForm}>
        <label style={{ flex: "1 1 260px" }}>Merchant name on the charge (optional)<input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. PROGRESSIVE — or link a charge after adding" /></label>
      </div>
      <div className={s.planActions}>
        <button type="button" className={s.spendTag} onClick={add}>Add</button>
        <button type="button" className={`${s.spendTag} ${s.untagged}`} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {err ? <p className={s.err}>{err}</p> : null}
    </div>
  );
}

export function EssentialsTable({ items, isCurrent, txns, onChanged }: { items: PlanItem[]; isCurrent: boolean; txns: Txn[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = items.filter((i) => !i.isReimbursed);
  const estTotal = rows.reduce((t, i) => t + i.expectedCents, 0);
  const actTotal = rows.reduce((t, i) => t + i.paidCents, 0);
  return (
    <>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Expense</th>
            <th className={s.r}>Estimated</th>
            <th className={s.r}>Actual</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const st = statusLabel(i, isCurrent);
            const isOpen = open === i.id;
            return (
              <Fragment key={i.id}>
                <tr className={s.planRow} onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                  <td>{i.name}<span className={s.muted}>{i.category === "Transfer" ? "Debt payment" : i.category}</span></td>
                  <td className={`${s.r} num`}>{estimateLabel(i)}</td>
                  <td className={`${s.r} num`}>{i.paidCents ? money(i.paidCents) : "—"}</td>
                  <td className={`${s.st} ${st.cls}`}>{st.text}</td>
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={4} className={s.planDetailCell}>
                      <Detail item={i} txns={txns} onChanged={onChanged} onClose={() => setOpen(null)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className={`${s.r} num`}><b>{money(estTotal)}</b></td>
            <td className={`${s.r} num`}><b>{money(actTotal)}</b></td>
            <td className={s.st}>{rows.filter((i) => i.status === "paid").length} of {rows.filter((i) => i.status !== "varies").length} paid</td>
          </tr>
        </tfoot>
      </table>
      <AddExpense onChanged={onChanged} />
    </>
  );
}
