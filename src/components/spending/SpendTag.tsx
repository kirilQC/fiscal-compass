"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/sections/api";
import type { SpendClass } from "@/lib/spend";
import s from "./SpendingPage.module.css";

// One click flips essential ↔ discretionary; the choice is saved on the transaction and never overwritten.
export function SpendTag({ id, value, onChange }: { id: string; value: SpendClass; onChange?: (next: SpendClass) => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);

  async function flip() {
    const next: SpendClass = current === "essential" ? "discretionary" : "essential";
    setCurrent(next);
    setBusy(true);
    const r = await call(`/api/transactions/${id}`, "PATCH", { spendClass: next });
    setBusy(false);
    if (!r.ok) setCurrent(current);
    else {
      onChange?.(next);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className={`${s.spendTag} ${current === "discretionary" ? s.disc : ""}`}
      onClick={flip}
      disabled={busy}
      title="Click to switch between essential and discretionary"
    >
      {current === "essential" ? "Essential" : "Discretionary"}
    </button>
  );
}
