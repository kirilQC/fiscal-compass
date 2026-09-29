import { money } from "../format";
import type { Ledger, Txn } from "./ledger";

// Deterministic analysis of the ledger: the things worth knowing today, each with the numbers behind it.
// Runs in milliseconds, so the advisor page can show it instantly and the model can build on it.

export type Level = "alert" | "watch" | "info" | "good";
export interface Insight {
  id: string;
  level: Level;
  title: string;
  detail: string;
  ask: string; // a question to hand the advisor for the full story
}

export interface Recurring {
  key: string;
  merchant: string;
  category: string;
  typicalCents: number;
  typicalDay: number;
  months: number;
  thisMonthCents: number;
  status: "charged" | "changed" | "late" | "upcoming";
  isNew: boolean;
}

const RANK: Record<Level, number> = { alert: 0, watch: 1, info: 2, good: 3 };
const out = (t: Txn) => -t.cents;
const ym = (d: string) => d.slice(0, 7);
export function monthShift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
const daysIn = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dayOf = (d: string) => Number(d.slice(8, 10));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pretty = (m: string) => m.replace(/^(zelle payment to|cash app\*?)\s*/i, "").replace(/\s+/g, " ").replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase()).slice(0, 32);
export const monthName = (month: string, style: "long" | "short" = "long") => new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: style, timeZone: "UTC" });

/** Spending in `month` up to the same day-of-month as today (clamped to that month's length). */
function sameDay(spend: Txn[], month: string, day: number, pick: (t: Txn) => boolean = () => true) {
  const cut = `${month}-${String(Math.min(day, daysIn(month))).padStart(2, "0")}`;
  return spend.filter((t) => ym(t.date) === month && t.date <= cut && pick(t)).reduce((s, t) => s + out(t), 0);
}
function monthTotal(spend: Txn[], month: string, pick: (t: Txn) => boolean = () => true) {
  return spend.filter((t) => ym(t.date) === month && pick(t)).reduce((s, t) => s + out(t), 0);
}

// Recurring charges are tracked per repeating amount, not per merchant total: Netflix's $30.54 plan and an
// extra-member $9.53 are two subscriptions, and a price change shows up as one amount stopping and another starting.
// Only bill-like categories recur by design; a $43 fill-up twice in a row is coincidence, not a subscription.
const RECURRING_CATEGORIES = new Set(["Subscriptions", "Utilities", "Insurance", "Health", "Fitness", "Housing", "Loan Payment", "Giving", "Entertainment", "Education", "Reimbursed", "Fees & Interest"]);

