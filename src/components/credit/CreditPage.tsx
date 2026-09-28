"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart, LineChart } from "@/components/charts";
import { dateLabel, money, moneyExact, monthLabel, prettyMerchant } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import type { Account, CreditSummary } from "@/lib/types";
import s from "./CreditPage.module.css";
import { MerchantCell } from "@/components/MerchantLogo";

type Txn = {
  id: string;
  accountId: string;
  postedOn: string;
  merchant: string;
  amountCents: number;
  category: string;
  accountName: string;
  accountKind?: string;
  isTransfer?: boolean;
  isIncome?: boolean;
  status?: string;
  logoUrl?: string | null;
};

type Props = { credit: CreditSummary[]; accounts: Account[]; month: string };

const PLACEHOLDERS = ["Card 2", "Card 3"];

export function CreditPage({ credit, accounts, month }: Props) {
  const [selected, setSelectedRaw] = useState<string>(credit[0]?.accountId ?? "all");
  const setSelected = (id: string) => { setSelectedRaw(id); setShown(10); };
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [shown, setShown] = useState(10);

  useEffect(() => {
    let live = true;
    fetch(`/api/transactions?month=${month}&limit=2000`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!live) return;
        const rows: Txn[] = Array.isArray(j) ? j : j.transactions ?? [];
        setTxns(rows.filter((t) => t.accountKind === "credit" && !t.isTransfer && !t.isIncome && t.amountCents < 0));
      })
      .catch(() => live && setTxns([]));
    return () => {
      live = false;
    };
  }, [month]);

  const byId = useMemo(() => new Map(credit.map((c) => [c.accountId, c])), [credit]);
  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const isAll = selected === "all";
  const cards = useMemo(() => (isAll ? credit : credit.filter((c) => c.accountId === selected)), [credit, isAll, selected]);
  const cardIds = useMemo(() => new Set(cards.map((c) => c.accountId)), [cards]);

  const owed = cards.reduce((t, c) => t + c.balanceCents, 0);
  const limit = cards.reduce((t, c) => t + c.limitCents, 0);
  const hasLimit = cards.length > 0 && cards.every((c) => c.limitCents > 0);
  const util = hasLimit && limit ? Math.round((owed / limit) * 100) : null;
  const avail = hasLimit ? limit - owed : null;

  const statements = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) for (const st of c.statements) m.set(st.month, (m.get(st.month) ?? 0) + st.balanceCents);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, balanceCents]) => ({ month, balanceCents }));
  }, [cards]);
  const avg = statements.length ? Math.round(statements.reduce((t, st) => t + st.balanceCents, 0) / statements.length) : 0;
  const utilSeries = hasLimit ? statements.map((st) => ({ date: `${st.month}-01`, valueCents: Math.round((st.balanceCents / limit) * 100) })) : [];

  const rows = useMemo(() => (txns ?? []).filter((t) => cardIds.has(t.accountId)).sort((a, z) => (a.postedOn < z.postedOn ? 1 : a.postedOn > z.postedOn ? -1 : 0)), [txns, cardIds]);

  const title = isAll ? "All cards" : prettyName(byId.get(selected)?.name ?? "");
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <main className="wrap">
      <div className={s.titlebar}>
        <div>
          <h1 className={s.h1}>Credit</h1>
          <p className={s.lede}>
            {credit.length} card{credit.length === 1 ? "" : "s"}
            {hasLimit && isAll ? ` · ${money(limit)} combined limit` : ""}
          </p>
        </div>
        <div className={s.sel} role="tablist" aria-label="Select a card">
          {credit.map((c) => {
            const on = selected === c.accountId;
            const freedom = /freedom/i.test(c.name);
            const a = acctById.get(c.accountId);
            return (
              <button key={c.accountId} type="button" role="tab" aria-selected={on} className={`${s.tile} ${on ? s.on : ""}`} onClick={() => setSelected(c.accountId)}>
                {freedom ? (
                  <Image src="/logos/chase-freedom-card.png" alt={prettyName(c.name)} width={325} height={205} unoptimized className={s.img} />
                ) : (
                  <span className={`${s.ph} ${s.real}`}>
                    <b>{prettyName(c.name)}</b>
                    {a?.institution ?? ""}
                  </span>
                )}
              </button>
            );
          })}
          {PLACEHOLDERS.slice(0, Math.max(0, 3 - credit.length)).map((n) => (
            <span key={n} className={`${s.tile} ${s.soon}`} aria-disabled="true">
              <span className={s.ph}>
                <b>{n}</b>Coming soon
              </span>
            </span>
          ))}
          <button type="button" role="tab" aria-selected={isAll} className={`${s.tile} ${s.all} ${isAll ? s.on : ""}`} onClick={() => setSelected("all")}>
            <span className={s.ph}>
              <b>All cards</b>
              {credit.length} card{credit.length === 1 ? "" : "s"}
            </span>
          </button>
        </div>
      </div>

      {credit.length === 0 ? (
        <p className={s.hint}>No credit cards linked yet. Link one in Settings and it will appear here.</p>
      ) : (
        <>
          <section className={s.hero}>
            <div>
              <div className={s.eyebrow}>Owed now</div>
              <div className={s.owedRow}>
                <div className={`${s.owed} num`}>{money(owed)}</div>
                <UtilRing pct={util} />
              </div>
              <div className={s.name}>
                {title}
                {isAll ? <span className={s.nameSub}> · {credit.length} card{credit.length === 1 ? "" : "s"}</span> : null}
              </div>

              <div className={s.stats}>
                <div className={s.kv}>
                  <span className={s.k}>Credit limit</span>
                  <span className={`${s.v} num`}>{hasLimit ? money(limit) : "—"}</span>
                  <span className={s.sm}>{hasLimit ? (isAll ? "combined" : "on this card") : <Link href="/settings">set the limit in Settings</Link>}</span>
                </div>
                <div className={s.kv}>
                  <span className={s.k}>Utilization</span>
                  <span className={`${s.v} num`}>{util === null ? "—" : `${util}%`}</span>
                  <span className={s.sm}>{hasLimit ? <>of {money(limit)} limit</> : <Link href="/settings">set the limit in Settings</Link>}</span>
                </div>
                <div className={s.kv}>
                  <span className={s.k}>Available</span>
                  <span className={`${s.v} num`}>{avail === null ? "—" : money(avail)}</span>
                  <span className={s.sm}>room on the card</span>
                </div>
                <div className={s.kv}>
                  <span className={s.k}>Statement avg</span>
                  <span className={`${s.v} num`}>{money(avg)}</span>
                  <span className={s.sm}>{statements.length} month{statements.length === 1 ? "" : "s"}</span>
                </div>
              </div>

            </div>

            <div>
              <div className={s.eyebrow} style={{ marginBottom: 10 }}>Utilization · six months</div>
              {utilSeries.length > 1 ? (
                <LineChart
                  ariaLabel={`${title} utilization over six months`}
                  series={[{ id: "util", points: utilSeries, area: true }]}
                  width={760}
                  height={210}
                  pad={{ top: 14, right: 16, bottom: 30, left: 0 }}
                  yTicks={3}
                  yMin={0}
                  yMax={Math.max(40, Math.ceil(Math.max(...utilSeries.map((p) => p.valueCents)) / 10) * 10 + 10)}
                  formatY={(v) => `${Math.round(v)}%`}
                  endpointLabel={(v) => `${Math.round(v)}%`}
                  references={[
                    { value: 30, label: "30% keep below", color: "var(--ink3)", dashed: true },
                  ]}
                  xLabel={(p) => monthLabel(p.date.slice(0, 7))}
                />
              ) : (
                <p className={s.hint}>{hasLimit ? "One month so far — the line draws itself in as statements accumulate." : "Set the card's limit in Settings to see utilization history."}</p>
              )}
              <div className={s.eyebrow} style={{ margin: "26px 0 10px" }}>Statement balance</div>
              {statements.length > 0 ? (
                <BarChart
                  ariaLabel={`${title} statement balances`}
                  bars={statements.map((st, i, arr) => ({ label: monthLabel(st.month), value: st.balanceCents, emphasis: i === arr.length - 1 }))}
                  references={avg ? [{ value: avg, label: `avg ${money(avg)}`, color: "var(--rule2)", dashed: true }] : []}
                  formatValue={money}
                  width={760}
                  height={190}
                />
              ) : null}
            </div>
          </section>

          {isAll && credit.length > 1 ? (
            <section className={s.perCard}>
              {credit.map((c) => {
                const p = c.limitCents ? Math.round((c.balanceCents / c.limitCents) * 100) : null;
                return (
                  <button key={c.accountId} type="button" className={s.pc} onClick={() => setSelected(c.accountId)}>
                    <span className={s.pcHead}>
                      <span>{prettyName(c.name)}</span>
                      <span className="num">{money(c.balanceCents)}{p !== null ? ` · ${p}%` : ""}</span>
                    </span>
                    <span className={s.util}>
                      <i style={{ width: `${Math.min(100, p ?? 0)}%` }} />
                      <em style={{ left: "10%" }} />
                      <em style={{ left: "30%" }} />
                    </span>
                  </button>
                );
              })}
            </section>
          ) : null}

          <hr className={s.hair} />

          <section className={s.two}>
            <div>
              <h2 className={s.h2}>Recent</h2>
              {txns === null ? (
                <p className={s.hint}>Loading {monthName}…</p>
              ) : rows.length === 0 ? (
                <p className={s.hint}>Nothing on the card{isAll ? "s" : ""} yet in {monthName}.</p>
              ) : (
                <>
                  <TxnTable rows={rows.slice(0, shown)} isAll={isAll} />
                  {rows.length > shown ? (
                    <button type="button" className={s.more} onClick={() => setShown(shown + 10)}>View 10 more</button>
                  ) : null}
                </>
              )}
            </div>
            <div>
              <h2 className={s.h2}>Biggest this month</h2>
              {txns === null ? (
                <p className={s.hint}>Loading…</p>
              ) : rows.length === 0 ? (
                <p className={s.hint}>Nothing yet in {monthName}.</p>
              ) : (
                <TxnTable rows={[...rows].sort((a, z) => a.amountCents - z.amountCents).slice(0, 10)} isAll={isAll} />
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function UtilRing({ pct }: { pct: number | null }) {
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className={s.ring} style={{ width: size, height: size }} role="img" aria-label={pct === null ? "Utilization unknown" : `${pct}% utilization`}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} />
        {pct !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * v) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
        {[10, 30].map((g) => (
          <line
            key={g}
            x1={size / 2}
            y1={stroke / 2 - 2}
            x2={size / 2}
            y2={stroke + 3}
            stroke={g === 10 ? "var(--good)" : "var(--ink2)"}
            strokeWidth="1.5"
            transform={`rotate(${g * 3.6} ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className={s.ringC}>
        <div className={`${s.ringV} num`}>{pct === null ? "—" : `${pct}%`}</div>
        <div className={s.ringS}>utilization</div>
      </div>
    </div>
  );
}

function TxnTable({ rows, isAll }: { rows: Txn[]; isAll: boolean }) {
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Merchant</th>
          <th className={s.r}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className={t.status === "pending" ? s.pending : undefined}>
            <td className={`${s.date} num`}>{dateLabel(t.postedOn)}</td>
            <td>
              <MerchantCell src={t.logoUrl} name={prettyMerchant(t.merchant)} category={t.category}>
                <span className={s.tag}>{t.category}</span>
                {isAll ? <span className={s.acct}>{prettyName(t.accountName)}</span> : null}
                {t.status === "pending" ? <span className={s.acct}>pending</span> : null}
              </MerchantCell>
            </td>
            <td className={`${s.r} num`}>−{moneyExact(Math.abs(t.amountCents))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
