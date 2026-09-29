"use client";

import { useEffect, useState } from "react";
import { AdvisorChat } from "./AdvisorChat";
import type { Thread } from "@/lib/threads";
import s from "./ChatDock.module.css";

export function ChatDock({ prompts, brief }: { prompts: string[]; brief: string | null }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);

  useEffect(() => {
    if (!open || threads) return;
    fetch("/api/threads")
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((j) => setThreads(j.threads ?? []))
      .catch(() => setThreads([]));
  }, [open, threads]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className={s.fab} onClick={() => setOpen(true)} aria-label="Open advisor chat" hidden={open}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5h16v10H9l-5 4v-14z" />
        </svg>
        <span>Ask Sterling</span>
      </button>
      {open ? (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Sterling">
          <div className={s.panel}>
            <div className={s.head}>
              <span className={s.title}>Sterling</span>
              <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className={s.body}>
              {threads ? <AdvisorChat initialThreads={threads} prompts={prompts} brief={brief} compact /> : <p className={s.loading}>Loading…</p>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
