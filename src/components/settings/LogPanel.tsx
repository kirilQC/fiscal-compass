"use client";

import { useState } from "react";
import s from "./Settings.module.css";

export type LogEntry = { at: string; account: string; feature: string; status: string; usd: number; note?: string; trigger: string };

const WHAT: Record<string, [string, string]> = {
  balance: ["Balance", "morning refresh"],
  transactions: ["Transactions", "paid refresh"],
  "auto-transactions": ["Transactions", "Stripe daily refresh"],
  list: ["Read stored transactions", "free"],
};
const PAGE = 10;

function when(iso: string) {
  const t = new Date(iso);
  return `${t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })} · ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}`;
}

// Every Stripe pull, ten at a time, newest first.
export function LogPanel({ entries, monthUsd }: { entries: LogEntry[]; monthUsd: number | null }) {
  const [page, setPage] = useState(0);
  const [free, setFree] = useState(false);
  const rows = entries.filter((e) => free || e.feature !== "list");
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <>
      <div className={s.head}><h2>Stripe log</h2><p>every balance and transaction pull from Chase and Fidelity, in Central time{monthUsd !== null ? ` · $${monthUsd.toFixed(2)} in fees this month` : ""}</p></div>
      {rows.length === 0 ? <p className={s.hint}>No Stripe pulls recorded yet. The log fills from the next sync.</p> : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>When</th><th>Account</th><th>What</th><th>Status</th><th>Trigger</th><th className={s.r}>Fee</th></tr></thead>
              <tbody>
                {shown.map((e, i) => {
                  const [w, sub] = WHAT[e.feature] ?? [e.feature, ""];
                  return (
                    <tr key={`${e.at}-${e.account}-${i}`}>
                      <td className="num">{when(e.at)}</td>
                      <td>{e.account}</td>
                      <td>{w}<small>{e.note ?? sub}</small></td>
                      <td className={e.status === "failed" ? s.bad : e.status === "succeeded" || e.status === "ok" ? s.good : undefined}>{e.status}</td>
                      <td>{e.trigger}</td>
                      <td className={`num ${s.r}`}>{e.usd ? `$${e.usd.toFixed(2)}` : "free"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={s.pager}>
            <span>Showing {page * PAGE + 1} to {Math.min(rows.length, page * PAGE + PAGE)} of {rows.length}</span>
            <div>
              <label className={s.toggle}><input type="checkbox" checked={free} onChange={(e) => { setFree(e.target.checked); setPage(0); }} /> include free reads</label>
              <button type="button" className={s.btn2} onClick={() => setPage(page - 1)} disabled={page === 0}>Previous 10</button>
              <button type="button" className={s.btn2} onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE >= rows.length}>Next 10</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
