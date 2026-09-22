import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { LineChart, Ring } from "@/components/charts";
import { HoldingCard } from "@/components/HoldingCard";
import { money, monthLabel, pct } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { BrandLogo } from "@/components/BrandLogo";
import o from "@/components/overview/overview.module.css";
import s from "@/components/sections/sections.module.css";
import { prettyName } from "@/components/sections/names";

const CLASS_LABEL: Record<string, string> = { us_equity: "US equity", intl_equity: "International", bond: "Bonds", cash: "Cash", other: "Other" };
const CLASS_ORDER = ["us_equity", "intl_equity", "bond", "cash", "other"];
const opacityAt = (i: number) => Math.max(0.32, 1 - i * 0.22);

export default async function InvestmentsPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const investAccounts = d.accounts.filter((a) => a.kind === "investment");
  const change = d.investmentChangeMtdPct;
  const hasTargets = d.holdings.some((h) => h.targetPct !== null);

  const byClass = CLASS_ORDER.map((cls) => {
    const hs = d.holdings.filter((h) => (h.assetClass ?? "other") === cls);
    if (!hs.length) return null;
    return {
      cls,
      actual: hs.reduce((sum, h) => sum + h.weightPct, 0),
      target: hasTargets ? hs.reduce((sum, h) => sum + (h.targetPct ?? 0), 0) : null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  const nonCashIdx = byClass.filter((c) => c.cls !== "cash").map((c) => c.cls);
  const segments = byClass.map((c) => (c.cls === "cash" ? { pct: c.actual, color: "var(--ink3)" } : { pct: c.actual, opacity: opacityAt(nonCashIdx.indexOf(c.cls)) }));
  const equityPct = Math.round(byClass.filter((c) => c.cls === "us_equity" || c.cls === "intl_equity").reduce((sum, c) => sum + c.actual, 0));
  const maxDrift = byClass.reduce((m, c) => (c.target === null ? m : Math.max(m, Math.abs(c.actual - c.target))), 0);
  const noHoldings = d.holdings.length === 0;
  const mtdFromAccounts = investAccounts.reduce((sum, a) => sum + (a.changeMtdCents ?? 0), 0);
  const mtdCents = change === null ? null : Math.round(d.investmentTotalCents - d.investmentTotalCents / (1 + change / 100));

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <PageHead
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}><BrandLogo kind="fidelity" size={28} />Investments</span>}
          lede={`${investAccounts.map((a) => `${a.institution} ${prettyName(a.name)}`).join(", ") || "Brokerage"} · ${noHoldings ? "positions not connected yet" : `${d.holdings.length} holdings`}`}
          figs={[
            { value: money(d.investmentTotalCents), label: "total value" },
            ...(mtdCents !== null ? [{ value: `${mtdCents >= 0 ? "+" : "−"}${money(Math.abs(mtdCents))}`, label: `this month · ${pct(change ?? 0)}`, tone: mtdCents >= 0 ? "good" : "crit" }]
              : mtdFromAccounts ? [{ value: `${mtdFromAccounts >= 0 ? "+" : "−"}${money(Math.abs(mtdFromAccounts))}`, label: "this month", tone: mtdFromAccounts >= 0 ? "good" : "crit" }] : []),
            ...(noHoldings ? [] : [{ value: `${equityPct}%`, label: "in equities" }]),
          ]}
        />

        {noHoldings ? (
          <section className={`${s.section} ${s.two}`}>
            <div>
              <h2 className={s.h2}>What Stripe sees</h2>
              <p className={s.sub}>the account balance and every transaction, refreshed each morning</p>
              <p className={s.voice}>
                Fidelity reports <b>{money(d.investmentTotalCents)}</b> across {investAccounts.length === 1 ? "your account" : `${investAccounts.length} accounts`}.
              </p>
            </div>
            <div>
              <h2 className={s.h2}>Positions detected from activity</h2>
              <p className={s.sub}>tickers named in dividends, trades and sweeps</p>
              {d.detectedTickers?.length ? (
                <div className={s.list}>
                  {d.detectedTickers.map((t) => (
                    <div className={s.row} key={t}><span className={s.n}>{t}<small>{t === "SPAXX" ? "Fidelity Government Money Market · core cash" : "seen in account activity"}</small></span></div>
                  ))}
                </div>
              ) : <p className={s.hint}>No tickers named in the activity yet.</p>}
            </div>
          </section>
        ) : null}

        {noHoldings ? null : (
        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Allocation</h2>
            <p className={s.sub}>by asset class · actual{hasTargets ? " against target" : ""}</p>
            <div className={o.ring}>
              <Ring ariaLabel="Allocation by asset class" segments={segments} label={`${equityPct}%`} sub="equities" />
              <div className={o.key}>
                {byClass.map((c) => (
                  <div key={c.cls}>
                    <i style={c.cls === "cash" ? { background: "var(--ink3)" } : { opacity: opacityAt(nonCashIdx.indexOf(c.cls)) }} />
                    <span>
                      {CLASS_LABEL[c.cls]}
                      {c.target !== null ? <small> · target {Math.round(c.target)}%</small> : null}
                    </span>
                    <b className="num">{Math.round(c.actual)}%</b>
                  </div>
                ))}
              </div>
            </div>
            {hasTargets ? (
              <p className={s.voice}>
                {maxDrift <= 5
                  ? <>Every class is within <b>5 points</b> of target. Nothing to rebalance — keep contributing on schedule.</>
                  : <>The largest drift is <b>{maxDrift.toFixed(0)} points</b>. Direct new contributions to the underweight class rather than selling; you avoid a taxable event and close the gap in a few months.</>}
              </p>
            ) : (
              <p className={s.voice}>Set a target percentage on each holding below and I&apos;ll track drift and tell you when to rebalance.</p>
            )}
          </div>
          <div>
            <h2 className={s.h2}>Holdings</h2>
            <p className={s.sub}>price per share · shares · value · three-month price</p>
            {d.holdings.map((h) => (
              <HoldingCard key={h.id} h={h} />
            ))}
            <p className={s.sub} style={{ marginTop: 20 }}>value · weight{hasTargets ? " · target · drift" : ""}</p>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className={s.hideNarrow}>Name</th>
                  <th className={s.r}>Value</th>
                  <th className={s.r}>Weight</th>
                  {hasTargets ? <th className={`${s.r} ${s.hideNarrow}`}>Target</th> : null}
                  {hasTargets ? <th className={s.r}>Drift</th> : null}
                </tr>
              </thead>
              <tbody>
                {d.holdings.map((h) => {
                  const drift = h.targetPct === null ? null : h.weightPct - h.targetPct;
                  return (
                    <tr key={h.id}>
                      <td><b>{h.symbol}</b></td>
                      <td className={`${s.hideNarrow} ${s.dim}`}>{h.name ?? CLASS_LABEL[h.assetClass ?? "other"]}</td>
                      <td className={`${s.r} ${s.amt} num`}>{money(h.valueCents)}</td>
                      <td className={`${s.r} num`}>{h.weightPct.toFixed(1)}%</td>
                      {hasTargets ? <td className={`${s.r} ${s.hideNarrow} num`}>{h.targetPct === null ? "—" : `${h.targetPct}%`}</td> : null}
                      {hasTargets ? (
                        <td className={`${s.r} num ${drift !== null && Math.abs(drift) > 5 ? "warn" : ""}`}>
                          {drift === null ? "—" : `${drift >= 0 ? "+" : "−"}${Math.abs(drift).toFixed(1)}`}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {noHoldings ? null : (
        <section className={s.section}>
          <h2 className={s.h2}>Each holding</h2>
          <p className={s.sub}>twelve months · value in dollars</p>
          {d.holdings.map((h) => {
            const isCash = h.assetClass === "cash";
            const first = h.series[0]?.valueCents ?? h.valueCents;
            const yearChange = h.valueCents - first;
            return (
              <div className={s.holding} key={h.id}>
                <div>
                  <div className={s.sym}>{h.symbol}</div>
                  <span className={s.symName}>{h.name ?? CLASS_LABEL[h.assetClass ?? "other"]}</span>
                  <div className={`${s.symVal} num`}>
                    {money(h.valueCents)}
                    <small>
                      {h.changeMtdPct !== null ? <span className={h.changeMtdPct >= 0 ? "good" : "crit"}>{pct(h.changeMtdPct)} this month</span> : "—"}
                      {" · "}
                      {yearChange >= 0 ? "+" : "−"}{money(Math.abs(yearChange))} over the year
                    </small>
                  </div>
                </div>
                <LineChart
                  ariaLabel={`${h.symbol} value over twelve months`}
                  series={[{ id: h.symbol, points: h.series, area: !isCash, color: isCash ? "var(--ink3)" : "var(--accent)" }]}
                  height={170}
                  yTicks={2}
                  formatY={money}
                  xLabel={(p, i, n) => (i === 0 || i === Math.floor(n / 2) || i === n - 1 ? monthLabel(p.date.slice(0, 7)) : null)}
                />
              </div>
            );
          })}
        </section>
        )}

        <PageFoot isSample={d.isSample} />
      </main>
    </>
  );
}
