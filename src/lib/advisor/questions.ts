import { money } from "../format";
import type { Ledger, Txn } from "./ledger";
import { monthName, monthShift, recurringCharges } from "./insights";

// Questions Sterling has for Kiril: places in the data where a short answer from him would make the numbers
// (and future advice) more accurate. Anything already asked, or already covered by a saved fact, is skipped.

export interface Question {
  id: string; // stable, so an asked question stays asked
  text: string; // what Sterling says to open the conversation
  about: string; // a few words for the card label
}

const out = (t: Txn) => -t.cents;
const ym = (d: string) => d.slice(0, 7);
const dayLabel = (d: string) => `${monthName(ym(d), "short")} ${Number(d.slice(8, 10))}`;
const pretty = (m: string) => m.replace(/^(zelle payment (to|from)|cash app\*?)\s*/i, "").replace(/^(tst|sq|sp|fh|ls|pf|ett|ysi)\b\s*/i, "").replace(/\s+/g, " ").replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase()).trim().slice(0, 36);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function computeQuestions(L: Ledger): Question[] {
  const Q: Question[] = [];
  const known = L.memories.map((m) => m.body.toLowerCase()).join(" \n ");
  const knows = (name: string) => { const n = pretty(name).toLowerCase(); return n.length > 2 && known.includes(n.split(" ").slice(0, 2).join(" ")); };
  const monthSpend = L.spend.filter((t) => ym(t.date) === L.month);
  const prior = L.spend.filter((t) => ym(t.date) < L.month);

  // An essential bill that came in far above its estimate: an annual fee, a price change, or a wrong estimate?
  for (const i of (L.plan?.items ?? []).filter((x) => !x.isReimbursed && x.expectedCents > 0 && x.paidCents > x.expectedCents * 1.5 && x.paidCents - x.expectedCents >= 2000)) {
    Q.push({ id: `est-${slug(i.name)}-${L.month}`, about: i.name,
      text: `${i.name} came to ${money(i.paidCents)} this month against your ${money(i.expectedCents)} estimate. Was the extra a one-time charge (like an annual fee), or has the real cost gone up so I should raise the estimate?` });
  }

  // Money sent to people: who are they, and what are the payments for?
  const people = new Map<string, { total: number; count: number; last: string }>();
  for (const t of L.spend.filter((x) => x.category === "Payments to People" && x.date >= `${monthShift(L.month, -3)}-01`)) {
    const e = people.get(t.key) ?? { total: 0, count: 0, last: t.date };
    e.total += out(t); e.count++; if (t.date > e.last) e.last = t.date;
    people.set(t.key, e);
  }
  for (const [key, e] of [...people].filter(([, e]) => e.total >= 10000).sort((a, b) => b[1].total - a[1].total).slice(0, 2)) {
    if (knows(key)) continue;
    Q.push({ id: `person-${slug(key)}`, about: pretty(key),
      text: `${e.count > 1 ? `You've sent ${pretty(key)} ${money(e.total)} over ${e.count} payments since ${monthName(monthShift(L.month, -3))}` : `You sent ${pretty(key)} ${money(e.total)} on ${dayLabel(e.last)}`}. Who is that, and what are those payments usually for? It tells me whether to treat them as essential or your own spending.` });
  }

  // A sizable first-time merchant this month.
  const seen = new Set(prior.map((t) => t.key));
  const firsts = new Map<string, { merchant: string; total: number; date: string }>();
  for (const t of monthSpend.filter((x) => !seen.has(x.key) && x.tag !== "essential" && x.category !== "Payments to People")) {
    const e = firsts.get(t.key) ?? { merchant: t.key, total: 0, date: t.date };
    e.total += out(t); firsts.set(t.key, e);
  }
  for (const e of [...firsts.values()].filter((e) => e.total >= 10000).sort((a, b) => b.total - a.total).slice(0, 2)) {
    if (knows(e.merchant)) continue;
    Q.push({ id: `new-${slug(e.merchant)}-${L.month}`, about: pretty(e.merchant),
      text: `${pretty(e.merchant)} is new: ${money(e.total)} on ${dayLabel(e.date)}, and nothing there in the past year. What was it, and is it a one-off or something I should expect again?` });
  }

  // New subscriptions: keeping them?
  for (const r of recurringCharges(L).filter((x) => x.isNew && x.category === "Subscriptions").slice(0, 2)) {
    if (knows(r.key)) continue;
    Q.push({ id: `sub-${slug(r.key)}`, about: pretty(r.key),
      text: `${pretty(r.key)} has charged about ${money(r.typicalCents)} a month since recently. What do you use it for, and is it something you plan to keep paying for?` });
  }

  // The monthly credit score check-in, until he has logged one this month.
  if (!L.creditScores.some((s) => ym(s.asOf) === L.month)) {
    const last = L.creditScores[L.creditScores.length - 1];
    Q.push({ id: `score-${L.month}`, about: "Credit score",
      text: last
        ? `What's your credit score this month? Last time it was ${last.score} (${monthName(ym(last.asOf))}). Open Chase Credit Journey and tell me the number, and I'll track it against your card balances.`
        : `What's your credit score right now? Open Chase Credit Journey (or the Experian app) and tell me the number, and I'll start tracking it against your card balances.` });
  }

  // Untagged charges the numbers can't place.
  const untagged = L.spend.filter((t) => t.tag === "untagged" && t.date >= `${monthShift(L.month, -1)}-01`).sort((a, b) => out(b) - out(a));
  if (untagged[0] && !knows(untagged[0].merchant)) {
    const t = untagged[0];
    Q.push({ id: `tag-${t.id}`, about: pretty(t.key),
      text: `What was the ${money(out(t))} at ${pretty(t.key)} on ${dayLabel(t.date)}? I can't tell from the bank's description whether it's essential or your own spending.` });
  }

  return Q.filter((q) => !L.askedQuestionIds.has(q.id)).slice(0, 5);
}
