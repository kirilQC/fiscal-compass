"use client";

import { useEffect, useState, type ReactNode } from "react";
import { geist } from "@/components/sterlingFont";
import s from "./Settings.module.css";

export type Tab = { id: string; label: string; summary: string; panel: ReactNode };

// Side menu of sections, one panel at a time. The open tab rides in the URL hash so a reload keeps it.
export function SettingsShell({ tabs }: { tabs: Tab[] }) {
  const [open, setOpen] = useState(tabs[0].id);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash is only readable after mount
    if (tabs.some((t) => t.id === h)) setOpen(h);
  }, [tabs]);
  function pick(id: string) {
    setOpen(id);
    history.replaceState(null, "", `#${id}`);
  }
  const current = tabs.find((t) => t.id === open) ?? tabs[0];
  return (
    <div className={`${s.page} ${geist.variable}`}>
      <nav className={s.nav} role="tablist" aria-label="Settings sections">
        <h1>Settings</h1>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={t.id === current.id} aria-controls={`panel-${t.id}`} className={s.tab} onClick={() => pick(t.id)}>
            {t.label}<small>{t.summary}</small>
          </button>
        ))}
      </nav>
      <section className={s.panel} role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
        {current.panel}
      </section>
    </div>
  );
}
