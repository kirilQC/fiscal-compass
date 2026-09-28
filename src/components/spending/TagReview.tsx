"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/sections/api";
import { dateLabel, money, moneyExact, prettyMerchant } from "@/lib/format";
import type { SpendClass } from "@/lib/spend";
import type { PlanSuggestion, Review, ReviewGroup } from "@/app/api/transactions/review/route";
import s from "./SpendingPage.module.css";
import { MerchantCell } from "@/components/MerchantLogo";

const SHOW = 5;

function Groups({ groups, busy, onTag, keepLabel }: { groups: ReviewGroup[]; busy: string | null; onTag: (g: ReviewGroup, c: SpendClass) => void; keepLabel?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, SHOW);
  return (
    <>
      <ul className={s.reviewList}>
        {shown.map((g) => (
          <li key={g.key} className={s.reviewRow}>
            <MerchantCell src={g.logoUrl} name={prettyMerchant(g.merchant)} category={g.category} size={32}>
              <div className={s.muted} style={{ marginLeft: 0 }}>
                {g.category} · {g.count > 1 ? `${g.count} charges · ` : ""}{money(g.totalCents)} · last {dateLabel(g.lastOn)}
              </div>
            </MerchantCell>
            <div className={s.reviewBtns}>
              <button type="button" className={s.spendTag} disabled={busy === g.key} onClick={() => onTag(g, "essential")}>Essential</button>
              <button type="button" className={`${s.spendTag} ${s.disc}`} disabled={busy === g.key} onClick={() => onTag(g, "discretionary")}>{keepLabel ?? "Discretionary"}</button>
            </div>
          </li>
        ))}
      </ul>
      {groups.length > SHOW ? <button type="button" className={s.more} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${groups.length}`}</button> : null}
    </>
  );
}

// Everything the app wants Kiril to confirm. Each answer clears the item and teaches future charges.
export function TagReview({ onChanged, refreshKey }: { onChanged: () => void; refreshKey: number }) {
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transactions/review")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setReview(j && Array.isArray(j.untagged) ? j : { suggestions: [], verify: [], untagged: [] }))
      .catch(() => setReview({ suggestions: [], verify: [], untagged: [] }));
  }, [refreshKey]);

  const done = () => {
    onChanged();
    router.refresh();
  };

  async function tag(list: "verify" | "untagged", g: ReviewGroup, spendClass: SpendClass) {
    setBusy(g.key);
    setErr(null);
    const r = await call("/api/transactions/tag", "POST", { ids: g.ids, spendClass });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    setReview((cur) => cur && { ...cur, [list]: cur[list].filter((x) => x.key !== g.key) });
    done();
  }

  // Yes teaches the expense this merchant; No records what the charge actually was.
  async function answer(sg: PlanSuggestion, no?: SpendClass) {
    setBusy(sg.txnId);
    setErr(null);
    const r = no
      ? await call("/api/transactions/tag", "POST", { ids: [sg.txnId], spendClass: no })
      : await call("/api/plan/learn", "POST", { planItemId: sg.planItemId, merchant: sg.merchant });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    setReview((cur) => cur && { ...cur, suggestions: cur.suggestions.filter((x) => x.txnId !== sg.txnId) });
    done();
  }

  if (!review) return null;
  const { suggestions, verify, untagged } = review;
  if (!suggestions.length && !verify.length && !untagged.length) return null;

  return (
    <section className={s.review} aria-label="Transactions to review">
      {suggestions.length ? (
        <div className={s.reviewBlock}>
          <h2 className={s.h2}>Is this an essential?</h2>
          <p className={s.lede}>charges that look like a bill you have not paid yet this month</p>
          <ul className={s.reviewList}>
            {suggestions.map((sg) => (
              <li key={sg.txnId} className={s.reviewRow}>
                <MerchantCell src={sg.logoUrl} name={`${prettyMerchant(sg.merchant)} · ${moneyExact(sg.amountCents)}`} category={sg.category} size={32}>
                  <div className={s.muted} style={{ marginLeft: 0 }}>{dateLabel(sg.postedOn)} · looks like <b>{sg.planItemName}</b> ({money(sg.expectedCents)} expected)</div>
                </MerchantCell>
                <div className={s.reviewBtns}>
                  <button type="button" className={s.spendTag} disabled={busy === sg.txnId} onClick={() => answer(sg)}>Yes, {sg.planItemName}</button>
                  <button type="button" className={`${s.spendTag} ${s.untagged}`} disabled={busy === sg.txnId} onClick={() => answer(sg, "essential")}>No · other essential</button>
                  <button type="button" className={`${s.spendTag} ${s.untagged}`} disabled={busy === sg.txnId} onClick={() => answer(sg, "discretionary")}>No · discretionary</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {verify.length ? (
        <div className={s.reviewBlock}>
          <h2 className={s.h2}>Confirm Zelle &amp; Cash App</h2>
          <p className={s.lede}>counted as discretionary · switch any that were really a bill</p>
          <Groups groups={verify} busy={busy} onTag={(g, c) => tag("verify", g, c)} keepLabel="Discretionary ✓" />
        </div>
      ) : null}
      {untagged.length ? (
        <div className={s.reviewBlock}>
          <h2 className={s.h2}>Needs a tag</h2>
          <p className={s.lede}>{untagged.length} merchant{untagged.length === 1 ? "" : "s"} · {money(untagged.reduce((t, g) => t + g.totalCents, 0))} not counted until you choose</p>
          <Groups groups={untagged} busy={busy} onTag={(g, c) => tag("untagged", g, c)} />
        </div>
      ) : null}
      {err ? <p className="crit" style={{ fontSize: 12.5 }}>{err}</p> : null}
    </section>
  );
}