export function recurringCharges(L: Ledger): Recurring[] {
  const firstSeen = new Map<string, string>();
  for (const t of L.spend) if (!firstSeen.has(t.key) || t.date < firstSeen.get(t.key)!) firstSeen.set(t.key, t.date);
  const recent = new Set([0, 1, 2, 3, 4, 5, 6].map((k) => monthShift(L.month, -k)));
  const byKey = new Map<string, Txn[]>();
  for (const t of L.spend) if (t.cents < 0 && !t.pending && recent.has(ym(t.date)) && RECURRING_CATEGORIES.has(t.category)) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  type Cluster = { txns: Txn[]; typical: number; months: string[] };
  const res: Recurring[] = [];
  for (const [key, ts] of byKey) {
    const clusters: Cluster[] = [];
    for (const t of [...ts].sort((x, y) => out(x) - out(y))) {
      const c = clusters.find((k) => Math.abs(out(t) - k.typical) <= Math.max(k.typical * 0.05, 100));
      if (c) { c.txns.push(t); c.typical = median(c.txns.map(out)); } else clusters.push({ txns: [t], typical: out(t), months: [] });
    }
    for (const c of clusters) c.months = [...new Set(c.txns.map((t) => ym(t.date)))].sort();
    const consecutive = (ms: string[]) => ms.some((m, i) => i > 0 && monthShift(ms[i - 1], 1) === m);
    const sameDay = (c: Cluster) => { const md = median(c.txns.map((t) => dayOf(t.date))); return c.txns.every((t) => Math.min(Math.abs(dayOf(t.date) - md), 31 - Math.abs(dayOf(t.date) - md)) <= 7); };
    const steady = clusters.filter((c) => c.months.length >= 2 && consecutive(c.months) && c.txns.length / c.months.length <= 2.5 && c.typical >= 200 && sameDay(c));
    for (const c of steady) {
      const perMonth = Math.max(1, Math.round(c.txns.length / c.months.length));
      const prior = c.months.filter((m) => m !== L.month);
      const lastSeen = prior.at(-1);
      // Stopped last month or earlier while another amount from the same merchant started: a price change.
      if (!c.months.includes(L.month) && lastSeen && monthShift(lastSeen, 1) >= monthShift(L.month, -1)) {
        const successor = clusters.find((k) => k !== c && k.months.includes(L.month) && !k.months.some((m) => m < L.month && m <= lastSeen) && Math.abs(k.typical - c.typical) <= c.typical * 0.4);
        if (successor) {
          const now = successor.txns.filter((t) => ym(t.date) === L.month).reduce((s2, t) => s2 + out(t), 0);
          res.push({ key, merchant: c.txns[0].merchant, category: c.txns[0].category, typicalCents: c.typical * perMonth, typicalDay: Math.round(median(c.txns.map((t) => dayOf(t.date)))), months: prior.length, thisMonthCents: now, status: "changed", isNew: false });
          continue;
        }
      }
      const now = c.txns.filter((t) => ym(t.date) === L.month).reduce((s2, t) => s2 + out(t), 0);
      const typicalDay = Math.round(median(c.txns.map((t) => dayOf(t.date)))) || 1;
      const status: Recurring["status"] = now > 0 ? "charged" : L.dayOfMonth > typicalDay + 3 ? "late" : "upcoming";
      // A late charge that stopped two or more months ago has simply ended; don't report it.
      if (status === "late" && lastSeen && lastSeen < monthShift(L.month, -1)) continue;
      const isNew = (firstSeen.get(key) ?? "") >= `${monthShift(L.month, -1)}-01`;
      res.push({ key, merchant: c.txns[0].merchant, category: c.txns[0].category, typicalCents: c.typical * perMonth, typicalDay, months: c.months.length, thisMonthCents: now, status, isNew });
    }
  }
  return res.sort((x, y) => y.typicalCents - x.typicalCents);
}

