"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, moneyExact } from "@/lib/format";
import { call, toCents } from "@/components/sections/api";
import s from "./Settings.module.css";

export type Paycheck = { id: string; payDate: string; employer: string | null; netCents: number };
type Income = { paycheckNetCents: number | null; payDays: number[]; tithePct: number };

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const PAGE = 10;
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export function PaychecksPanel({ income, paychecks }: { income: Income; paychecks: Paycheck[] }) {
  const router = useRouter();
  const [f, setF] = useState({ paycheck: income.paycheckNetCents ? String(income.paycheckNetCents / 100) : "", payDays: income.payDays.join(", "), tithe: String(income.tithePct) });
  const [st, setSt] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const [shown, setShown] = useState(PAGE);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setSt({ busy: false }); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payDays = f.payDays.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!payDays.length || payDays.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return setSt({ busy: false, err: "Pay days are days of the month, like 1, 15." });
    const tithe = Number(f.tithe);
    if (!Number.isFinite(tithe) || tithe < 0 || tithe > 100) return setSt({ busy: false, err: "Tithe is a percentage of income." });
    const paycheck = f.paycheck.trim() ? toCents(f.paycheck) : null;
    if (paycheck !== null && !Number.isFinite(paycheck)) return setSt({ busy: false, err: "Take-home must be a dollar amount." });
    setSt({ busy: true });
    const r = await call("/api/settings", "PUT", { paycheckNetCents: paycheck, payDays, tithePct: tithe });
    if (r.ok) { setSt({ busy: false, msg: "Saved." }); router.refresh(); } else setSt({ busy: false, err: r.error });
  }

  const monthly = income.paycheckNetCents ? income.paycheckNetCents * income.payDays.length : null;
  return (
    <>
      <div className={s.head}><h2>Paychecks</h2><p>detected from payroll deposits in checking{monthly ? ` · ${money(monthly)} a month expected, ${income.payDays.length} × ${money(income.paycheckNetCents!)} on the ${income.payDays.map(ord).join(" and ")}` : ""}</p></div>

      <form className={s.income} onSubmit={save}>
        <div className={s.field}><label htmlFor="pc-pay">Take-home per paycheck ($)</label><input id="pc-pay" className={s.input} inputMode="decimal" value={f.paycheck} onChange={set("paycheck")} placeholder="2859.49" /></div>
        <div className={s.field}><label htmlFor="pc-days">Pay days of the month</label><input id="pc-days" className={s.input} value={f.payDays} onChange={set("payDays")} placeholder="1, 15" /></div>
        <div className={s.field}><label htmlFor="pc-tithe">Tithe (% of income)</label><input id="pc-tithe" className={s.input} inputMode="decimal" value={f.tithe} onChange={set("tithe")} /></div>
        <div className={s.btns} style={{ alignSelf: "end" }}>
          <button type="submit" className={s.btn} disabled={st.busy}>{st.busy ? "Saving…" : "Save"}</button>
          {st.msg ? <span className={s.ok}>{st.msg}</span> : null}
          {st.err ? <span className={s.err}>{st.err}</span> : null}
        </div>
      </form>

      <span className={s.label} style={{ marginTop: 8 }}>Paycheck log · {paychecks.length}</span>
      {paychecks.length === 0 ? <p className={s.hint}>No payroll deposits found yet. They appear here after the first sync that sees one.</p> : (
        <div className={s.list}>
          {paychecks.slice(0, shown).map((p, i) => {
            const prev = paychecks[i + 1];
            const diff = prev ? p.netCents - prev.netCents : 0;
            return (
              <div className={s.pay} key={p.id}>
                <span><b>{day(p.payDate)}</b><small>{p.employer ?? "Payroll"} · into checking{diff ? ` · ${diff > 0 ? "+" : "-"}${moneyExact(Math.abs(diff))} vs the one before` : ""}</small></span>
                <span className={s.amt}>{moneyExact(p.netCents)}</span>
              </div>
            );
          })}
        </div>
      )}
      {paychecks.length > shown ? <div className={s.btns}><button type="button" className={s.btn2} onClick={() => setShown(shown + PAGE)}>Show 10 more</button></div> : null}
    </>
  );
}
