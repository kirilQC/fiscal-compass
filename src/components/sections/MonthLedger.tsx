"use client";

import { Fragment, useEffect, useState } from "react";
import { moneyExact, money } from "@/lib/format";
import { CategorySelect } from "./CategorySelect";
import { prettyName } from "./names";
import s from "./sections.module.css";

interface Txn {
  id: string;
  postedOn: string;
  merchant: string;
  amountCents: number;
  category: string;
  accountName: string;
  isTransfer: boolean;
  isIncome: boolean;
  status: string;
  anomalyNote: string | null;
}

const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const monthTitle = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shift = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export function MonthLedger({ initialMonth, categories }: { initialMonth: string; categories: string[] }) {
  const [month, setMonth] = useState(initialMonth);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setTxns(null);
    setErr(null);
    fetch(`/api/transactions?month=${month}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`);
        return (Array.isArray(j) ? j : j?.transactions ?? []) as Txn[];
      })
      .then((t) => { if (live) setTxns(t); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [month]);

  const spent = (txns ?? []).filter((t) => !t.isTransfer && !t.isIncome && t.amountCents < 0).reduce((sum, t) => sum - t.amountCents, 0);
  const income = (txns ?? []).filter((t) => t.isIncome && !t.isTransfer).reduce((sum, t) => sum + t.amountCents, 0);
  const transfers = (txns ?? []).filter((t) => t.isTransfer).length;
  const byDay = new Map<string, Txn[]>();
  for (const t of txns ?? []) byDay.set(t.postedOn, [...(byDay.get(t.postedOn) ?? []), t]);
  const isCurrent = month >= initialMonth;

  return (
    <div>
      <div className={s.monthNav}>
        <button type="button" className={s.link} onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">← {monthTitle(shift(month, -1)).split(" ")[0]}</button>
        <span className={s.monthTitle}>{monthTitle(month)}</span>
        <button type="button" className={s.link} onClick={() => setMonth(shift(month, 1))} disabled={isCurrent} aria-label="Next month" style={isCurrent ? { visibility: "hidden" } : undefined}>{monthTitle(shift(month, 1)).split(" ")[0]} →</button>
      </div>
      <div className={s.totals}>
        <span><b className="num">{money(spent)}</b> spent</span>
        <span><b className="num">{money(income)}</b> income</span>
        <span><b className="num">{transfers}</b> transfer{transfers === 1 ? "" : "s"} excluded</span>
        <span className={s.dim}>{txns ? `${txns.length} transactions` : ""}</span>
      </div>
      {err ? <p className={s.err}>{err}</p> : null}
      {txns === null && !err ? <p className={s.hint}>Loading…</p> : null}
      {txns && txns.length === 0 ? <p className={s.hint}>Nothing posted in {monthTitle(month)}.</p> : null}
      {txns && txns.length ? (
        <table className={s.table}>
          <thead>
            <tr>
              <th>Merchant</th>
              <th className={s.hideNarrow}>Account</th>
              <th>Category</th>
              <th className={s.r}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byDay.entries()).map(([day, list]) => (
              <Fragment key={day}>
                <tr className={s.dayHead}><td colSpan={4}>{longDay(day)}</td></tr>
                {list.map((t) => (
                  <tr key={t.id} className={t.isTransfer ? s.transfer : undefined}>
                    <td>
                      {t.merchant}
                      {t.status === "pending" ? <span className={s.dim}> · pending</span> : null}
                      {t.anomalyNote ? <span className={s.flag}>Unusual · {t.anomalyNote}</span> : null}
                    </td>
                    <td className={`${s.hideNarrow} ${s.dim}`}>{prettyName(t.accountName)}</td>
                    <td>
                      {t.isIncome ? <span className={s.dim}>Income</span> : <CategorySelect id={t.id} value={t.isTransfer ? "Transfer" : t.category} options={categories} />}
                    </td>
                    <td className={`${s.r} ${s.amt} num ${t.isIncome ? "good" : ""}`}>{t.amountCents < 0 ? "−" : "+"}{moneyExact(Math.abs(t.amountCents))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
