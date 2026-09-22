"use client";

import { useState } from "react";
import type { Dashboard, Holding, SeriesPoint } from "@/lib/types";
import { money } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import { BrandLogo } from "@/components/BrandLogo";
import { AreaChart, RANGES, type Range } from "@/components/charts/AreaChart";
import { Pie, PIE_COLORS, Sparkline } from "@/components/charts";
import s from "./InvestmentsPage.module.css";

type Props = { d: Dashboard };

const signedMoney = (c: number) => (c === 0 ? "$0" : `${c > 0 ? "+" : "−"}${money(Math.abs(c))}`);
const signedPct = (p: number | null) => (p === null ? "—" : p === 0 ? "0.0%" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`);
const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

function valueAt(daily: SeriesPoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of daily) {
    if (p.date <= date) v = p.valueCents;
    else break;
  }
  return v;
}

function metric(daily: SeriesPoint[], last: number, baseDate: string, label: string) {
  const first = daily[0]?.date ?? baseDate;
  const usedDate = baseDate < first ? first : baseDate;
  const base = valueAt(daily, usedDate);
  const delta = base === null ? null : last - base;
  const pct = base ? (delta! / Math.abs(base)) * 100 : null;
  const shortened = baseDate < first;
  return { label: shortened && label === "Year to date" ? `Since ${monthName(first)}` : label, delta, pct };
}

export function InvestmentsPage({ d }: Props) {
  const [range, setRange] = useState<Range>("6M");
  const daily = d.investmentDaily;
  const total = d.investmentTotalCents;
  const accounts = d.accounts.filter((a) => a.kind === "investment");
  const asOf = d.asOf;

  const today = new Date(`${asOf}T00:00:00Z`);
  const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const threeMo = new Date(today.getTime() - 91 * 86400000).toISOString().slice(0, 10);
  const yearEnd = `${today.getUTCFullYear() - 1}-12-31`;
  const metrics = [
    metric(daily, total, yesterday, "Today"),
    metric(daily, total, lastMonthEnd, "This month"),
    metric(daily, total, threeMo, "3 months"),
    metric(daily, total, yearEnd, "Year to date"),
  ];

  const holdings = [...d.holdings].sort((a, z) => z.valueCents - a.valueCents);
  const slices = holdings.map((h) => ({ label: h.symbol, value: h.valueCents }));
  const ghosts = Math.max(0, 3 - holdings.length);

  return (
    <main className={`wrap ${s.page}`}>
      <header className={s.hero}>
        <div>
          <div className={`${s.total} num`}>{money(total)}</div>
        </div>
        <BrandLogo kind="fidelity" size={132} className={s.bigLogo} />
      </header>

      <div className={s.metrics}>
        {metrics.map((m) => (
          <div key={m.label}>
            <div className={s.eyebrow}>{m.label}</div>
            <div className={`${s.mv} num ${m.delta === null || m.delta === 0 ? s.muted : m.delta > 0 ? "good" : "crit"}`}>{m.delta === null ? "—" : signedMoney(m.delta)}</div>
            <div className={`${s.mp} num`}>{signedPct(m.pct)}</div>
          </div>
        ))}
      </div>

      <div className={s.split}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.eyebrow}>Balance over time</span>
            <div className={s.pills} role="group" aria-label="Chart range">
              {RANGES.map((r) => (
                <button key={r} type="button" className={range === r ? s.on : undefined} onClick={() => setRange(r)} aria-pressed={range === r}>{r}</button>
              ))}
            </div>
          </div>
          {daily.length > 1 ? (
            <AreaChart daily={daily} range={range} anchorCents={total} ariaLabel={`Investment balance, ${range === "ALL" ? "all history" : `last ${range}`}`} width={1140} height={300} />
          ) : (
            <p className={s.hint}>The balance chart fills in as daily snapshots accumulate.</p>
          )}
        </section>
        <section className={`${s.card} ${s.alloc}`}>
          <span className={s.eyebrow}>Allocation</span>
          {slices.length ? (
            <Pie
              slices={slices}
              title=""
              ariaLabel={`Allocation: ${slices.map((x) => x.label).join(", ")}`}
              formatValue={money}
              size={220}
              innerRadiusPct={58}
              centerLines={[money(total), `${holdings.length} holding${holdings.length === 1 ? "" : "s"}`]}
              showLabels={false}
              colors={[PIE_COLORS[1], ...PIE_COLORS.slice(2), PIE_COLORS[0]]}
              className={s.pie}
            />
          ) : (
            <p className={s.hint}>Allocation appears once positions are detected.</p>
          )}
        </section>
      </div>

      <section className={s.holdings}>
        {holdings.map((h) => (
          <HoldingBox key={h.id} h={h} />
        ))}
        {Array.from({ length: ghosts }).map((_, i) => (
          <div key={`ghost-${i}`} className={`${s.card} ${s.ghost}`}>Positions appear here automatically as they&apos;re detected</div>
        ))}
      </section>
    </main>
  );
}

function HoldingBox({ h }: { h: Holding }) {
  const day = h.changeDayPct;
  const name = h.name ?? (h.assetClass === "cash" ? "Cash" : h.symbol);
  return (
    <div className={`${s.card} ${s.holding}`}>
      <div className={s.hTop}>
        {h.symbol === "SPY" ? <BrandLogo kind="spdr" size={34} /> : <span className={s.ticker}>{h.symbol}</span>}
        <div>
          <b>{h.symbol}</b>
          <div className={s.muted}>{name}</div>
        </div>
        <span className={`${s.faint} num`} style={{ marginLeft: "auto" }}>{h.weightPct.toFixed(h.weightPct === 100 ? 0 : 1)}%</span>
      </div>
      <div className={s.hRow}>
        <span className={`${s.hVal} num`}>{money(h.valueCents)}</span>
        {day !== null ? <span className={`num ${day >= 0 ? "good" : "crit"}`}>{signedPct(day)} today</span> : null}
      </div>
      <div className={s.hRow}>
        <span className={`${s.muted} num`}>
          {h.priceCents !== null ? `$${(h.priceCents / 100).toFixed(2)}` : "—"}
          {h.impliedShares !== null ? ` · ≈${h.impliedShares.toFixed(1)} sh` : ""}
        </span>
        {h.priceSeries.length > 1 ? <Sparkline points={h.priceSeries} ariaLabel={`${h.symbol} price, three months`} width={120} height={30} baseline={false} /> : null}
      </div>
      {h.change3mPct !== null ? (
        <div className={s.faint} style={{ fontSize: 11 }}>
          3 months <span className={`num ${h.change3mPct >= 0 ? "good" : "crit"}`}>{signedPct(h.change3mPct)}</span>
        </div>
      ) : null}
    </div>
  );
}
