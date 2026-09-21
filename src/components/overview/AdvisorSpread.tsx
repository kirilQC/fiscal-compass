import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { monthYear } from "./util";
import s from "./overview.module.css";

function prompts(d: Dashboard): string[] {
  const out: string[] = [];
  const behind = d.goals.find((g) => !g.onTrack);
  if (behind) out.push(`Am I on track for the ${behind.name.toLowerCase()}?`);
  const dip = d.annotations.find((a) => a.series === "net_worth" && /−|-|dip|repair/i.test(a.text));
  if (dip) out.push(`Why did net worth dip in ${monthYear(dip.date).split(" ")[0]}?`);
  const loan = d.loans[0];
  if (loan) out.push(`Should I pay the ${loan.name.toLowerCase()} faster?`);
  if (out.length < 3) out.push("Where can I trim next month?");
  return out.slice(0, 3);
}

export function AdvisorSpread({ d }: { d: Dashboard }) {
  const txnCount = d.recentTransactions.length;
  return (
    <section className={`${s.spread} ${s.advisor}`}>
      <div>
        <h2 className={s.h2}>Advisor</h2>
        <p className={s.sub}>this morning&rsquo;s brief</p>
        {d.brief ? <p className={s.brief}>{d.brief}</p> : <p className={s.brief}>Link an account and I&rsquo;ll write your first brief tomorrow morning.</p>}
        <div className={s.byline}>
          Written for {monthYear(d.asOf)} · from {d.accounts.length} accounts{txnCount ? ` and ${txnCount}+ transactions` : ""}
        </div>
      </div>
      <div>
        <div className={s.chips} style={{ marginTop: 46 }}>
          {prompts(d).map((p) => (
            <Link key={p} href={`/advisor?q=${encodeURIComponent(p)}`}>
              {p}
            </Link>
          ))}
        </div>
        <form className={s.ask} action="/advisor" method="get">
          <input id="ask-q" name="q" type="text" placeholder="Ask anything about your money" aria-label="Ask the advisor" autoComplete="off" />
          <button type="submit">Ask</button>
        </form>
      </div>
    </section>
  );
}
