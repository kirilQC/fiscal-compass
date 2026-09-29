import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { money } from "../format";
import { openai } from "../advisor";
import { computeInsights, monthName, monthlyDigest } from "./insights";
import type { Ledger } from "./ledger";
import { runTool, toolStatus, TOOLS } from "./tools";

// The advisor: a model with a standing briefing on Kiril's money and tools to dig into the ledger itself.
// gpt-5.5 at low reasoning effort answers in about a second and is sharp enough to chain tool calls.

export const ADVISOR_MODEL = process.env.ADVISOR_MODEL || "gpt-5.5";
const EFFORT = (process.env.ADVISOR_REASONING_EFFORT as "low" | "medium" | "high" | undefined) || "low";
const MAX_ROUNDS = 6;

// Status lines with these prefixes are memory changes; the page shows them as a note under the answer.
export const REMEMBERED = "Remembered: ";
export const FORGOT = "Forgot: ";

export type AdvisorEvent = { type: "text"; delta: string } | { type: "status"; text: string };
export type Turn = { role: "user" | "assistant"; content: string };

export function briefing(L: Ledger): string {
  const B: string[] = [];
  const mName = monthName(L.month);
  B.push(`Today is ${L.today} (day ${L.dayOfMonth} of ${L.daysInMonth} in ${mName}).`);
  B.push(`Expected take-home income: ${money(L.incomeCents)} a month${L.settings.payDays.length ? `, paid on the ${L.settings.payDays.join(" and ")}` : ""}. Tithe: ${L.settings.tithePct}% of income, a commitment; never suggest cutting giving.`);
  if (L.plan) B.push(`Essentials plan: ${money(L.plan.totalCents)} a month across ${L.plan.items.filter((i) => !i.isReimbursed).length} bills. Discretionary cap: ${money(L.discretionaryCapCents)} a month. Whatever is left after essentials and the cap is what he means to keep.`);
  B.push(`Every purchase is tagged essential (bills and necessities in the plan), discretionary (his own choices), or untagged (waiting for him to decide). Transfers between his own accounts and income are not spending.`);
  B.push(`\nAccounts: ${L.accounts.map((a) => `${a.institution} ${a.name} (${a.kind}) ${a.balanceCents == null ? "balance unknown" : money(a.balanceCents)}${a.creditLimitCents ? ` of ${money(a.creditLimitCents)} limit` : ""}`).join("; ")}.`);
  const past = L.conversations.slice(0, 10);
  if (past.length) B.push(`\nRecent conversations with Kiril (newest first; use search_past_conversations for detail):\n${past.map((c) => `- ${c.updatedAt.slice(0, 10)} "${c.title}": he asked "${c.asked}"${c.answered ? `; you said "${c.answered}"` : ""}`).join("\n")}`);
  B.push(`\nLast six months:\n${monthlyDigest(L).map((l) => `- ${l}`).join("\n")}`);
  // What this month's discretionary and essential totals are actually made of, so the model never attributes one to the other.
  const mine = L.spend.filter((t) => t.date.startsWith(L.month));
  const topOf = (tag: string) => { const m = new Map<string, number>(); for (const t of mine) if (t.tag === tag) m.set(t.key, (m.get(t.key) ?? 0) - t.cents); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${money(v)}`).join(", "); };
  B.push(`\nThis month's discretionary spending by merchant: ${topOf("discretionary") || "none"}.`);
  B.push(`This month's essential spending by merchant: ${topOf("essential") || "none"}.`);
  const ins = computeInsights(L);
  if (ins.length) B.push(`\nWhat the automatic analysis flagged this month (most urgent first):\n${ins.map((i) => `- [${i.level}] ${i.title}. ${i.detail}`).join("\n")}`);
  return B.join("\n");
}

export function instructions(L: Ledger): string {
  const harness = L.settings.notes?.trim();
  const learned = L.memories.length ? L.memories.map((m) => `- [${m.id}] ${m.body}`).join("\n") : "(nothing yet)";
  return `${harness ? `KIRIL'S HARNESS: his own instructions, written in Settings. Read them first and follow them. Where they conflict with the defaults further down, his harness wins, except where it describes the app's data differently from what your tools show: then trust the data and mention the difference once.

${harness}

` : ""}LEARNED CONTEXT: facts you have saved about Kiril from past conversations (id in brackets, for forget). Treat them as true unless he corrects them.
${learned}

You are Sterling, Kiril's personal financial advisor inside Fiscal Compass, his own app. You are the part of the app that is supposed to save him from reading through transactions himself: you notice patterns, connect dots across months and merchants, and tell him plainly what he needs to know.

How to answer:
- Lead with the verdict in one sentence: over or under, by how much, compared with what (his plan, his cap, last month, or his 3-month usual).
- Then the why, with specifics: merchants, dates, amounts. Name the two or three things that explain most of it rather than listing everything.
- Actions: add a closing line starting with "Do this:" only when he asked what to do, or when something urgent is about the exact thing he asked about. Never tack on advice about a different topic (a question about net worth does not get a credit card to-do). Most answers should end without one.
- Use your tools whenever the question needs detail beyond the briefing: search transactions, break spending down, compare periods, check recurring charges, essentials or accounts. Never guess a number you could look up. Two or three tool calls is usually enough; don't narrate that you're calling them.
- Every figure you state must come from the briefing or a tool result. Do the arithmetic and show the key step when it helps ("$1,298 − $875 = $423 over").
- Compare against his own history, not generic advice. Point out anything surprising you notice along the way, even if he didn't ask about it, in one short line at the end.
- Charts: draw one on your own initiative, without being asked, whenever the answer involves a trend over time (net worth, balances, a category month by month), a comparison of three or more things, or a breakdown of a total. Questions like "how's my net worth looking" or "where did my money go" should almost always get one. Skip it for single numbers and yes/no answers. Call show_chart with numbers from your tool results (one per answer, two at most); it appears right after your opening verdict. For net worth use net_worth_history, then a line chart of its series. The chart replaces a list: after charting, do NOT write a bullet list or line-by-line rundown of the same labels and values. Mention only the one or two that matter, in a sentence. Don't chart two numbers.
- Memory: you keep one continuous memory across every conversation. Save lasting facts on your own initiative, even when he mentions them in passing and doesn't ask you to remember: what a merchant or charge is, who a person is, a life event, a plan or goal, a preference about how you answer, a correction to something you assumed. Call remember with the fact and what it means for his money, e.g. "Kiril is getting married; Kings Crossing is the wedding venue. Expect venue, catering and vendor charges in the months before the wedding." Update rather than duplicate: if a saved fact changes, forget the old one and remember the new one.
- Past conversations: the briefing lists your recent conversations. When he refers to something from before ("like I said", "that charge we talked about"), or an earlier chat probably holds context you need, look it up with search_past_conversations instead of asking him to repeat it. Never ask him for something he has already told you in the learned context or a past conversation.
- Asking: if the data shows a sizable or recurring charge you can't identify and nothing in the learned context explains it, end with one short question asking what it is. Never more than one question per answer.
- Punctuation: never use em dashes or en dashes. Use commas, periods, colons or parentheses instead, and "to" for ranges ($200 to $300).
- When a conversation opens with a question you asked him and he answers it, save what you learned with remember, thank him in a few words, and say briefly how it changes the picture. Keep that reply short.
- Style: short paragraphs, plain words, bold only the one or two key numbers. Bullet lists only for three or more parallel items. No headers, no emojis, no filler openers like "Great question". Call him "you".
- Investments: general guidance only, with at most one short line saying so.

Briefing:
${briefing(L)}`;
}

// Kiril never wants em or en dashes. The model is told, and this makes sure: dashes become commas or "to",
// and the minus sign becomes a plain hyphen. Whitespace at the end of a chunk is held back so a dash split
// across two chunks still reads right.
export class DashFilter {
  private held = "";
  push(chunk: string): string {
    const text = this.held + chunk;
    const cut = text.search(/\s+$/);
    const ready = cut >= 0 ? text.slice(0, cut) : text;
    this.held = cut >= 0 ? text.slice(cut) : "";
    return clean(ready);
  }
  flush(): string { const t = clean(this.held); this.held = ""; return t; }
}
function clean(s: string) {
  return s
    .replace(/(\$?\d[\d,.]*[kKmM%]?)\s*[\u2013\u2014]\s*(\$?\d)/g, "$1 to $2")
    .replace(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)\s*[\u2013\u2014]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/g, "$1 to $2")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\u2212/g, "-")
    .replace(/,\s*,/g, ",");
}

