"use client";

import { useState } from "react";
import type { Question } from "@/lib/advisor/questions";
import s from "./QuestionCards.module.css";

// Sterling's questions, answered in place: the card opens a reply box, and after sending it shows his
// acknowledgement and exactly what he stored in memory. Used on Overview and the Advisor start screen.

type State = { open: boolean; draft: string; busy: boolean; reply?: string; remembered?: string[]; error?: string };

function Card({ q }: { q: Question }) {
  const [st, setSt] = useState<State>({ open: false, draft: "", busy: false });
  async function send() {
    if (!st.draft.trim() || st.busy) return;
    setSt({ ...st, busy: true, error: undefined });
    try {
      const r = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, answer: st.draft }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setSt((c) => ({ ...c, busy: false, error: j.error ?? "Couldn't send that. Try again." }));
      setSt((c) => ({ ...c, busy: false, open: false, reply: j.reply, remembered: j.remembered ?? [] }));
    } catch {
      setSt((c) => ({ ...c, busy: false, error: "Couldn't reach Sterling. Try again." }));
    }
  }
  const done = st.remembered !== undefined;
  return (
    <li className={`${s.card} ${done ? s.done : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static portrait */}
      <img src="/sterling.jpg" alt="" width={34} height={34} className={s.av} />
      <div className={s.main}>
        <span className={s.about}>{q.about}</span>
        <p className={s.q}>{q.text}</p>
        {st.open ? (
          <div className={s.form}>
            <textarea
              autoFocus
              rows={2}
              value={st.draft}
              placeholder="Type your answer…"
              aria-label={`Answer Sterling about ${q.about}`}
              onChange={(e) => setSt({ ...st, draft: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") setSt({ ...st, open: false }); }}
              disabled={st.busy}
            />
            <div className={s.actions}>
              <button type="button" className={s.send} onClick={send} disabled={st.busy || !st.draft.trim()}>{st.busy ? "Sterling is noting that…" : "Send"}</button>
              <button type="button" className={s.cancel} onClick={() => setSt({ ...st, open: false })} disabled={st.busy}>Cancel</button>
            </div>
            {st.error ? <p className={s.error}>{st.error}</p> : null}
          </div>
        ) : null}
        {done ? (
          <div className={s.result}>
            <p className={s.you}><b>You:</b> {st.draft}</p>
            {st.reply ? <p className={s.reply}>{st.reply.replace(/\*\*/g, "")}</p> : null}
            {st.remembered!.map((m) => (
              <div key={m} className={s.mem}><span aria-hidden>+</span><span><b>Sterling stored in memory</b>{m}</span></div>
            ))}
          </div>
        ) : null}
      </div>
      {!st.open && !done ? <button type="button" className={s.answer} onClick={() => setSt({ ...st, open: true })}>Answer</button> : null}
    </li>
  );
}

export function QuestionCards({ questions }: { questions: Question[] }) {
  return <ul className={s.list}>{questions.map((q) => <Card key={q.id} q={q} />)}</ul>;
}
