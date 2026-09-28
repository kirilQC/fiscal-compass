"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/sections/api";
import type { SpendClass, Tag } from "@/lib/spend";
import s from "./SpendingPage.module.css";

// Essential ↔ discretionary in one click; an untagged charge offers both. The choice is saved and never overwritten.
export function SpendTag({ id, value, onChange }: { id: string; value: Tag; onChange?: (next: SpendClass) => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Tag>(value);
  const [busy, setBusy] = useState(false);

  async function set(next: SpendClass) {
    const prev = current;
    setCurrent(next);
    setBusy(true);
    const r = await call(`/api/transactions/${id}`, "PATCH", { spendClass: next });
    setBusy(false);
    if (!r.ok) setCurrent(prev);
    else {
      onChange?.(next);
      router.refresh();
    }
  }

  if (current === "untagged") {
    return (
      <span className={s.reviewBtns}>
        <button type="button" className={`${s.spendTag} ${s.untagged}`} disabled={busy} onClick={() => set("essential")}>Essential</button>
        <button type="button" className={`${s.spendTag} ${s.untagged}`} disabled={busy} onClick={() => set("discretionary")}>Discretionary</button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${s.spendTag} ${current === "discretionary" ? s.disc : ""}`}
      onClick={() => set(current === "essential" ? "discretionary" : "essential")}
      disabled={busy}
      title="Click to switch between essential and discretionary"
    >
      {current === "essential" ? "Essential" : "Discretionary"}
    </button>
  );
}