export function computeInsights(L: Ledger): Insight[] {
  const I: Insight[] = [];
  const { month, dayOfMonth: day, daysInMonth } = L;
  const daysLeft = Math.max(0, daysInMonth - day);
  const last = monthShift(month, -1);
  const prior3 = [1, 2, 3].map((k) => monthShift(month, -k));
  const spend = L.spend;
  const disc = (t: Txn) => t.tag === "discretionary";
  const mName = monthName(month);

  // 1. Where the month is heading.
  const mtd = monthTotal(spend, month);
  const lastSame = sameDay(spend, last, day);
  const avgSame = Math.round(prior3.reduce((s, m) => s + sameDay(spend, m, day), 0) / 3);
  const discMtd = monthTotal(spend, month, disc);
  const dueEss = (L.plan?.items ?? []).filter((i) => !i.isReimbursed && (i.status === "due" || i.status === "overdue")).reduce((s, i) => s + i.expectedCents, 0);
  const variesLeft = (L.plan?.items ?? []).filter((i) => i.status === "varies").reduce((s, i) => s + Math.max(0, i.expectedCents - i.paidCents), 0);
  const projected = Math.round(mtd + dueEss + variesLeft + (day ? (discMtd / day) * daysLeft : 0));
  if (mtd > 0) {
    const vsLast = lastSame ? Math.round(((mtd - lastSame) / lastSame) * 100) : null;
    const overIncome = L.incomeCents > 0 && projected > L.incomeCents;
    I.push({
      id: "pace",
      level: overIncome ? "alert" : vsLast !== null && vsLast > 15 ? "watch" : "good",
      title: overIncome ? `On pace to spend ${money(projected - L.incomeCents)} more than you earn` : `${money(mtd)} spent so far in ${mName}`,
      detail: `${money(mtd)} by day ${day}${vsLast !== null ? `, ${Math.abs(vsLast)}% ${vsLast >= 0 ? "more" : "less"} than ${monthName(last)} by the same day (${money(lastSame)})` : ""}${avgSame ? `; your 3-month average by now is ${money(avgSame)}` : ""}. Projected month-end ${money(projected)}${L.incomeCents ? ` against ${money(L.incomeCents)} income` : ""}.`,
      ask: `Break down why ${mName} spending is where it is compared to ${monthName(last)}, and what the month-end will look like.`,
    });
  }

  // 2. Discretionary against the cap.
  if (L.discretionaryCapCents > 0) {
    const cap = L.discretionaryCapCents;
    const pace = (cap * day) / daysInMonth;
    const left = cap - discMtd;
    I.push({
      id: "cap",
      level: left < 0 ? "alert" : discMtd > pace * 1.15 ? "watch" : "good",
      title: left < 0 ? `Discretionary is ${money(-left)} over your ${money(cap)} cap` : `${money(left)} of discretionary left`,
      detail: left < 0
        ? `${money(discMtd)} of choice spending against a ${money(cap)} cap, with ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go. Every discretionary dollar from here comes out of what you meant to keep.`
        : `${money(discMtd)} of ${money(cap)} used on day ${day} (${Math.round((discMtd / cap) * 100)}% of the cap, ${Math.round((day / daysInMonth) * 100)}% of the month). About ${money(daysLeft ? left / daysLeft : left)} a day keeps you under.`,
      ask: `What drove my discretionary spending in ${mName}, and where would cutting back matter most?`,
    });
  }

  // 3. Essentials: late, due soon, over estimate.
  const items = (L.plan?.items ?? []).filter((i) => !i.isReimbursed);
  const overdue = items.filter((i) => i.status === "overdue");
  if (overdue.length) I.push({ id: "overdue", level: "alert", title: `${overdue.map((i) => i.name).join(" and ")} ${overdue.length > 1 ? "haven't" : "hasn't"} been paid`, detail: `Expected by day ${overdue.map((i) => i.dueDay).join(", ")}: ${overdue.map((i) => `${i.name} ${money(i.expectedCents)}`).join(", ")}. If it was paid another way, link the charge on the Spending page.`, ask: `Check whether ${overdue[0].name} was actually paid this month and what I should do.` });
  const soon = items.filter((i) => i.status === "due" && i.dueDay != null && i.dueDay - day >= 0 && i.dueDay - day <= 5);
  if (soon.length) I.push({ id: "due-soon", level: "info", title: `${money(soon.reduce((s, i) => s + i.expectedCents, 0))} of bills due in the next few days`, detail: soon.map((i) => `${i.name} ${money(i.expectedCents)} ${i.dueDay === day ? "today" : i.dueDay === day + 1 ? "tomorrow" : `on the ${i.dueDay}th`}`).join(" · ") + ".", ask: "Do I have enough in checking for the bills coming up?" });
  const overEst = items.filter((i) => i.expectedCents > 0 && i.status !== "due" && i.status !== "overdue" && i.paidCents - i.expectedCents > Math.max(i.expectedCents * 0.05, 500)).sort((a, b) => (b.paidCents - b.expectedCents) - (a.paidCents - a.expectedCents));
  if (overEst.length) I.push({ id: "ess-over", level: "watch", title: `${overEst.length} essential${overEst.length > 1 ? "s" : ""} ran over estimate by ${money(overEst.reduce((s, i) => s + i.paidCents - i.expectedCents, 0))}`, detail: overEst.slice(0, 3).map((i) => `${i.name} ${money(i.paidCents)} vs ${money(i.expectedCents)} (+${money(i.paidCents - i.expectedCents)})`).join(" · ") + (overEst.length > 3 ? ` · and ${overEst.length - 3} more` : "") + ".", ask: `Why did ${overEst[0].name} cost more than planned this month, and should I change the estimate?` });

  // 4. Categories moving against their usual.
  const cats = new Set(spend.filter((t) => ym(t.date) >= prior3[2]).map((t) => t.category));
  const moves: { cat: string; now: number; usual: number }[] = [];
  cats.delete("Giving"); // tithe and giving are commitments, never "overspending"
  for (const c of cats) {
    const pick = (t: Txn) => t.category === c;
    const now = monthTotal(spend, month, pick);
    const usual = Math.round(prior3.reduce((s, m) => s + sameDay(spend, m, day, pick), 0) / 3);
    if (Math.abs(now - usual) > Math.max(5000, usual * 0.35)) moves.push({ cat: c, now, usual });
  }
  moves.sort((a, b) => Math.abs(b.now - b.usual) - Math.abs(a.now - a.usual));
  const shownMoves = [...moves.filter((m) => m.now > m.usual).slice(0, 2), ...moves.filter((m) => m.now <= m.usual).slice(0, 1)];
  for (const mv of shownMoves) {
    const up = mv.now > mv.usual;
    I.push({ id: `cat-${mv.cat}`, level: up ? "watch" : "good", title: `${mv.cat} ${up ? "up" : "down"} ${money(Math.abs(mv.now - mv.usual))} vs your usual`, detail: `${money(mv.now)} so far this month; by day ${day} you usually spend about ${money(mv.usual)} (3-month average).`, ask: `What changed in my ${mv.cat} spending this month?` });
  }

  // 5. Merchants: spikes and new names.
  const byKey = new Map<string, { merchant: string; now: number; prior: number; seen: boolean; months: Set<string> }>();
  for (const t of spend) {
    if (t.tag === "essential") continue; // essentials are judged against their plan above
    const e = byKey.get(t.key) ?? { merchant: t.key, now: 0, prior: 0, seen: false, months: new Set<string>() };
    if (ym(t.date) === month) e.now += out(t);
    else { e.seen = true; if (prior3.includes(ym(t.date))) { e.prior += out(t); e.months.add(ym(t.date)); } }
    byKey.set(t.key, e);
  }
  const spikes = [...byKey.values()].filter((e) => e.months.size >= 2 && e.prior > 0 && e.now > (e.prior / 3) * 2 && e.now - e.prior / 3 > 4000).sort((a, b) => (b.now - b.prior / 3) - (a.now - a.prior / 3));
  if (spikes.length) I.push({ id: "merchant-spike", level: "watch", title: `More than usual at ${pretty(spikes[0].merchant)}`, detail: spikes.slice(0, 3).map((e) => `${pretty(e.merchant)} ${money(e.now)} (usually ~${money(e.prior / 3)}/mo)`).join(" · ") + ".", ask: `Show me what I bought at ${pretty(spikes[0].merchant)} this month compared to usual.` });
  const newbies = [...byKey.values()].filter((e) => !e.seen && e.now >= 7500).sort((a, b) => b.now - a.now);
  if (newbies.length) I.push({ id: "merchant-new", level: "info", title: `${newbies.length} new place${newbies.length > 1 ? "s" : ""} this month`, detail: newbies.slice(0, 4).map((e) => `${pretty(e.merchant)} ${money(e.now)}`).join(" · ") + ". None of these appear in the previous 12 months.", ask: "Tell me about the new merchants I spent at this month." });

  // 6. Subscriptions and other recurring charges.
  const rec = recurringCharges(L);
  const changed = rec.filter((r) => r.status === "changed");
  for (const r of changed.slice(0, 2)) {
    const up = r.thisMonthCents > r.typicalCents;
    I.push({ id: `rec-${r.key}`, level: up ? "watch" : "good", title: `${pretty(r.key)} ${up ? "went up" : "dropped"} to ${money(r.thisMonthCents)}`, detail: `Usually ${money(r.typicalCents)} a month (${r.months} months in a row); this month it's ${up ? "+" : "−"}${money(Math.abs(r.thisMonthCents - r.typicalCents))}.`, ask: `${pretty(r.key)} charged a different amount this month. Is that a price change?` });
  }
  const fresh = rec.filter((r) => r.isNew);
  if (fresh.length) I.push({ id: "rec-new", level: "info", title: `New recurring charge${fresh.length > 1 ? "s" : ""}: ${fresh.map((r) => pretty(r.key)).join(", ")}`, detail: fresh.map((r) => `${pretty(r.key)} about ${money(r.typicalCents)}/mo`).join(" · ") + ". This started in the last few months.", ask: "Which subscriptions have I added recently, and are they worth keeping?" });
  const late = rec.filter((r) => r.status === "late" && r.typicalCents >= 1000);
  if (late.length) I.push({ id: "rec-late", level: "info", title: late.length > 1 ? `${late.length} regular charges haven't shown up yet` : `${pretty(late[0].key)} hasn't charged yet this month`, detail: late.slice(0, 4).map((r) => `${pretty(r.key)} (~${money(r.typicalCents)}, usually around the ${r.typicalDay}th)`).join(" · ") + ".", ask: "Which of my regular charges are missing this month, and does that mean anything?" });

  // 7. Big one-off purchases.
  const big = spend.filter((t) => ym(t.date) === month && t.tag !== "essential" && out(t) >= 15000).sort((a, b) => out(b) - out(a));
  if (big.length) I.push({ id: "big", level: "info", title: `Biggest non-essential charge: ${pretty(big[0].merchant)} ${money(out(big[0]))}`, detail: big.slice(0, 3).map((t) => `${pretty(t.merchant)} ${money(out(t))} on ${monthName(month, "short")} ${dayOf(t.date)}`).join(" · ") + ".", ask: "What were my biggest one-off purchases this month and how do they compare to past months?" });

  // 8. Paychecks.
  // A deposit up to four days early (weekends, holidays) counts for that payday.
  const payDayIso = (d: number) => `${month}-${String(Math.min(d, daysInMonth)).padStart(2, "0")}`;
  const shiftIso = (iso: string, by: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + by * 86400_000).toISOString().slice(0, 10);
  const missed = L.settings.payDays.filter((d) => d + 2 <= day).filter((d) => { const iso = payDayIso(d); return !L.paychecks.some((p) => p.date >= shiftIso(iso, -4) && p.date <= shiftIso(iso, 2)); });
  if (missed.length && L.paychecks.length) I.push({ id: "pay-missing", level: "alert", title: `No paycheck found for the ${missed.join(" and ")}`, detail: `Payday${missed.length > 1 ? "s" : ""} on the ${missed.join(" and ")} passed with no payroll deposit within a few days of ${missed.length > 1 ? "them" : "it"}. It may have landed in an account that isn't linked.`, ask: "Did all my paychecks arrive this month?" });

  // 9. Untagged charges.
  const untagged = spend.filter((t) => ym(t.date) >= monthShift(month, -1) && t.tag === "untagged");
  if (untagged.length) I.push({ id: "untagged", level: "watch", title: `${untagged.length} charge${untagged.length > 1 ? "s" : ""} need${untagged.length > 1 ? "" : "s"} a tag`, detail: `${money(untagged.reduce((s, t) => s + out(t), 0))} isn't counted as essential or discretionary yet, so the split is incomplete. Tag them at the top of Spending.`, ask: "Which charges are untagged, and what do you think they are?" });

  // 10. Cash on hand against what's still due.
  const checking = L.accounts.filter((a) => a.kind === "checking" && a.balanceCents != null).reduce((s, a) => s + (a.balanceCents ?? 0), 0);
  const cards = L.accounts.filter((a) => a.kind === "credit");
  const cardOwed = cards.reduce((s, a) => s + Math.abs(a.balanceCents ?? 0), 0);
  if (checking > 0 && dueEss > checking) I.push({ id: "cash", level: "alert", title: "Checking won't cover the bills still due", detail: `${money(checking)} in checking against ${money(dueEss)} of essential bills still due this month.`, ask: "Can I cover my remaining bills this month? What should I pay first?" });
  else if (checking > 0 && cardOwed > checking) I.push({ id: "cash-card", level: "watch", title: `Card balance is more than what's in checking`, detail: `${money(cardOwed)} owed on credit cards against ${money(checking)} in checking. Fine if the next paycheck lands before the statement is due.`, ask: "When is my card payment due, and will I have enough to pay it in full?" });
  for (const c of cards) {
    if (!c.creditLimitCents) continue;
    const util = Math.round((Math.abs(c.balanceCents ?? 0) / c.creditLimitCents) * 100);
    if (util >= 30) I.push({ id: `util-${c.id}`, level: util >= 50 ? "alert" : "watch", title: `${c.name} is at ${util}% utilization`, detail: `${money(Math.abs(c.balanceCents ?? 0))} of a ${money(c.creditLimitCents)} limit. Keeping it under 30% (${money(c.creditLimitCents * 0.3)}) helps your credit score.`, ask: `How much should I pay on the ${c.name} to get utilization under 30%?` });
  }

  return I.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

/** A compact numeric digest of the last six months for the model's standing context. */
export function monthlyDigest(L: Ledger) {
  const months = [5, 4, 3, 2, 1, 0].map((k) => monthShift(L.month, -k));
  return months.map((m) => {
    const inMonth = L.spend.filter((t) => ym(t.date) === m);
    const sum = (f: (t: Txn) => boolean) => inMonth.filter(f).reduce((s, t) => s + out(t), 0);
    const income = L.txns.filter((t) => ym(t.date) === m && t.isIncome && t.cents > 0).reduce((s, t) => s + t.cents, 0);
    const cats = new Map<string, number>();
    for (const t of inMonth) cats.set(t.category, (cats.get(t.category) ?? 0) + out(t));
    const top = [...cats].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c} ${money(v)}`).join(", ");
    return `${m}${m === L.month ? ` (through day ${L.dayOfMonth})` : ""}: spent ${money(sum(() => true))} (essential ${money(sum((t) => t.tag === "essential"))}, discretionary ${money(sum((t) => t.tag === "discretionary"))}, untagged ${money(sum((t) => t.tag === "untagged"))}); income ${money(income)}; top: ${top}`;
  });
}
