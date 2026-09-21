"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/threads";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import styles from "./AdvisorChat.module.css";

type Props = { initialThreads: Thread[]; prompts: string[]; brief: string | null };

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AdvisorChat({ initialThreads, prompts, brief }: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bootstrapped = useRef(new Set<string>());

  const refreshThreads = useCallback(async () => {
    const r = await fetch("/api/threads");
    if (r.ok) setThreads((await r.json()).threads);
  }, []);

  const openBrief = useCallback(
    async (threadId: string) => {
      if (bootstrapped.current.has(threadId)) return;
      bootstrapped.current.add(threadId);
      setBusy(true);
      const tempId = `brief-${threadId}`;
      setMessages([{ id: tempId, role: "assistant", content: brief ?? "", createdAt: new Date().toISOString() }]);
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, brief: true }),
      });
      const text = r.ok ? await r.text() : brief ?? "";
      setMessages([{ id: tempId, role: "assistant", content: text, createdAt: new Date().toISOString() }]);
      setBusy(false);
    },
    [brief],
  );

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/threads/${activeId}`);
      if (!r.ok || cancelled) return;
      const data = await r.json();
      if (cancelled) return;
      if (data.messages.length === 0) await openBrief(activeId);
      else setMessages(data.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, openBrief]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function newThread() {
    const r = await fetch("/api/threads", { method: "POST" });
    if (!r.ok) return;
    const { thread } = await r.json();
    setThreads((t) => [thread, ...t]);
    setMessages([]);
    setActiveId(thread.id);
    setListOpen(false);
  }

  async function removeThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    const rest = threads.filter((t) => t.id !== id);
    setThreads(rest);
    if (activeId === id) {
      setActiveId(rest[0]?.id ?? null);
      setMessages([]);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    let threadId = activeId;
    if (!threadId) {
      const r = await fetch("/api/threads", { method: "POST" });
      if (!r.ok) return;
      const { thread } = await r.json();
      threadId = thread.id;
      setThreads((t) => [thread, ...t]);
      setActiveId(thread.id);
      bootstrapped.current.add(thread.id);
    }
    setDraft("");
    setBusy(true);
    const now = new Date().toISOString();
    const userMsg: Message = { id: `u-${now}`, role: "user", content, createdAt: now };
    const asstId = `a-${now}`;
    setMessages((m) => [...m, userMsg, { id: asstId, role: "assistant", content: "", createdAt: now }]);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: content }),
      });
      if (!r.ok || !r.body) throw new Error(`Request failed (${r.status})`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: acc } : x)));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: `Couldn't reach the advisor: ${msg}` } : x)));
    } finally {
      setBusy(false);
      refreshThreads();
      textareaRef.current?.focus();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const showChips = messages.filter((m) => m.role === "user").length === 0 && !busy;

  return (
    <main className={`wrap ${styles.page}`}>
      <aside className={`${styles.threads} ${listOpen ? styles.threadsOpen : ""}`}>
        <div className={styles.threadsHead}>
          <span className="eyebrow">Conversations</span>
          <button type="button" className={styles.newBtn} onClick={newThread}>New conversation</button>
        </div>
        <ul className={styles.threadList}>
          {threads.map((t) => (
            <li key={t.id} className={t.id === activeId ? styles.threadActive : undefined}>
              <button type="button" className={styles.threadBtn} onClick={() => { setActiveId(t.id); setListOpen(false); }}>
                <span className={styles.threadTitle}>{t.title}</span>
                <span className={styles.threadTime}>{relTime(t.updatedAt)}</span>
              </button>
              <button type="button" className={styles.threadDel} aria-label={`Delete ${t.title}`} onClick={() => removeThread(t.id)}>×</button>
            </li>
          ))}
          {threads.length === 0 ? <li className={styles.threadEmpty}>No conversations yet.</li> : null}
        </ul>
      </aside>

      <section className={styles.thread}>
        <div className={styles.mobileBar}>
          <button type="button" className={styles.mobileToggle} onClick={() => setListOpen((o) => !o)}>
            {listOpen ? "Hide conversations" : "Conversations"}
          </button>
          <button type="button" className={styles.newBtn} onClick={newThread}>New</button>
        </div>

        <div className={styles.messages}>
          {messages.length === 0 && !busy ? (
            <p className={styles.empty}>Ask anything about your money. The advisor sees every account, your budget, and your goals.</p>
          ) : null}
          {messages.map((m) => (
            <article key={m.id} className={m.role === "user" ? styles.me : styles.ai}>
              <span className={styles.who}>{m.role === "user" ? "You" : "Advisor"}</span>
              <div className={styles.body}>
                {m.role === "assistant" ? (
                  m.content ? <AdvisorMarkdown text={m.content} /> : <span className={styles.thinking}>Thinking…</span>
                ) : (
                  m.content
                )}
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className={styles.composerWrap}>
          {showChips ? (
            <div className={styles.chips}>
              {prompts.map((p) => (
                <button key={p} type="button" onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          ) : null}
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              id="advisor-composer"
              ref={textareaRef}
              rows={1}
              value={draft}
              placeholder="Ask anything about your money"
              aria-label="Message the advisor"
              onChange={(e) => {
                setDraft(e.target.value);
                autoGrow(e.target);
              }}
              onKeyDown={onKey}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !draft.trim()}>Ask</button>
          </form>
        </div>
      </section>
    </main>
  );
}
