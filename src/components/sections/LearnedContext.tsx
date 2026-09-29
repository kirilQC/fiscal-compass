"use client";

import { useEffect, useState } from "react";
import { call } from "./api";
import s from "./sections.module.css";

type Memory = { id: string; body: string; created_at: string };

// What the advisor has learned from conversations. It sits under the harness: the harness is Kiril's,
// this list is the advisor's, and both are read before every reply.
export function LearnedContext() {
  const [items, setItems] = useState<Memory[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [add, setAdd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/memory").then((r) => (r.ok ? r.json() : { memories: [] })).then((j) => setItems(j.memories ?? [])).catch(() => setItems([]));
  }, []);

  async function save(id: string) {
    const r = await call("/api/memory", "PATCH", { id, body: draft });
    if (!r.ok) return setErr(r.error);
    setItems((cur) => (cur ?? []).map((m) => (m.id === id ? { ...m, body: draft.trim() } : m)));
    setEditing(null); setErr(null);
  }
  async function remove(id: string) {
    const r = await call("/api/memory", "DELETE", { id });
    if (!r.ok) return setErr(r.error);
    setItems((cur) => (cur ?? []).filter((m) => m.id !== id));
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!add.trim()) return;
    const r = await call<{ memory: Memory }>("/api/memory", "POST", { body: add });
    if (!r.ok) return setErr(r.error);
    setItems((cur) => [...(cur ?? []), r.data.memory]);
    setAdd(""); setErr(null);
  }

  return (
    <div className={s.learned}>
      <div className={s.learnedHead}>
        <label>Learned context</label>
        <span className={s.hint}>added by the advisor as you talk · read before every reply</span>
      </div>
      {items === null ? <p className={s.hint}>Loading…</p> : items.length === 0 ? <p className={s.hint}>Nothing yet. Tell the advisor what a charge is, a goal, or a life change and it will note it here.</p> : null}
      <ul className={s.learnedList}>
        {(items ?? []).map((m) => (
          <li key={m.id}>
            {editing === m.id ? (
              <>
                <textarea className={`${s.input} ${s.learnedEdit}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label="Edit learned fact" />
                <span className={s.learnedBtns}><button type="button" onClick={() => save(m.id)}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></span>
              </>
            ) : (
              <>
                <span className={s.learnedBody}>{m.body}<small>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span>
                <span className={s.learnedBtns}><button type="button" onClick={() => { setEditing(m.id); setDraft(m.body); }}>Edit</button><button type="button" onClick={() => remove(m.id)} aria-label={`Delete: ${m.body}`}>Delete</button></span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className={s.learnedAdd} onSubmit={create}>
        <input className={s.input} value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add something the advisor should know" aria-label="Add a learned fact" />
        <button type="submit" disabled={!add.trim()}>Add</button>
      </form>
      {err ? <p className="crit" style={{ fontSize: 12.5 }}>{err}</p> : null}
    </div>
  );
}