export async function* runAdvisor(L: Ledger, history: Turn[], db: { supabase: SupabaseClient; userId: string }, extraInstruction?: string): AsyncGenerator<AdvisorEvent> {
  const ai = openai();
  if (!ai) { yield { type: "text", delta: "The advisor isn't connected yet. Add OPENAI_API_KEY to the environment." }; return; }
  const sys = instructions(L) + (extraInstruction ? `\n\n${extraInstruction}` : "");
  let input: ResponseInputItem[] = history.map((m) => ({ role: m.role, content: m.content }));
  let previous: string | undefined;
  let pending: string[] = [];
  let written = "";
  const dash = new DashFilter();
  const flush = function* (): Generator<AdvisorEvent> { const t = dash.flush(); if (t) yield { type: "text", delta: t }; for (const c of pending) yield { type: "text", delta: c }; pending = []; };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const calls: { call_id: string; name: string; arguments: string }[] = [];
    const stream = await ai.responses.create({
      model: ADVISOR_MODEL, instructions: sys, input, tools: TOOLS, stream: true,
      reasoning: { effort: EFFORT }, ...(previous ? { previous_response_id: previous } : {}),
    });
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        const t = dash.push(ev.delta);
        if (t) yield { type: "text", delta: t };
        written += ev.delta;
        if (pending.length && /\S[\s\S]*\n\n/.test(written)) yield* flush();
      }
      else if (ev.type === "response.output_item.done" && ev.item.type === "function_call") calls.push({ call_id: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments });
      else if (ev.type === "response.completed") previous = ev.response.id;
      else if (ev.type === "response.failed" || ev.type === "error") throw new Error("The model request failed.");
    }
    if (!calls.length) { yield* flush(); return; }
    const outputs: ResponseInputItem[] = [];
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.arguments || "{}"); } catch { /* malformed args: run with none */ }
      if (c.name === "show_chart") {
        const spec = chartSpec(args);
        if (spec) pending.push(`\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\`\n\n`);
        outputs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(spec ? { shown: true } : { shown: false, error: "labels and series values must line up" }) });
        continue;
      }
      const quiet = c.name === "remember" || c.name === "forget";
      if (!quiet) yield { type: "status", text: toolStatus(c.name, args) };
      let result: unknown;
      try { result = await runTool(c.name, args, L, db); } catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
      const r = result as { ok?: boolean; fact?: string };
      if (c.name === "remember" && r.ok) yield { type: "status", text: `${REMEMBERED}${clean(String(args.fact ?? "").trim())}` };
      if (c.name === "forget" && r.ok && r.fact) yield { type: "status", text: `${FORGOT}${r.fact}` };
      outputs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result).slice(0, 60000) });
    }
    input = outputs;
  }
  yield* flush();
  yield { type: "text", delta: "\n\n(I stopped after several lookups. Ask me to keep going if you need more.)" };
}

