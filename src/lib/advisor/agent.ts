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
  B.push(`\nLast six months:\n${monthlyDigest(L).map((l) => `- ${l}`).join("\n")}`);
  // What this month's discretionary and essential totals are actually made of, so the model never attributes one to the other.
  const mine = L.spend.filter((t) => t.date.startsWith(L.month));
  const topOf = (tag: string) => { const m = new Map<string, number>(); for (const t of mine) if (t.tag === tag) m.set(t.key, (m.get(t.key) ?? 0) - t.cents); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${money(v)}`).join(", "); };
  B.push(`\nThis month's discretionary spending by merchant: ${topOf("discretionary") || "none"}.`);
  B.push(`This month's essential spending by merchant: ${topOf("essential") || "none"}.`);
  const ins = computeInsights(L);
  if (ins.length) B.push(`\nWhat the automatic analysis flagged this month (most urgent first):\n${ins.map((i) => `- [${i.level}] ${i.title}. ${i.detail}`).join("\n")}`);
  if (L.memories.length) B.push(`\nThings Kiril has told you (id in brackets, use with forget):\n${L.memories.map((m) => `- [${m.id}] ${m.body}`).join("\n")}`);
  if (L.settings.notes?.trim()) B.push(`\nStanding notes from Kiril's settings:\n${L.settings.notes.trim()}`);
  return B.join("\n");
}

export function instructions(L: Ledger): string {
  return `You are Kiril's personal financial advisor inside Fiscal Compass, his own app. You are the part of the app that is supposed to save him from reading through transactions himself: you notice patterns, connect dots across months and merchants, and tell him plainly what he needs to know.

How to answer:
- Lead with the verdict in one sentence: over or under, by how much, compared with what (his plan, his cap, last month, or his 3-month usual).
- Then the why, with specifics: merchants, dates, amounts. Name the two or three things that explain most of it rather than listing everything.
- End with one concrete action he can take, if there is one worth taking. No menus of options unless he asks.
- Use your tools whenever the question needs detail beyond the briefing: search transactions, break spending down, compare periods, check recurring charges, essentials or accounts. Never guess a number you could look up. Two or three tool calls is usually enough; don't narrate that you're calling them.
- Every figure you state must come from the briefing or a tool result. Do the arithmetic and show the key step when it helps ("$1,298 − $875 = $423 over").
- Compare against his own history, not generic advice. Point out anything surprising you notice along the way, even if he didn't ask about it, in one short line at the end.
- When he tells you a lasting fact (what a merchant is, a goal, a preference), save it with the remember tool, then continue the answer.
- Style: short paragraphs, plain words, bold only the one or two key numbers. Bullet lists only for three or more parallel items. No headers, no emojis, no filler openers like "Great question". Call him "you".
- Investments: general guidance only, with at most one short line saying so.

Briefing:
${briefing(L)}`;
}

export async function* runAdvisor(L: Ledger, history: Turn[], db: { supabase: SupabaseClient; userId: string }, extraInstruction?: string): AsyncGenerator<AdvisorEvent> {
  const ai = openai();
  if (!ai) { yield { type: "text", delta: "The advisor isn't connected yet. Add OPENAI_API_KEY to the environment." }; return; }
  const sys = instructions(L) + (extraInstruction ? `\n\n${extraInstruction}` : "");
  let input: ResponseInputItem[] = history.map((m) => ({ role: m.role, content: m.content }));
  let previous: string | undefined;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const calls: { call_id: string; name: string; arguments: string }[] = [];
    const stream = await ai.responses.create({
      model: ADVISOR_MODEL, instructions: sys, input, tools: TOOLS, stream: true,
      reasoning: { effort: EFFORT }, ...(previous ? { previous_response_id: previous } : {}),
    });
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") yield { type: "text", delta: ev.delta };
      else if (ev.type === "response.output_item.done" && ev.item.type === "function_call") calls.push({ call_id: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments });
      else if (ev.type === "response.completed") previous = ev.response.id;
      else if (ev.type === "response.failed" || ev.type === "error") throw new Error("The model request failed.");
    }
    if (!calls.length) return;
    const outputs: ResponseInputItem[] = [];
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.arguments || "{}"); } catch { /* malformed args: run with none */ }
      yield { type: "status", text: toolStatus(c.name, args) };
      let result: unknown;
      try { result = await runTool(c.name, args, L, db); } catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
      outputs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result).slice(0, 60000) });
    }
    input = outputs;
  }
  yield { type: "text", delta: "\n\n(I stopped after several lookups. Ask me to keep going if you need more.)" };
}

/** One-shot text for the morning brief and the Grok bot: the insights, turned into a short paragraph. */
export async function briefText(L: Ledger, db: { supabase: SupabaseClient; userId: string }): Promise<string> {
  let text = "";
  for await (const ev of runAdvisor(L, [{ role: "user", content: "Write my morning brief: one paragraph, 3 to 5 sentences. Start with how the month is going against the plan and the discretionary cap, then the single most important thing to act on, then anything surprising. No tools unless you need a detail." }], db)) {
    if (ev.type === "text") text += ev.delta;
  }
  return text.trim();
}
