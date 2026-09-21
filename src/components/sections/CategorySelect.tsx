"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";
import s from "./sections.module.css";

export function CategorySelect({ id, value, options }: { id: string; value: string; options: string[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const all = Array.from(new Set([...options, value, "Income", "Transfer"]));

  async function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setCurrent(next);
    setErr(null);
    const r = await call(`/api/transactions/${id}`, "PATCH", next === "Transfer" ? { category: next, isTransfer: true } : { category: next });
    if (!r.ok) {
      setErr(r.error);
      setCurrent(value);
    } else router.refresh();
  }

  return (
    <span>
      <select aria-label="Category" className={s.inlineSelect} value={current} onChange={change}>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {err ? <span className="crit" style={{ display: "block", fontSize: 11.5 }}>{err}</span> : null}
    </span>
  );
}
