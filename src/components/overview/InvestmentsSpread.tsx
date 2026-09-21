import type { Dashboard } from "@/lib/types";
import { Ring, Sparkline } from "@/components/charts";
import { money } from "@/lib/format";
import s from "./overview.module.css";

const EQUITY = new Set(["us_equity", "intl_equity"]);
const opacityAt = (i: number) => Math.max(0.32, 1 - i * 0.24);

export function InvestmentsSpread({ d }: { d: Dashboard }) {
  const holdings = d.holdings;
  const investAcct = d.accounts.find((a) => a.kind === "investment");
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
  const drift = Math.max(0, ...holdings.map((h) => (h.targetPct === null ? 0 : Math.abs(h.weightPct - h.targetPct))));
  const change = d.investmentChangeMtdPct;

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
          const mtdCents = pct === null ? null : Math.round(h.valueCents - h.valueCents / (1 + pct / 100));
          const tone = mtdCents === null ? s.flat : mtdCents < 0 ? s.down : Math.abs(pct ?? 0) < 0.5 ? s.flat : undefined;
          return (
            <div className={s.h} key={h.id}>
              <div className={s.t}>
                {h.symbol}
                <small>{isCash ? "cash" : pct === null ? "" : `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% MTD`}</small>
              </div>
              <Sparkline points={h.series} ariaLabel={`${h.symbol} value, twelve months`} color={isCash ? "var(--ink3)" : "var(--accent)"} step={isCash} />
              <div className={`${s.v} num`}>
                {money(h.valueCents)}
                {mtdCents !== null ? <small className={tone}>{mtdCents >= 0 ? "+" : "−"}{money(Math.abs(mtdCents))}</small> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
