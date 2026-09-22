"use client";

import { useEffect, useState } from "react";
import s from "./sections.module.css";

type Entry = { at: string; account: string; feature: string; status: string; usd: number; note?: string; trigger: string };

const FEATURE: Record<string, string> = {
  balance: "Balance",
  transactions: "Transactions",
  "auto-transactions": "Transactions (Stripe daily)",
  list: "Read stored transactions",
};

function when(iso: string) {
  const t = new Date(iso);
  return {
    day: t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }),
    time: t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Chicago" }),
  };
}

export function FetchLog() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    fetch("/api/sync/log").then((r) => (r.ok ? r.json() : { entries: [] })).then((j) => setEntries(j.entries ?? [])).catch(() => setEntries([]));
  }, []);
  if (entries === null) return <p className={s.hint}>Loading log…</p>;
  const paidOnly = entries.filter((e) => e.feature !== "list");
  const rows = (all ? entries : paidOnly).slice(0, 200);
  if (rows.length === 0) return <p className={s.hint}>No Stripe fetches recorded yet — the log fills from the next sync.</p>;
  return (
    <div>
      <div className={s.actions} style={{ marginBottom: 12 }}>
        <button type="button" className={`${s.button} ${s.ghost}`} onClick={() => setAll(!all)}>{all ? "Show paid fetches only" : "Show everything, including free reads"}</button>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>When (Central)</th><th>Account</th><th>What</th><th>Status</th><th>Trigger</th><th className={s.num}>Fee</th></tr></thead>
          <tbody>
            {rows.map((e, i) => {
              const w = when(e.at);
              return (
                <tr key={i}>
                  <td className="num">{w.day} · {w.time}</td>
                  <td>{e.account}</td>
                  <td>{FEATURE[e.feature] ?? e.feature}{e.note ? <span className={s.hint} style={{ display: "block" }}>{e.note}</span> : null}</td>
                  <td className={e.status === "failed" ? "crit" : e.status === "succeeded" || e.status === "ok" ? "good" : undefined}>{e.status}</td>
                  <td className="muted">{e.trigger}</td>
                  <td className={`num ${s.num}`}>{e.usd ? `$${e.usd.toFixed(2)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
