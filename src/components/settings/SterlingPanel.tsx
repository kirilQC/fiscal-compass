"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/sections/api";
import s from "./Settings.module.css";

export type Memory = { id: string; body: string; created_at: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

// The harness is Kiril's standing brief to Sterling; the facts below it are what Sterling saved from talking
// with him. Both are read before every reply.
export function SterlingPanel({ notes, memories }: { notes: string; memories: Memory[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(notes);
  const [st, setSt] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const [items, setItems] = useState(memories);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState("");
  const [add, setAdd] = useState("");
  const [memErr, setMemErr] = useState<string | null>(null);

  async function saveHarness() {
    setSt({ busy: true });
    const r = await call("/api/settings", "PUT", { notes: draft });
    if (r.ok) { setSt({ busy: false, msg: "Saved. Sterling reads this before every reply." }); router.refresh(); } else setSt({ busy: false, err: r.error });
  }
  async function saveMem(id: string) {
    const r = await call("/api/memory", "PATCH", { id, body: edit });
    if (!r.ok) return setMemErr(r.error);
    setItems((cur) => cur.map((m) => (m.id === id ? { ...m, body: edit.trim() } : m)));
    setEditing(null); setMemErr(null);
  }
  async function remove(id: string) {
    const r = await call("/api/memory", "DELETE", { id });
    if (!r.ok) return setMemErr(r.error);
    setItems((cur) => cur.filter((m) => m.id !== id));
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!add.trim()) return;
    const r = await call<{ memory: Memory }>("/api/memory", "POST", { body: add });
    if (!r.ok) return setMemErr(r.error);
    setItems((cur) => [...cur, r.data.memory]);
    setAdd(""); setMemErr(null);
  }

  return (
    <>
      <div className={s.head}><h2>Sterling</h2><p>the harness you write and the facts Sterling has learned · both are read before every reply</p></div>

      <span className={s.label}>AI harness</span>
      <textarea className={s.harness} value={draft} onChange={(e) => { setDraft(e.target.value); setSt({ busy: false }); }} placeholder="Who you are, your situation, how Sterling should answer." aria-label="AI harness" />
      <div className={s.saveRow}>
        <button type="button" className={s.btn} onClick={saveHarness} disabled={st.busy || draft === notes}>{st.busy ? "Saving…" : "Save harness"}</button>
        {draft !== notes && !st.busy ? <button type="button" className={s.link} onClick={() => setDraft(notes)}>Discard changes</button> : null}
        <span className={s.hint}>{draft.length.toLocaleString()} characters</span>
        {st.msg ? <span className={s.ok}>{st.msg}</span> : null}
        {st.err ? <span className={s.err}>{st.err}</span> : null}
      </div>

      <span className={s.label} style={{ marginTop: 14 }}>What Sterling knows about you · {items.length}</span>
      {items.length === 0 ? <p className={s.hint}>Nothing yet. Answer one of Sterling&apos;s questions, or tell him what a charge is, and he&apos;ll note it here.</p> : (
        <div className={s.mems}>
          {items.map((m) => (
            <div className={s.mem} key={m.id}>
              {editing === m.id ? (
                <>
                  <textarea className={s.input} value={edit} onChange={(e) => setEdit(e.target.value)} rows={2} aria-label="Edit fact" />
                  <span className={s.memBtns}><button type="button" onClick={() => saveMem(m.id)}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></span>
                </>
              ) : (
                <>
                  <span>{m.body}<small>learned {day(m.created_at)}</small></span>
                  <span className={s.memBtns}><button type="button" onClick={() => { setEditing(m.id); setEdit(m.body); }}>Edit</button><button type="button" onClick={() => remove(m.id)} aria-label={`Forget: ${m.body}`}>Forget</button></span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <form className={s.memAdd} onSubmit={create}>
        <input className={s.input} value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Tell Sterling something to remember" aria-label="Add a fact" />
        <button type="submit" className={s.btn2} disabled={!add.trim()}>Add</button>
      </form>
      {memErr ? <p className={s.err}>{memErr}</p> : null}
    </>
  );
}
