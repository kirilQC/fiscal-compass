"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/threads";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import type { Question } from "@/lib/advisor/questions";
import { QuestionCards } from "./QuestionCards";
import { geist } from "./sterlingFont";
import styles from "./AdvisorChat.module.css";

// Sterling's page ("Briefing room"): conversations and what Sterling has learned on the left, the answer
// across the rest. Today's flags live on the Overview page.

type Memory = { id: string; body: string; created_at: string };
type Props = {
  initialThreads: Thread[];
  prompts: string[];
  brief?: string | null;
  initialQuery?: string | null;
  memories?: Memory[];
  questions?: Question[];
  compact?: boolean; // the overview's pop-up dock: no side panes
  initialThreadId?: string | null; // /advisor?t=… opens that conversation
};

// Tool status lines arrive inside the stream between these markers (see /api/chat); saved replies carry their
// step list up front between the steps marker.
const STATUS_RE = /\u001e([^\u001f]*)\u001f/g;
const STEPS_RE = /^\u001d([^\u001d]*)\u001d/;
const WORKING = "Looking at your numbers";

function parseStream(raw: string): { text: string; steps: string[] } {
  const steps: string[] = [];
  for (const m of raw.matchAll(STATUS_RE)) if (m[1] !== WORKING && !steps.includes(m[1])) steps.push(m[1]);
  return { text: raw.replace(STATUS_RE, ""), steps };
}
function parseSaved(content: string): { text: string; steps: string[] } {
  const m = content.match(STEPS_RE);
  if (!m) return { text: content, steps: [] };
  try { return { text: content.slice(m[0].length), steps: JSON.parse(m[1]) as string[] }; } catch { return { text: content.slice(m[0].length), steps: [] }; }
}

