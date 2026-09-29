"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/threads";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import type { Insight } from "@/lib/advisor/insights";
import styles from "./AdvisorChat.module.css";

type Props = { initialThreads: Thread[]; prompts: string[]; brief: string | null; initialQuery?: string | null; insights?: Insight[] };

// Tool status lines arrive inside the text stream between these markers (see /api/chat).
const STATUS_RE = /\u001e([^\u001f]*)\u001f/g;
function splitStream(raw: string): { text: string; status: string | null } {
  let status: string | null = null;
  let lastEnd = 0;
  for (const m of raw.matchAll(STATUS_RE)) { status = m[1]; lastEnd = (m.index ?? 0) + m[0].length; }
  const text = raw.replace(STATUS_RE, "");
  // A status stays visible only until new reply text arrives after it.
  if (status && raw.slice(lastEnd).trim()) status = null;
  return { text, status };
}
const LEVEL_LABEL: Record<Insight["level"], string> = { alert: "Needs attention", watch: "Keep an eye on", info: "Worth knowing", good: "Going well" };

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AdvisorChat({ initialThreads, prompts, initialQuery = null, insights = [] }: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  // Always open on a fresh page led by the insights; past conversations are one click away.
  const [activeId, setActiveId] = useState<string | null>(null);
  const queryFired = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bootstrapped = useRef(new Set<string>());

  const refreshThreads = useCallback(async () => {
    const r = await fetch("/api/threads");
    if (r.ok) setThreads((await r.json()).threads);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/threads/${activeId}`);
      if (!r.ok || cancelled) return;
      const data = await r.json();
      if (cancelled) return;
      setMessages(data.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

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
        const { text, status: st } = splitStream(acc);
        setStatus(st);
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: text } : x)));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: `Couldn't reach the advisor: ${msg}` } : x)));
    } finally {
      setBusy(false);
      setStatus(null);
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

  useEffect(() => {
    if (!initialQuery || queryFired.current) return;
    queryFired.current = true;
    send(initialQuery);
    window.history.replaceState(null, "", "/advisor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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
            insights.length ? (
              <section className={styles.insights} aria-label="What you need to know">
                <h2 className={styles.insightsTitle}>What you need to know</h2>
                <ul className={styles.insightList}>
                  {insights.map((i) => (
                    <li key={i.id} className={`${styles.insight} ${styles[`lv_${i.level}`]}`}>
                      <span className={styles.level}>{LEVEL_LABEL[i.level]}</span>
                      <strong className={styles.insightHead}>{i.title}</strong>
                      <p className={styles.insightBody}>{i.detail}</p>
                      <button type="button" className={styles.askBtn} onClick={() => send(i.ask)}>Ask about this</button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className={styles.empty}>Ask anything about your money. The advisor can search every transaction, compare months, and check your bills and accounts.</p>
            )
          ) : null}
          {messages.map((m) => (
            <article key={m.id} className={m.role === "user" ? styles.me : styles.ai}>
              <span className={styles.who}>{m.role === "user" ? "You" : "Advisor"}</span>
              <div className={styles.body}>
                {m.role === "assistant" ? (
                  m.content ? (
                    <>
                      <AdvisorMarkdown text={m.content} />
                      {busy && status && m.id === messages[messages.length - 1]?.id ? <span className={styles.thinking}>{status}…</span> : null}
                    </>
                  ) : <span className={styles.thinking}>{busy && m.id === messages[messages.length - 1]?.id && status ? `${status}…` : "Thinking…"}</span>
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
