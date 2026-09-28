"use client";

import { Fragment, useState } from "react";
import type { PlanItem } from "@/lib/types";
import { dateLabel, money } from "@/lib/format";
import { CategoryIcon } from "@/components/CategoryIcons";
import { AddExpense, Detail } from "./EssentialsTable";
import type { Txn } from "./TransactionLists";
import s from "./Essentials.module.css";

// The essential expenses section as designed in Figma: totals, what's coming up, a ledger grouped by
// life area, the bill calendar, and the month in one bar. Each life area keeps one color throughout.

type Area = "Home" | "Food" | "Car" | "Health" | "Giving" | "Subscriptions" | "Other";
const AREAS: Area[] = ["Home", "Food", "Car", "Health", "Giving", "Subscriptions", "Other"];
const AREA_COLOR: Record<Area, string> = {
  Home: "var(--cat-1)", Food: "var(--cat-3)", Car: "var(--cat-2)", Health: "var(--cat-7)",
  Giving: "var(--cat-5)", Subscriptions: "var(--cat-4)", Other: "var(--ink3)",
};

function areaOf(i: PlanItem): Area {
  const n = i.name.toLowerCase();
  if (i.isDebtPayment || i.category === "Transport" || i.category === "Loan Payment" || /\bcar\b|auto|progressive/.test(n)) return "Car";
  if (i.category === "Housing" || i.category === "Utilities" || i.category === "Insurance" || i.category === "Reimbursed") return "Home";
  if (i.category === "Health" || i.category === "Fitness") return "Health";
  if (i.category === "Giving") return "Giving";
  if (i.category === "Groceries") return "Food";
  if (i.category === "Subscriptions" || i.category === "Entertainment") return "Subscriptions";
  return "Other";
}
const iconCategory = (i: PlanItem) => (i.isDebtPayment ? "Loan Payment" : i.category);
const categoryLabel = (i: PlanItem) => (i.isDebtPayment ? "Debt payment" : i.category);
const isOver = (i: PlanItem) => i.status !== "due" && i.status !== "overdue" && i.expectedCents > 0 && i.paidCents - i.expectedCents > Math.max(i.expectedCents * 0.02, 200);
const onPlan = (i: PlanItem) => i.expectedCents > 0 && Math.abs(i.paidCents - i.expectedCents) <= Math.max(i.expectedCents * 0.02, 200);
const unpaid = (i: PlanItem) => i.status === "due" || i.status === "overdue";
const noEstimate = (i: PlanItem) => i.amountCents == null && i.pctOfIncome == null && i.amountMinCents == null;

function estimateLabel(i: PlanItem) {
  if (i.amountMinCents != null && i.amountMaxCents != null && i.amountCents == null) return `${money(i.amountMinCents)}–${money(i.amountMaxCents)}`;
  if (i.pctOfIncome != null) return `${money(i.expectedCents)} · ${i.pctOfIncome}%`;
  if (noEstimate(i)) return "varies";
  return money(i.expectedCents);
}

function Tile({ item, size = 34 }: { item: PlanItem; size?: number }) {
  return (
    <span className={s.tile} style={{ ["--gc" as string]: AREA_COLOR[areaOf(item)], width: size, height: size }}>
      <CategoryIcon category={iconCategory(item)} size={Math.round(size * 0.53)} />
    </span>
  );
}

function whenLabel(i: PlanItem, today: number, isCurrent: boolean) {
  if (!isCurrent) return i.status === "paid" ? `Paid ${dateLabel(i.paidOn!)}` : unpaid(i) ? "Not seen" : "";
  if (i.status === "overdue") return `Overdue · day ${i.dueDay}`;
  if (i.status === "due" && i.dueDay) {
    const days = i.dueDay - today;
    return days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
  }
  return i.status === "due" ? "Due" : "";
}

function Pill({ item, today, isCurrent, charges }: { item: PlanItem; today: number; isCurrent: boolean; charges: number }) {
  const tone = item.status === "paid" ? "var(--good)" : item.status === "overdue" ? "var(--crit)" : item.status === "due" ? "var(--warn)" : "var(--ink2)";
  const text =
    item.status === "paid" ? `Paid ${item.paidOn ? dateLabel(item.paidOn) : ""}`
    : item.status === "varies" ? (charges ? `${charges} ${item.category === "Transport" ? "fill-up" : "charge"}${charges === 1 ? "" : "s"}` : "Nothing yet")
    : whenLabel(item, today, isCurrent);
  return <span className={s.pill} style={{ ["--pc" as string]: tone }}><i />{text}</span>;
}

