import type { Holding } from "@/lib/types";
import { Sparkline } from "@/components/charts";
import { money } from "@/lib/format";
import { TickerBadge } from "./TickerBadge";
import s from "./HoldingCard.module.css";

const price = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

export function HoldingCard({ h }: { h: Holding }) {
  const hasPrice = h.priceCents !== null;
  return (
    <div className={s.card}>
      <TickerBadge symbol={h.symbol} />
      <div className={s.id}>
        <div className={s.name}>
          <b>{h.symbol}</b>
          {h.name ? <span> · {h.name}</span> : null}
        </div>
        {hasPrice ? (
          <div className={`${s.price} num`}>
            {price(h.priceCents!)}
            <small>
              {h.changeDayPct !== null ? <span className={h.changeDayPct >= 0 ? "good" : "crit"}>{signedPct(h.changeDayPct)} today</span> : null}
              {h.impliedShares !== null ? <span> · ≈ {h.impliedShares.toFixed(1)} shares</span> : null}
              {h.priceAsOf ? <span className={s.asOf}> · close {h.priceAsOf.slice(5).replace("-", "/")}</span> : null}
            </small>
          </div>
        ) : null}
      </div>
      <div className={s.value}>
        <div className={`${s.valueFig} num`}>{money(h.valueCents)}</div>
        <small>{Math.round(h.weightPct)}% of portfolio</small>
      </div>
      {hasPrice && h.priceSeries.length > 1 ? (
        <div className={s.spark}>
          <Sparkline points={h.priceSeries} ariaLabel={`${h.symbol} price, three months`} width={260} height={56} baseline={false} />
          <small>
            3 months{h.change3mPct !== null ? <> · <span className={h.change3mPct >= 0 ? "good" : "crit"}>{signedPct(h.change3mPct)}</span></> : null}
          </small>
        </div>
      ) : null}
    </div>
  );
}