export interface ChartSpec {
  type: "bar" | "line" | "donut";
  title: string;
  unit: "usd" | "count" | "pct";
  labels: string[];
  series: { name: string; values: number[] }[];
  reference?: { label: string; value: number };
}

/** Validates the model's chart request; anything malformed is dropped rather than rendered wrong. */
function chartSpec(a: Record<string, unknown>): ChartSpec | null {
  const type = a.type === "line" || a.type === "donut" ? a.type : "bar";
  const labels = Array.isArray(a.labels) ? a.labels.map(String).slice(0, 24) : [];
  const series = (Array.isArray(a.series) ? a.series : []).slice(0, type === "donut" ? 1 : 3).map((s) => {
    const o = s as { name?: unknown; values?: unknown };
    return { name: String(o.name ?? ""), values: Array.isArray(o.values) ? o.values.map(Number).slice(0, labels.length) : [] };
  });
  if (!labels.length || !series.length || series.some((s) => s.values.length !== labels.length || s.values.some((v) => !Number.isFinite(v)))) return null;
  const ref = a.reference as { label?: unknown; value?: unknown } | undefined;
  return { type, title: clean(String(a.title ?? "")).slice(0, 90), unit: a.unit === "count" || a.unit === "pct" ? a.unit : "usd", labels, series,
    ...(ref && Number.isFinite(Number(ref.value)) ? { reference: { label: String(ref.label ?? ""), value: Number(ref.value) } } : {}) };
}

/** One-shot text for the morning brief and the Grok bot: the insights, turned into a short paragraph. */
export async function briefText(L: Ledger, db: { supabase: SupabaseClient; userId: string }): Promise<string> {
  let text = "";
  for await (const ev of runAdvisor(L, [{ role: "user", content: "Write my morning brief: one paragraph, 3 to 5 sentences. Start with how the month is going against the plan and the discretionary cap, then the single most important thing to act on, then anything surprising. No tools unless you need a detail." }], db)) {
    if (ev.type === "text") text += ev.delta;
  }
  return text.trim();
}