// The first paragraph is the verdict; a closing "Do this:" line is the action.
function splitAnswer(text: string) {
  const t = text.trim();
  const firstBreak = t.search(/\n\n/);
  const hasChartFirst = t.startsWith("```chart");
  const verdict = firstBreak > 0 && !hasChartFirst ? t.slice(0, firstBreak) : "";
  let body = verdict ? t.slice(firstBreak).trim() : t;
  let action = "";
  const m = body.match(/(?:^|\n\n)\**(?:do this|action|one action|recommended action)\**:\**\s*([\s\S]+)$/i);
  if (m && !/```chart/.test(m[1])) { action = m[1].trim(); body = body.slice(0, m.index).trim(); }
  return { verdict, body, action };
}


function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ size = 34 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static portrait
  return <img src="/sterling.jpg" alt="Sterling" width={size} height={size} className={styles.avatar} style={{ width: size, height: size }} />;
}

const REMEMBERED = "Remembered: ", FORGOT = "Forgot: ";

function Answer({ content, liveSteps, working }: { content: string; liveSteps?: string[]; working?: boolean }) {
  const saved = parseSaved(content);
  const all = liveSteps ?? saved.steps;
  const memoryNotes = all.filter((s) => s.startsWith(REMEMBERED) || s.startsWith(FORGOT));
  const steps = all.filter((s) => !memoryNotes.includes(s));
  const { verdict, body, action } = splitAnswer(saved.text);
  return (
    <div className={styles.answer}>
      {steps.length ? (
        <div className={styles.trace}>
          {steps.map((s, i, arr) => (
            <span key={s} className={working && i === arr.length - 1 && !saved.text.trim() ? styles.stepLive : undefined}>{s}</span>
          ))}
        </div>
      ) : null}
      {!saved.text.trim() ? <span className={styles.thinking}><span className={styles.dots}><i /><i /><i /></span>{working ? (steps.at(-1) ?? WORKING) : ""}</span> : null}
      {verdict ? <div className={styles.verdict}><AdvisorMarkdown text={verdict} /></div> : null}
      {body ? <div className={styles.body}><AdvisorMarkdown text={body} /></div> : null}
      {action ? <div className={styles.action}><strong>Do this</strong><span><AdvisorMarkdown text={action} /></span></div> : null}
      {memoryNotes.map((n) => {
        const forgot = n.startsWith(FORGOT);
        return (
          <div key={n} className={`${styles.memNote} ${forgot ? styles.memForgot : ""}`}>
            <span className={styles.memIcon} aria-hidden>{forgot ? "−" : "+"}</span>
            <span><b>{forgot ? "Sterling removed from memory" : "Sterling stored in memory"}</b>{n.slice(forgot ? FORGOT.length : REMEMBERED.length)}</span>
            <a href="/settings">View</a>
          </div>
        );
      })}
    </div>
  );
}

export function AdvisorChat({ initialThreads, prompts, initialQuery = null, questions: initialQuestions = [], compact = false, initialThreadId = null }: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreadId);
  const queryFired = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const questions = initialQuestions;
  const bottomRef = useRef<HTMLDivElement>(null);
  // A conversation created by send() has nothing saved yet; loading it would wipe the message on screen.
  const justCreated = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshThreads = useCallback(async () => {
    const r = await fetch("/api/threads");
    if (r.ok) setThreads((await r.json()).threads);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    if (justCreated.current === activeId) { justCreated.current = null; return; }
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/threads/${activeId}`);
      if (!r.ok || cancelled) return;
      const data = await r.json();
      if (!cancelled) setMessages(data.messages);
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function newThread() {
    setActiveId(null);
    setMessages([]);
    setListOpen(false);
    textareaRef.current?.focus();
  }

  async function removeThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    setThreads((t) => t.filter((x) => x.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
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
      justCreated.current = thread.id;
      setThreads((t) => [thread, ...t]);
      setActiveId(thread.id);
    }
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBusy(true);
    setLiveSteps([]);
    const now = new Date().toISOString();
    const asstId = `a-${now}`;
    setMessages((m) => [...m, { id: `u-${now}`, role: "user", content, createdAt: now }, { id: asstId, role: "assistant", content: "", createdAt: now }]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId, message: content }) });
      if (!r.ok || !r.body) throw new Error(`Request failed (${r.status})`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const { text: t, steps } = parseStream(acc);
        setLiveSteps(steps);
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: t } : x)));
      }
      const { steps } = parseStream(acc);
      if (steps.length) setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: `\u001d${JSON.stringify(steps)}\u001d${x.content}` } : x)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: `I couldn't finish that: ${msg}. Try asking again.` } : x)));
    } finally {
      setBusy(false);
      setLiveSteps([]);
      refreshThreads();
      textareaRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!initialQuery || queryFired.current) return;
    queryFired.current = true;
    send(initialQuery);
    window.history.replaceState(null, "", "/advisor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const empty = messages.length === 0 && !busy;
  const lastId = messages[messages.length - 1]?.id;

  return (
    <main className={`${styles.page} ${compact ? styles.compact : ""} ${geist.variable}`}>
      {!compact ? (
        <aside className={`${styles.left} ${listOpen ? styles.leftOpen : ""}`}>
          <div className={styles.brand}><Avatar size={30} /><span><b>Sterling</b><small>your financial advisor</small></span></div>
          <button type="button" className={styles.newBtn} onClick={newThread}>+ New conversation</button>
          <ul className={styles.convs}>
            {threads.map((t) => (
              <li key={t.id} className={t.id === activeId ? styles.convOn : undefined}>
                <button type="button" className={styles.convBtn} onClick={() => { setActiveId(t.id); setListOpen(false); }}>
                  <span>{t.title}</span><small>{relTime(t.updatedAt)}</small>
                </button>
                <button type="button" className={styles.convDel} aria-label={`Delete ${t.title}`} onClick={() => removeThread(t.id)}>×</button>
              </li>
            ))}
            {threads.length === 0 ? <li className={styles.convEmpty}>No conversations yet.</li> : null}
          </ul>
        </aside>
      ) : null}

      <section className={styles.center}>
        {!compact ? (
          <div className={styles.mobileBar}>
            <button type="button" onClick={() => setListOpen((o) => !o)}>{listOpen ? "Hide conversations" : "Conversations"}</button>
            <button type="button" onClick={newThread}>New</button>
          </div>
        ) : null}
        <div className={styles.thread}>
          {empty ? (
            <div className={styles.hello}>
              <Avatar size={64} />
              <h1>Hi Kiril. What do you want to know?</h1>
              <p>I can search every transaction, compare months, check your bills and accounts, and draw it out when a picture helps.</p>
              <div className={styles.starters}>
                {prompts.slice(0, 4).map((p) => <button key={p} type="button" onClick={() => send(p)}>{p}</button>)}
              </div>
              {questions.length ? (
                <div className={styles.qs}>
                  <h2>I have a few questions for you</h2>
                  <QuestionCards questions={questions} />
                </div>
              ) : null}
            </div>
          ) : null}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className={styles.me}>{m.content}</div>
            ) : (
              <div key={m.id} className={styles.ai}>
                <Avatar />
                <Answer content={m.content} liveSteps={busy && m.id === lastId ? liveSteps : undefined} working={busy && m.id === lastId} />
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
        <form className={styles.compose} onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <textarea
            id="advisor-composer"
            ref={textareaRef}
            rows={1}
            value={draft}
            placeholder="Ask Sterling about your money…"
            aria-label="Message Sterling"
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !draft.trim()}>Ask</button>
        </form>
      </section>

    </main>
  );
}
