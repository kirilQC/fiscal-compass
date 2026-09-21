import type { Dashboard } from "@/lib/types";
import { money } from "@/lib/format";
import { prettyName } from "@/components/sections/names";
import { plainMoney } from "./util";
import s from "./overview.module.css";

export function Hero({ d }: { d: Dashboard }) {
  const whole = Math.round(d.netWorthCents / 100).toLocaleString("en-US");
  const sinceDate = d.changeSince ? new Date(`${d.changeSince}T00:00:00Z`) : null;
  const fullYear = !sinceDate || (sinceDate.getUTCMonth() === 11 && sinceDate.getUTCDate() === 31);
  const sinceLabel = fullYear ? "since January" : `since ${sinceDate.toLocaleString("en-US", { month: "long", timeZone: "UTC" })}`;
  const summary = d.accounts
    .filter((a) => a.kind !== "other")
    .map((a) => `${a.kind === "investment" ? a.institution : prettyName(a.name)} ${a.balanceCents === 0 && (a.kind === "loan" || a.kind === "credit") ? "balance unknown" : plainMoney(a.balanceCents)}`)
    .join(" · ");
  return (
    <section className={s.hero}>
      <div>
        <div className="eyebrow">Net worth</div>
        <h1 className={s.nw}>
          <sup>$</sup>
          {whole}
        </h1>
      </div>
      <div className={s.delta}>
        <span>
          <b className={d.changeMtdCents < 0 ? s.down : undefined}>{d.changeMtdCents >= 0 ? "+ " : "− "}{money(Math.abs(d.changeMtdCents))}</b> this month
        </span>
        <span>
          <b className={d.changeYtdCents < 0 ? s.down : undefined}>{d.changeYtdCents >= 0 ? "+ " : "− "}{money(Math.abs(d.changeYtdCents))}</b> {fullYear ? "this year" : sinceLabel}
        </span>
        <span>{d.changeYtdPct >= 0 ? "+" : "−"}{Math.abs(d.changeYtdPct).toFixed(1)}% {sinceLabel}</span>
        <span>{summary}</span>
      </div>
    </section>
  );
}
