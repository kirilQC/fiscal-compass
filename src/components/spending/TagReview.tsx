"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/sections/api";
import { dateLabel, money, prettyMerchant } from "@/lib/format";
import type { SpendClass } from "@/lib/spend";
import type { UntaggedGroup } from "@/app/api/transactions/untagged/route";
import s from "./SpendingPage.module.css";

const SHOW = 6;

// Charges the app could not tag on its own. Tagging a merchant clears every charge from it and teaches future ones.
export function TagReview({ onTagged }: { onTagged: () => void }) {
  const router = useRouter();
  const [groups, setGroups] = useState<UntaggedGroup[] | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transactions/untagged")
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setGroups(Array.isArray(j) ? j : []))
      .catch(() => setGroups([]));
  }, []);

  async function tag(g: UntaggedGroup, spendClass: SpendClass) {
    setBusy(g.key);
    setErr(null);
    const r = await call("/api/transactions/tag", "POST", { ids: g.ids, spendClass });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    setGroups((cur) => (cur ?? []).filter((x) => x.key !== g.key));
    onTagged();
    router.refresh();
  }

  if (!groups?.length) return null;
  const shown = all ? groups : groups.slice(0, SHOW);
  const totalCents = groups.reduce((t, g) => t + g.totalCents, 0);

  return (
    <section className={s.review} aria-label="Transactions to tag">
      <div className={s.reviewHead}>
        <h2 className={s.h2}>Needs a tag</h2>
        <p className={s.lede}>
          {groups.length} merchant{groups.length === 1 ? "" : "s"} · {money(totalCents)} not counted as essential or discretionary until you choose
        </p>
      </div>
      <ul className={s.reviewList}>
        {shown.map((g) => (
          <li key={g.key} className={s.reviewRow}>
            <div>
              <div className={s.reviewName}>{prettyMerchant(g.merchant)}</div>
              <div className={s.muted} style={{ marginLeft: 0 }}>
                {g.category} · {g.count > 1 ? `${g.count} charges · ` : ""}{money(g.totalCents)} · last {dateLabel(g.lastOn)}
              </div>
            </div>
            <div className={s.reviewBtns}>
              <button type="button" className={s.spendTag} disabled={busy === g.key} onClick={() => tag(g, "essential")}>Essential</button>
              <button type="button" className={`${s.spendTag} ${s.disc}`} disabled={busy === g.key} onClick={() => tag(g, "discretionary")}>Discretionary</button>
            </div>
          </li>
        ))}
      </ul>
      {groups.length > SHOW ? (
        <button type="button" className={s.more} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${groups.length}`}</button>
      ) : null}
      {err ? <p className="crit" style={{ fontSize: 12.5 }}>{err}</p> : null}
    </section>
  );
}
