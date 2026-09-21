"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.brand}>Fiscal <em>Compass</em></h1>
        <p className={styles.lede}>Sign in with a link sent to your email. Only the owner's address is accepted.</p>
        <label className="eyebrow" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
          placeholder="you@example.com"
        />
        <button type="submit" className={styles.button} disabled={state === "sending" || state === "sent"}>
          {state === "sending" ? "Sending…" : state === "sent" ? "Link sent" : "Send sign-in link"}
        </button>
        {state === "sent" ? <p className={styles.note}>Check your inbox and open the link on this device.</p> : null}
        {state === "error" ? <p className={`${styles.note} crit`}>{error}</p> : null}
      </form>
    </main>
  );
}
