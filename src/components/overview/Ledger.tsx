import Link from "next/link";
import type { Dashboard } from "@/lib/types";
import { dateLabel, moneyExact } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import s from "./overview.module.css";
import { MerchantCell } from "@/components/MerchantLogo";

export function Ledger({ d }: { d: Dashboard }) {
  if (!d.recentTransactions.length) return null;
  return (
    <section className={s.spread} style={{ gridTemplateColumns: "1fr" }}>
      <div>
        <h2 className={s.h2}>Recent</h2>
        <p className={s.sub}>
          last {d.recentTransactions.length} transactions · <Link href="/spending">all spending</Link>
        </p>
        <table className={s.ledger}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th className={s.hideNarrow}>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.recentTransactions.map((t) => (
              <tr key={t.id}>
                <td className="num">{dateLabel(t.postedOn)}</td>
                <td>
                  <MerchantCell src={t.logoUrl} name={t.merchant} category={t.category} size={24}>
                    {t.anomalyNote ? <span className={s.flag}>Unusual · {t.anomalyNote}</span> : null}
                  </MerchantCell>
                </td>
                <td className={s.hideNarrow}>
                  {t.category} <span className={s.acct}>· {prettyName(t.accountName)}</span>
                </td>
                <td className={`${s.amt} num ${t.isIncome ? "good" : ""}`}>
                  {t.amountCents < 0 ? "−" : "+"}{moneyExact(Math.abs(t.amountCents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
