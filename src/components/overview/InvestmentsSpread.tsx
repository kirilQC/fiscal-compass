import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { Ring, Sparkline } from "@/components/charts";
import { money } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import s from "./overview.module.css";

const EQUITY = new Set(["us_equity", "intl_equity"]);
const opacityAt = (i: number) => Math.max(0.32, 1 - i * 0.24);

export function InvestmentsSpread({ d }: { d: Dashboard }) {
  const holdings = d.holdings;
  const investAccts = d.accounts.filter((a) => a.kind === "investment");
  const investAcct = investAccts[0];
  const change = d.investmentChangeMtdPct;
  const mtdCents = investAccts.reduce((sum, a) => sum + (a.changeMtdCents ?? 0), 0);

  if (!investAcct && holdings.length === 0) return null;

  if (holdings.length === 0) {
    return (
      <section className={s.spread}>
        <div>
          <h2 className={s.h2}>Investments</h2>
          <p className={s.sub}>{investAccts.map((a) => `${a.institution} ${prettyName(a.name)}`).join(", ")}</p>
          <div className={`${s.fig} num`}>
            {money(d.investmentTotalCents)}
            {mtdCents !== 0 ? <small className={mtdCents >= 0 ? "good" : "crit"}>{mtdCents >= 0 ? "+" : "−"}{money(Math.abs(mtdCents))} this month</small> : <small>total value</small>}
          </div>
        </div>
        <div>
          <p className={`${s.sub} ${s.subOffset}`}>Holdings</p>
        </div>
      </section>
    );
  }

  const equityPct = Math.round(holdings.filter((h) => EQUITY.has(h.assetClass ?? "")).reduce((sum, h) => sum + h.weightPct, 0));
  const nonCash = holdings.filter((h) => h.assetClass !== "cash");
  const segments = holdings.map((h) => {
    if (h.assetClass === "cash") return { pct: h.weightPct, color: "var(--ink3)" };
    return { pct: h.weightPct, opacity: opacityAt(nonCash.indexOf(h)) };
  });
  const targets = ["equity", "bond", "cash"].map((cls) =>
    Math.round(
      holdings
        .filter((h) => (cls === "equity" ? EQUITY.has(h.assetClass ?? "") : h.assetClass === cls))
        .reduce((sum, h) => sum + (h.targetPct ?? 0), 0),
    ),
  );
  const hasTargets = holdings.some((h) => h.targetPct !== null);
  const drift = holdings.reduce((m, h) => (h.targetPct === null ? m : Math.max(m, Math.abs(h.weightPct - h.targetPct))), 0);

  return (
    <section className={s.spread}>
      <div>
        <h2 className={s.h2}>Investments</h2>
        <p className={s.sub}>
          {investAcct?.institution ?? "Brokerage"} · {money(d.investmentTotalCents)}
          {change !== null ? (
            <>
              {" · "}
              <span className={change >= 0 ? "good" : "crit"}>{change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(1)}% this month</span>
            </>
          ) : null}
        </p>
        <div className={s.ring}>
          <Ring ariaLabel="Allocation ring" segments={segments} label={`${equityPct}%`} sub="equities" />
          <div className={s.key}>
            {holdings.map((h) => (
              <div key={h.id}>
                <i style={h.assetClass === "cash" ? { background: "var(--ink3)" } : { opacity: opacityAt(nonCash.indexOf(h)) }} />
                <span>
                  {h.symbol} <small>{h.name}</small>
                </span>
                <b className="num">{Math.round(h.weightPct)}%</b>
              </div>
            ))}
          </div>
        </div>
        {hasTargets ? (
          <div className={s.meta} style={{ marginTop: 22 }}>
            <span>target {targets.join(" / ")}</span>
            <span>{drift <= 5 ? "within range · no rebalance needed" : `${drift.toFixed(0)} pts off target · consider rebalancing`}</span>
          </div>
        ) : null}
      </div>
      <div className={s.holds}>
        {holdings.map((h) => {
          const isCash = h.assetClass === "cash";
          const pct = h.changeMtdPct;
          const mtd = pct === null ? null : Math.round(h.valueCents - h.valueCents / (1 + pct / 100));
          const tone = mtd === null ? s.flat : mtd < 0 ? s.down : Math.abs(pct ?? 0) < 0.5 ? s.flat : undefined;
          return (
            <div className={s.h} key={h.id}>
              <div className={s.t}>
                {h.symbol}
                <small>{isCash ? "cash" : pct === null ? "" : `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% MTD`}</small>
              </div>
              <Sparkline points={h.series} ariaLabel={`${h.symbol} value, twelve months`} color={isCash ? "var(--ink3)" : "var(--accent)"} step={isCash} />
              <div className={`${s.v} num`}>
                {money(h.valueCents)}
                {mtd !== null ? <small className={tone}>{mtd >= 0 ? "+" : "−"}{money(Math.abs(mtd))}</small> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
