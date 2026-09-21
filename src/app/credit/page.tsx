import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { BarChart, LineChart, Ring, Track } from "@/components/charts";
import { dateLabel, money, moneyExact, monthLabel } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import s from "@/components/sections/sections.module.css";

export default async function CreditPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const totalOwed = d.credit.reduce((sum, c) => sum + c.balanceCents, 0);
  const totalLimit = d.credit.reduce((sum, c) => sum + c.limitCents, 0);
  const overall = totalLimit ? Math.round((totalOwed / totalLimit) * 100) : 0;
  const cardNames = new Set(d.accounts.filter((a) => a.kind === "credit").map((a) => a.name));
  const cardTxns = d.recentTransactions.filter((t) => cardNames.has(t.accountName) && !t.isIncome);

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} />
      <main className="wrap">
        <PageHead
          title="Credit"
          lede={`${d.credit.length} card${d.credit.length === 1 ? "" : "s"} · ${money(totalLimit)} combined limit`}
          figs={[
            { value: money(totalOwed), label: "owed now" },
            { value: `${overall}%`, label: "overall utilization", tone: overall >= 30 ? "warn" : overall < 10 ? "good" : "" },
          ]}
        />

        {d.credit.length === 0 ? (
          <section className={s.section}><p className={s.hint}>No credit cards linked yet. Link one in Settings and it will appear here.</p></section>
        ) : null}

        {d.credit.map((c) => {
          const util = c.statements.map((st) => ({ date: `${st.month}-01`, valueCents: Math.round((st.balanceCents / c.limitCents) * 100) }));
          const avg = Math.round(c.statements.reduce((sum, st) => sum + st.balanceCents, 0) / Math.max(1, c.statements.length));
          const peak = c.statements.reduce((m, st) => (st.balanceCents > m.balanceCents ? st : m), c.statements[0]);
          const tone = c.utilizationPct >= 30 ? "warn" : "accent";
          const mid = Math.floor(util.length / 2);
          return (
            <section className={s.section} key={c.accountId}>
              <div className={s.two}>
                <div>
                  <h2 className={s.h2}>{c.name}</h2>
                  <p className={s.sub}>
                    {money(c.limitCents)} limit{c.dueOn ? ` · ${money(c.balanceCents)} due ${dateLabel(c.dueOn)}` : ""}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 28, alignItems: "center" }}>
                    <Ring ariaLabel={`${c.name} utilization`} segments={[{ pct: c.utilizationPct, color: tone === "warn" ? "var(--warn)" : "var(--accent)" }]} label={`${c.utilizationPct}%`} sub="of limit" />
                    <div>
                      <div className={s.meta} style={{ marginBottom: 4 }}>
                        <span>balance</span>
                        <span>limit</span>
                      </div>
                      <Track pct={c.utilizationPct} tone={tone} ariaLabel="Balance against limit" />
                      <div className={s.meta}>
                        <span className="num">{money(c.balanceCents)}</span>
                        <span className="num">{money(c.limitCents)}</span>
                      </div>
                      <p className={s.hint} style={{ marginTop: 18 }}>
                        Average statement {money(avg)} · highest {money(peak.balanceCents)} in {monthLabel(peak.month)}
                      </p>
                    </div>
                  </div>
                  <p className={s.voice}>
                    {c.utilizationPct < 10
                      ? <>You&apos;re at <b>{c.utilizationPct}%</b> — under the 10% that scores best. Paying in full each month, this card is doing exactly what it should.</>
                      : c.utilizationPct < 30
                        ? <>You&apos;re at <b>{c.utilizationPct}%</b>. Under 30% is fine; under 10% is ideal for your score. Paying {money(c.balanceCents - Math.round(c.limitCents * 0.1))} before the statement closes would get you there.</>
                        : <>You&apos;re at <b>{c.utilizationPct}%</b>, above the 30% line where scores start to slip. A mid-cycle payment of {money(c.balanceCents - Math.round(c.limitCents * 0.29))} brings it back under.</>}
                  </p>
                </div>
                <div>
                  <p className={s.sub} style={{ marginTop: 46 }}>Utilization · six months</p>
                  <LineChart
                    ariaLabel={`${c.name} utilization over six months`}
                    series={[{ id: "util", points: util, area: true }]}
                    width={520}
                    height={130}
                    pad={{ top: 10, right: 8, bottom: 30 }}
                    yTicks={0}
                    yMin={0}
                    yMax={35}
                    endpointLabel={false}
                    references={[{ value: 30, label: "30% — keep below", color: "var(--warn)" }, { value: 10, label: "10% ideal", color: "var(--good)" }]}
                    xLabel={(p, i, n) => (i === 0 || i === mid || i === n - 1 ? `${monthLabel(p.date.slice(0, 7))} · ${p.valueCents}%` : null)}
                  />
                  <p className={s.sub} style={{ marginTop: 34 }}>Statement balance · each bar one statement</p>
                  <BarChart
                    ariaLabel={`${c.name} statement balances`}
                    bars={c.statements.map((st, i, arr) => ({ label: monthLabel(st.month), value: st.balanceCents, emphasis: i === arr.length - 1 }))}
                    references={[{ value: avg, label: `avg ${money(avg)}`, color: "var(--rule2)" }]}
                    formatValue={money}
                  />
                </div>
              </div>
            </section>
          );
        })}

        {cardTxns.length ? (
          <section className={s.section}>
            <h2 className={s.h2}>On the card</h2>
            <p className={s.sub}>recent card transactions</p>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th className={s.hideNarrow}>Category</th>
                  <th className={s.r}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {cardTxns.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{dateLabel(t.postedOn)}</td>
                    <td>
                      {t.merchant}
                      {t.anomalyNote ? <span className={s.flag}>Unusual · {t.anomalyNote}</span> : null}
                    </td>
                    <td className={`${s.hideNarrow} ${s.dim}`}>{t.category} · {t.accountName}</td>
                    <td className={`${s.r} ${s.amt} num`}>−{moneyExact(Math.abs(t.amountCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <PageFoot isSample={d.isSample} />
      </main>
    </>
  );
}
