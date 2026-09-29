"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/lib/advisor/questions";
import s from "./Flags.module.css";

// Sterling's questions for Kiril, right under what he flagged: short answers that make the numbers truer.
export function Questions({ questions: initial }: { questions: Question[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  if (!questions.length) return null;
  async function answer(q: Question) {
    setBusy(q.id);
    const r = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id }) });
    setBusy(null);
    setQuestions((cur) => cur.filter((x) => x.id !== q.id));
    if (r.ok) router.push(`/advisor?t=${(await r.json()).threadId}`);
  }
  return (
    <section className={s.wrap} aria-labelledby="questions-title">
      <div className={s.head}>
        <div>
          <h2 id="questions-title" className={s.title}>Sterling has a few questions</h2>
          <p className={s.sub}>a quick answer from you makes the numbers, and his advice, more accurate · he remembers what you tell him</p>
        </div>
      </div>
      <ul className={s.qgrid}>
        {questions.map((q) => (
          <li key={q.id} className={s.qcard}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static portrait */}
            <img src="/sterling.jpg" alt="" width={34} height={34} className={s.qav} />
            <div>
              <span className={s.level} style={{ color: "var(--accent)" }}>{q.about}</span>
              <p className={s.qtext}>{q.text}</p>
            </div>
            <button type="button" className={s.qbtn} onClick={() => answer(q)} disabled={busy === q.id}>{busy === q.id ? "Opening…" : "Answer"}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