function Diff({ item }: { item: PlanItem }) {
  if (unpaid(item) || noEstimate(item)) return <span className={s.muted}>—</span>;
  if (onPlan(item)) return <span className={s.muted}>on plan</span>;
  const d = item.paidCents - item.expectedCents;
  return d > 0 ? <span className={s.over}>+{money(d)}</span> : <span className={s.good}>−{money(-d)}</span>;
}

function Meter({ item }: { item: PlanItem }) {
  const top = Math.max(item.expectedCents, item.paidCents) || 1;
  return (
    <span className={s.meter}>
      <span className={s.mv}>
        <span className={`num ${isOver(item) ? s.over : ""}`}>{item.paidCents ? money(item.paidCents) : "—"}</span>
        <span className="num">{estimateLabel(item)}</span>
      </span>
      <span className={s.bar} style={{ ["--gc" as string]: AREA_COLOR[areaOf(item)] }}>
        <i className={isOver(item) ? s.barOver : undefined} style={{ width: `${(item.paidCents / top) * 100}%` }} />
        {item.expectedCents > 0 ? <b style={{ left: `calc(${(item.expectedCents / top) * 100}% - 1px)` }} /> : null}
      </span>
    </span>
  );
}

// `txns` is the month being shown (offered when linking a charge); `lookup` adds the prior month, since a bill due on the 1st often posts a day or two early.
export function EssentialsSection({ items, txns, lookup, month, today, isCurrent, onChanged }: { items: PlanItem[]; txns: Txn[]; lookup: Txn[]; month: string; today: string; isCurrent: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = items.filter((i) => !i.isReimbursed);
  const dayOfMonth = Number(today.slice(8, 10));
  const txnById = new Map(lookup.map((t) => [t.id, t]));
  const chargesOf = (i: PlanItem) => i.matchedTxnIds.map((id) => txnById.get(id)).filter((t): t is Txn => !!t);

  const planned = rows.reduce((t, i) => t + i.expectedCents, 0);
  const caught = rows.reduce((t, i) => t + i.paidCents, 0);
  const dueItems = rows.filter(unpaid);
  const stillDue = dueItems.reduce((t, i) => t + i.expectedCents, 0);
  const tracked = rows.filter((i) => i.status !== "varies");
  const paidCount = tracked.filter((i) => i.status === "paid").length;
  const vsPlan = caught - planned;
  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  // Coming up: this month's unpaid bills, then next month's first bills once the month is nearly over.
  const soon = [...dueItems].sort((a, z) => (a.dueDay ?? 99) - (z.dueDay ?? 99));
  const nextMonth = isCurrent && daysInMonth - dayOfMonth <= 5
    ? rows.filter((i) => i.dueDay != null && i.dueDay <= 5 && i.status === "paid").sort((a, z) => z.expectedCents - a.expectedCents).slice(0, Math.max(0, 3 - soon.length))
    : [];
  const nextName = new Date(Date.UTC(y, mo, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

  const areas = AREAS.filter((a) => rows.some((i) => areaOf(i) === a));

  // Calendar: fixed bills on the day they posted; still-due bills outlined on their due day.
  const fixed = rows.filter((i) => i.status !== "varies");
  const monthStart = `${month}-01`;
  const byDay = new Map<number, { item: PlanItem; cents: number; due: boolean }[]>();
  const push = (d: number, e: { item: PlanItem; cents: number; due: boolean }) => byDay.set(d, [...(byDay.get(d) ?? []), e]);
  for (const i of fixed) {
    const charges = chargesOf(i);
    const dayOf = (iso: string) => (iso < monthStart ? 0 : Number(iso.slice(8, 10)));
    for (const t of charges) push(dayOf(t.postedOn), { item: i, cents: -t.amountCents, due: false });
    // Until the month's transactions load, place the bill on the day it was last paid.
    if (!charges.length && i.paidOn && i.paidCents) push(dayOf(i.paidOn), { item: i, cents: i.paidCents, due: false });
    if (unpaid(i) && i.dueDay) push(Math.min(i.dueDay, daysInMonth), { item: i, cents: i.expectedCents, due: true });
  }
  const hasPrev = byDay.has(0);
  const ongoing = rows.filter((i) => i.status === "varies");

  // Month bar: every expense as a slice, sized by what it cost (or will cost).
  const slices = rows.map((i) => ({ item: i, cents: unpaid(i) ? i.expectedCents : i.paidCents })).filter((x) => x.cents > 0).sort((a, z) => z.cents - a.cents);
  const barTotal = slices.reduce((t, x) => t + x.cents, 0) || 1;

  return (
    <section className={s.section}>
      <div className={s.head}>
        <div>
          <h2 className={s.title}>Essential expenses</h2>
          <p className={s.sub}>{monthName}{isCurrent ? ` · day ${dayOfMonth} of ${daysInMonth}` : ""} · {paidCount} of {tracked.length} bills paid · click an expense to edit it or see what it caught</p>
        </div>
        <div className={s.kpis}>
          <div><span className={s.lbl}>Planned</span><b className="num">{money(planned)}</b></div>
          <div><span className={s.lbl}>Caught</span><b className="num">{money(caught)}</b></div>
          <div><span className={s.lbl}>Still due</span><b className={`num ${stillDue ? s.warn : ""}`}>{money(stillDue)}</b></div>
          <div><span className={s.lbl}>{vsPlan > 0 ? "Over plan" : "Under plan"}</span><b className={`num ${vsPlan > 0 ? s.over : s.good}`}>{vsPlan > 0 ? "+" : "−"}{money(Math.abs(vsPlan))}</b></div>
        </div>
      </div>

      {soon.length || nextMonth.length ? (
        <div className={s.block}>
          <span className={s.lbl}>Coming up</span>
          <div className={s.cards}>
            {soon.map((i) => (
              <div key={i.id} className={`${s.card} ${i.status === "overdue" ? s.cardLate : s.cardDue}`}>
                <Tile item={i} size={44} />
                <span className={s.cardText}>
                  <span className={s.cardName}>{i.name}</span>
                  <span className={s.when}><span className={s.dot} />{isCurrent ? whenLabel(i, dayOfMonth, isCurrent) : "Not seen"}{i.dueDay ? ` · ${monthName.slice(0, 3)} ${i.dueDay}` : ""}</span>
                </span>
                <span className={`${s.cardAmt} num`}>{money(i.expectedCents)}</span>
              </div>
            ))}
            {nextMonth.map((i) => (
              <div key={i.id} className={s.card}>
                <Tile item={i} size={44} />
                <span className={s.cardText}>
                  <span className={s.cardName}>{i.name}</span>
                  <span className={`${s.when} ${s.muted}`}><span className={s.dot} />In {daysInMonth - dayOfMonth + i.dueDay!} days · {nextName} {i.dueDay}</span>
                </span>
                <span className={`${s.cardAmt} ${s.muted} num`}>{money(i.expectedCents)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={s.ledger}>
        <div className={`${s.row} ${s.colHead}`}>
          <span />
          <span className={s.lbl}>Expense</span>
          <span className={s.lbl}>Actual vs estimate</span>
          <span className={`${s.lbl} ${s.r}`}>Difference</span>
          <span className={s.lbl}>Status</span>
        </div>
        {areas.map((a) => {
          const xs = rows.filter((i) => areaOf(i) === a);
          const act = xs.reduce((t, i) => t + i.paidCents, 0);
          const plan = xs.reduce((t, i) => t + (i.expectedCents || i.paidCents), 0);
          return (
            <Fragment key={a}>
              <div className={s.group}>
                <span className={s.sw} style={{ background: AREA_COLOR[a] }} />
                <span className={s.groupName}>{a}</span>
                <span className={`${s.groupTotal} num ${act > plan * 1.02 ? s.over : ""}`}>{money(act)} of {money(plan)}</span>
              </div>
              {xs.map((i) => {
                const isOpen = open === i.id;
                return (
                  <Fragment key={i.id}>
                    <div
                      className={`${s.row} ${s.item} ${isOpen ? s.itemOpen : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : i.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : i.id); } }}
                    >
                      <Tile item={i} />
                      <span className={s.name}>{i.name}<small>{categoryLabel(i)}</small></span>
                      <Meter item={i} />
                      <span className={`${s.r} num`}><Diff item={i} /></span>
                      <Pill item={i} today={dayOfMonth} isCurrent={isCurrent} charges={i.matchedTxnIds.length} />
                    </div>
                    {isOpen ? <div className={s.detail}><Detail item={i} txns={txns} onChanged={onChanged} onClose={() => setOpen(null)} /></div> : null}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
        <div className={`${s.row} ${s.total}`}>
          <span />
          <span>Total</span>
          <span className="num">{money(caught)} <span className={s.muted}>of {money(planned)}</span></span>
          <span className={`${s.r} num ${vsPlan > 0 ? s.over : s.good}`}>{vsPlan > 0 ? "+" : "−"}{money(Math.abs(vsPlan))}</span>
          <span className={s.muted}>{paidCount} of {tracked.length} paid</span>
        </div>
      </div>
      <AddExpense onChanged={onChanged} />

      <div className={s.block}>
        <span className={s.lbl}>Bill calendar · each bill on the day it posted · outlined = still due</span>
        <div className={s.stripWrap}>
          <div className={s.strip} style={{ gridTemplateColumns: `repeat(${daysInMonth + (hasPrev ? 1 : 0)}, minmax(26px, 1fr))` }}>
            {Array.from({ length: daysInMonth + 1 }, (_, d) => d).filter((d) => d > 0 || hasPrev).map((d) => {
              const dow = d ? new Date(Date.UTC(y, mo - 1, d)).getUTCDay() : -1;
              const isToday = isCurrent && d === dayOfMonth;
              return (
                <div key={d} className={s.day}>
                  <span className={`${s.dayN} ${isToday ? s.dayToday : ""}`}>{d === 0 ? "Before" : d}</span>
                  <div className={`${s.cell} ${dow === 0 || dow === 6 ? s.cellWk : ""} ${isToday ? s.cellToday : ""} ${isCurrent && d > dayOfMonth ? s.cellFut : ""}`}>
                    {(byDay.get(d) ?? []).map((e, k) => (
                      <span
                        key={k}
                        className={`${s.chip} ${e.due ? s.chipDue : ""}`}
                        style={{ ["--gc" as string]: AREA_COLOR[areaOf(e.item)] }}
                        title={`${e.item.name} · ${money(e.cents)}${e.due ? " · still due" : ""}`}
                      >
                        <CategoryIcon category={iconCategory(e.item)} size={14} />
                        <span className="num">{Math.round(e.cents / 100).toLocaleString("en-US")}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {ongoing.length ? (
          <div className={s.ongoing}>
            {ongoing.map((i) => {
              const over = isOver(i);
              const n = i.matchedTxnIds.length;
              return (
                <div key={i.id} className={s.og}>
                  <span className={s.lbl}>{i.name} · ongoing</span>
                  <b className={`num ${over ? s.over : ""}`}>{money(i.paidCents)}</b>
                  <span className={s.ogBar}><i className={over ? s.barOver : undefined} style={{ width: `${Math.min(100, (i.paidCents / (i.expectedCents || 1)) * 100)}%`, background: over ? undefined : AREA_COLOR[areaOf(i)] }} /></span>
                  <span className={s.muted}>of {estimateLabel(i)} · {n} {i.category === "Transport" ? "fill-up" : "charge"}{n === 1 ? "" : "s"}{over ? ` · +${money(i.paidCents - i.expectedCents)}` : ""}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {slices.length ? (
        <div className={s.block}>
          <span className={s.lbl}>The month in one bar · each slice is one expense · striped = not charged yet</span>
          <div className={s.mbar}>
            {slices.map((x) => (
              <span
                key={x.item.id}
                className={unpaid(x.item) ? s.sliceDue : undefined}
                style={{ flexGrow: x.cents, background: unpaid(x.item) ? undefined : AREA_COLOR[areaOf(x.item)] }}
                title={`${x.item.name} · ${money(x.cents)}${unpaid(x.item) ? " · not charged yet" : ""}`}
              />
            ))}
          </div>
          {planned > 0 && planned < barTotal ? (
            <div className={s.mark}><i style={{ left: `${(planned / barTotal) * 100}%` }} /><em style={{ left: `calc(${(planned / barTotal) * 100}% + 8px)` }}>plan {money(planned)}</em></div>
          ) : null}
          <div className={s.legend}>
            {areas.map((a) => {
              const v = slices.filter((x) => areaOf(x.item) === a).reduce((t, x) => t + x.cents, 0);
              return (
                <span key={a}><span className={s.sw} style={{ background: AREA_COLOR[a] }} />{a} <b className="num">{money(v)}</b> <span className={s.muted}>{Math.round((v / barTotal) * 100)}%</span></span>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
