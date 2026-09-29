"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";

export function LinkAccountButton({ label = "Link a bank account", className }: { label?: string; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function link() {
    setState("working");
    setError(null);
    try {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!key) throw new Error("Stripe publishable key is not configured");
      const stripe = await loadStripe(key);
      if (!stripe) throw new Error("Stripe.js failed to load");
      const res = await fetch("/api/stripe/session", { method: "POST" });
      const { clientSecret, error: e1 } = await res.json();
      if (!res.ok || !clientSecret) throw new Error(e1 ?? "Could not start Stripe session");
      const result = await stripe.collectFinancialConnectionsAccounts({ clientSecret });
      if (result.error) throw new Error(result.error.message);
      const session = result.financialConnectionsSession;
      if (!session || session.accounts.length === 0) {
        setState("idle");
        return;
      }
      const linkRes = await fetch("/api/stripe/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      if (!linkRes.ok) throw new Error((await linkRes.json()).error ?? "Could not save accounts");
      setState("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <span style={{ display: "inline-grid", gap: 6 }}>
      <button
        type="button"
        onClick={link}
        disabled={state === "working"}
        className={className}
        style={className ? undefined : {
          padding: "9px 16px",
          border: "1px solid var(--ink)",
          fontSize: 13,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: state === "working" ? 0.5 : 1,
        }}
      >
        {state === "working" ? "Connecting…" : label}
      </button>
      {error ? <span className="crit" style={{ fontSize: 13 }}>{error}</span> : null}
    </span>
  );
}
