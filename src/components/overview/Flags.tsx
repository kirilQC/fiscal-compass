"use client";

import { useState } from "react";
import Link from "next/link";
import type { Insight } from "@/lib/advisor/insights";
import s from "./Flags.module.css";

// What Sterling noticed without being asked: the first thing on the Overview. Each flag hands its question
// to the advisor in one click.

const LABEL: Record<Insight["level"], string> = { alert: "Needs attention", watch: "Keep an eye on", info: "Worth knowing", good: "Going well" };
const SHOW = 6;

export function Flags({ insights }: { insights: Insight[] }) {
  const [all, setAll] = useState(false);
  if (!insights.length) return null;
  const urgent = insights.filter((i) => i.level === "alert" || i.level === "watch");
  const first = all ? insights : insights.slice(0, Math.max(SHOW, Math.min(urgent.length, 9)));
  const alerts = insights.filter((i) => i.level === "alert").length;
  return (
    <section className={s.wrap} aria-labelledby="flags-title">
      <div className={s.head}>
        <div>
          <h2 id="flags-title" className={s.title}>What you need to know</h2>
          <p className={s.sub}>{alerts ? `${alerts} thing${alerts > 1 ? "s" : ""} need${alerts > 1 ? "" : "s"} attention` : "Nothing urgent"} · noticed by Sterling from your accounts this morning</p>
        </div>
        <Link href="/advisor" className={s.ask}>Ask Sterling</Link>
      </div>
      <ul className={s.grid}>
        {first.map((i) => (
          <li key={i.id} className={`${s.card} ${s[i.level]}`}>
            <span className={s.level}>{LABEL[i.level]}</span>
            <strong className={s.t}>{i.title}</strong>
            <p className={s.d}>{i.detail}</p>
            <Link href={`/advisor?q=${encodeURIComponent(i.ask)}`} className={s.more}>Ask Sterling about this →</Link>
          </li>
        ))}
      </ul>
      {insights.length > first.length || all ? (
        <button type="button" className={s.toggle} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${insights.length - first.length} more`}</button>
      ) : null}
    </section>
  );
}
