import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { prettyName } from "@/components/sections/names";
import { monthYear } from "./util";
import s from "./overview.module.css";

function prompts(d: Dashboard): string[] {
  const out: string[] = [];
  const behind = d.goals.find((g) => !g.onTrack);
  if (behind) out.push(`Am I on track for the ${behind.name.toLowerCase()}?`);
  const over = d.budget?.categories.find((c) => c.limitCents > 0 && c.spentCents > c.limitCents);
  if (over) out.push(`Why is ${over.category.toLowerCase()} over this month?`);
  const dip = d.annotations.find((a) => a.series === "net_worth" && /−|-|dip|repair/i.test(a.text));
  if (dip) out.push(`Why did net worth dip in ${monthYear(dip.date).split(" ")[0]}?`);
  const loan = d.loans[0];
  if (loan && out.length < 3) out.push(`Should I pay the ${prettyName(loan.name).toLowerCase()} faster?`);
  if (out.length < 3) out.push("Where does most of my money go each month?");
  if (out.length < 3) out.push("What should I set as a monthly budget?");
  return out.slice(0, 3);
}

export function AdvisorSpread({ d }: { d: Dashboard }) {
  const txnCount = d.recentTransactions.length;
  return (
    <section className={`${s.spread} ${s.advisor}`}>
      <div>
        <h2 className={s.h2}>Advisor</h2>
        <p className={s.sub}>{d.brief ? "this morning’s brief" : "ask anything"}</p>
        {d.brief ? (
          <>
            <p className={s.brief}>{d.brief}</p>
            <div className={s.byline}>
              Written for {monthYear(d.asOf)} · from {d.accounts.length} accounts{txnCount ? ` and ${txnCount}+ transactions` : ""}
            </div>
          </>
        ) : (
          <p className={s.empty}>
            Your first morning brief arrives after the first overnight sync. Until then the advisor already knows your {d.accounts.length} accounts — <Link href="/advisor">start a conversation</Link> or pick a question.
          </p>
        )}
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
