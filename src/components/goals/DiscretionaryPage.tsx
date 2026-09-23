"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dashboard } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import s from "./DiscretionaryPage.module.css";

const STEP = 2500; // $25
const W = 1040;
const H = 1360;
const PAD = { t: 120, b: 120, l: 150, r: 190 };
const VX = PAD.l;
const VY = PAD.t;
const VW = W - PAD.l - PAD.r;
const VH = H - PAD.t - PAD.b;

// Liquid tints are fixed rose values from the chart palette; they read on either theme.
const ESSENTIAL_FILL = "#cc5068";
const POCKET_FILL = "#f1aab8";
const LIQUID_INK = "rgba(17,16,19,.78)";

const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Theme {
  ink: string;
  ink2: string;
  ink3: string;
  bg: string;
  rule: string;
  accent: string;
  crit: string;
  sans: string;
  serif: string;
}

function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: get("--ink", "#f1edee"),
    ink2: get("--ink2", "#9a969b"),
    ink3: get("--ink3", "#6b676c"),
    bg: get("--bg", "#111013"),
    rule: get("--rule", "#2a282c"),
    accent: get("--accent", "#e2536b"),
    crit: get("--crit", "#e07070"),
    sans: get("--sans", "Work Sans, sans-serif"),
    serif: get("--serif", "Cormorant Garamond, serif"),
  };
}

export function DiscretionaryPage({ d }: { d: Dashboard }) {
  const {
    incomeCents: income,
    essentialsPlannedCents: essentialsPlanned,
    availableCents: available,
    budgetCents: savedBudget,
    spentTotalCents: spentTotal,
    spentEssentialCents: essSpent,
    spentDiscretionaryCents: discSpent,
    history,
    month,
  } = d.discretionary;

  const [budget, setBudget] = useState(clamp(savedBudget, 0, available));
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "pending" | "error">("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const budgetRef = useRef(budget);
  const drawRef = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOfMonth = Math.min(daysInMonth, Number(d.asOf.slice(8, 10)) || daysInMonth);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  const kept = available - budget;
  const over = discSpent - budget;
  const left = Math.max(0, -over);
  const perDay = daysLeft > 0 ? left / daysLeft : left;
  const spentPct = income ? Math.round((spentTotal / income) * 100) : 0;

  const commit = useCallback((value: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave("saving");
      try {
        const r = await fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ discretionaryBudgetCents: value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) setSave("error");
        else setSave(j.discretionaryPersisted === false ? "pending" : "saved");
      } catch {
        setSave("error");
      }
    }, 600);
  }, []);

  const setAndCommit = useCallback(
    (raw: number) => {
      const v = clamp(Math.round(raw / STEP) * STEP, 0, available);
      setBudget(v);
      commit(v);
    },
    [available, commit],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // The canvas loop reads the budget through a ref so dragging never restarts the wave.
  useEffect(() => {
    budgetRef.current = budget;
    drawRef.current?.();
  }, [budget]);

  // Canvas: the glass, its two liquid layers, and the draggable cap line.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const theme = readTheme(cv);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    let raf = 0;

    const yOf = (v: number) => VY + VH - (income ? (v / income) * VH : 0);

    const rr = (x: number, yy: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, yy);
      ctx.arcTo(x + w, yy, x + w, yy + h, r);
      ctx.arcTo(x + w, yy + h, x, yy + h, r);
      ctx.arcTo(x, yy + h, x, yy, r);
      ctx.arcTo(x, yy, x + w, yy, r);
      ctx.closePath();
    };

    const wavePath = (level: number, bottom: number, amp: number) => {
      ctx.beginPath();
      ctx.moveTo(VX, bottom);
      for (let px = 0; px <= VW; px += 6) {
        ctx.lineTo(VX + px, level + Math.sin(px / 70 + t) * amp + Math.sin(px / 31 - t * 1.3) * amp * 0.45);
      }
      ctx.lineTo(VX + VW, bottom);
      ctx.closePath();
    };

    const draw = () => {
      if (!reduced) t += 0.026;
      const disc = budgetRef.current;
      const cap = essSpent + disc;
      const isOver = spentTotal > cap;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      rr(VX, VY, VW, VH, 20);
      ctx.strokeStyle = theme.rule;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.015)";
      ctx.fill();
      ctx.restore();

      ctx.save();
      rr(VX + 1, VY + 1, VW - 2, VH - 2, 19);
      ctx.clip();
      wavePath(yOf(spentTotal), VY + VH, 9);
      ctx.clip();
      const bandTop = Math.min(spentTotal, cap);
      ctx.fillStyle = ESSENTIAL_FILL;
      ctx.fillRect(VX, yOf(essSpent), VW, VY + VH - yOf(essSpent));
      ctx.fillStyle = POCKET_FILL;
      ctx.fillRect(VX, yOf(bandTop), VW, yOf(essSpent) - yOf(bandTop));
      if (isOver) {
        ctx.fillStyle = theme.crit;
        ctx.fillRect(VX, yOf(spentTotal), VW, yOf(cap) - yOf(spentTotal));
      }
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(VX, yOf(spentTotal), VW, 6);
      ctx.globalAlpha = 1;
      ctx.restore();

      // Band labels sit inside the liquid.
      ctx.textAlign = "left";
      ctx.fillStyle = LIQUID_INK;
      if (yOf(0) - yOf(essSpent) > 64) {
        ctx.font = `500 22px ${theme.sans}`;
        ctx.fillText("Essentials", VX + 30, (yOf(0) + yOf(essSpent)) / 2 - 6);
        ctx.font = `300 34px ${theme.serif}`;
        ctx.fillText(fmt(essSpent), VX + 30, (yOf(0) + yOf(essSpent)) / 2 + 30);
      }
      const dMid = (yOf(essSpent) + yOf(spentTotal)) / 2;
      if (yOf(essSpent) - yOf(spentTotal) > 64) {
        ctx.fillStyle = LIQUID_INK;
        ctx.font = `500 22px ${theme.sans}`;
        ctx.fillText("Pocket money", VX + 30, dMid - 6);
        ctx.font = `300 34px ${theme.serif}`;
        ctx.fillText(fmt(discSpent), VX + 30, dMid + 30);
      }

      // The draggable cap line.
      const ly = yOf(Math.min(cap, income));
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = isOver ? theme.crit : theme.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(VX - 42, ly);
      ctx.lineTo(VX + VW + 42, ly);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(VX + VW + 42, ly, 11, 0, Math.PI * 2);
      ctx.fillStyle = isOver ? theme.crit : theme.accent;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      rr(VX + 1, VY + 1, VW - 2, VH - 2, 19);
      ctx.clip();
      ctx.textAlign = "right";
      ctx.font = `500 20px ${theme.sans}`;
      ctx.fillStyle = spentTotal >= cap ? LIQUID_INK : isOver ? theme.crit : theme.accent;
      ctx.fillText(`CAP  ${fmt(disc)}`, VX + VW - 22, ly + 28);
      ctx.restore();

      ctx.textAlign = "right";
      ctx.font = `19px ${theme.sans}`;
      ctx.fillStyle = theme.ink3;
      ctx.setLineDash([]);
      [0, income / 3, (income / 3) * 2, income].forEach((v) => {
        ctx.fillText(v ? `$${(v / 100000).toFixed(1)}k` : "$0", VX - 56, yOf(v) + 7);
      });

      ctx.textAlign = "left";
      ctx.font = `19px ${theme.sans}`;
      ctx.fillStyle = theme.ink2;
      ctx.fillText("INCOME THIS MONTH", VX, VY - 58);
      ctx.font = `300 56px ${theme.serif}`;
      ctx.fillStyle = theme.ink;
      ctx.fillText(fmt(income), VX, VY - 14);
      ctx.textAlign = "right";
      ctx.font = `19px ${theme.sans}`;
      ctx.fillStyle = theme.ink2;
      ctx.fillText("SPENT SO FAR", VX + VW, VY - 58);
      ctx.font = `300 56px ${theme.serif}`;
      ctx.fillStyle = isOver ? theme.crit : theme.ink;
      ctx.fillText(fmt(spentTotal), VX + VW, VY - 14);
      ctx.textAlign = "center";
      ctx.font = `19px ${theme.sans}`;
      ctx.fillStyle = theme.ink3;
      ctx.fillText(`${spentPct}% of the month's income · day ${dayOfMonth} of ${daysInMonth}`, VX + VW / 2, VY + VH + 62);

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    drawRef.current = draw;
    draw();
    return () => {
      cancelAnimationFrame(raf);
      drawRef.current = null;
    };
  }, [income, essSpent, discSpent, spentTotal, spentPct, dayOfMonth, daysInMonth]);

  const fromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const b = cv.getBoundingClientRect();
    const py = ((e.clientY - b.top) * H) / b.height;
    setAndCommit(clamp((((VY + VH - py) / VH) * income) - essSpent, 0, available));
  };

  const dragging = useRef(false);
  const histMax = Math.max(budget * 1.18, ...history.map((h) => h.spentCents), 1);

  return (
    <main className={`wrap ${s.page}`}>
      <header className={s.head}>
        <h1 className={s.h1}>Discretionary</h1>
        <p className={s.sub}>
          {fmt(income)} comes in. {fmt(essentialsPlanned)} is spoken for. What&apos;s left is yours to decide.
        </p>
      </header>

      <div className={s.wrap}>
        <div className={s.glass}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            role="slider"
            tabIndex={0}
            aria-label="Monthly discretionary budget"
            aria-valuemin={0}
            aria-valuemax={Math.round(available / 100)}
            aria-valuenow={Math.round(budget / 100)}
            aria-valuetext={`${fmt(budget)} a month`}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              fromEvent(e);
            }}
            onPointerMove={(e) => { if (dragging.current) fromEvent(e); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); setAndCommit(budget + STEP); }
              if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); setAndCommit(budget - STEP); }
            }}
          />
          <p className={s.hint}>
            Drag the dashed line up or down on the glass — or use the slider — to set how much of the {fmt(available)} is pocket money.
          </p>
        </div>

        <div>
          <div className={s.eyebrow}>Monthly discretionary budget</div>
          <div className={`${s.big} num`}>{fmt(budget)}</div>
          <div className={s.sl}>
            <input
              type="range"
              min={0}
              max={Math.max(available, STEP)}
              step={STEP}
              value={budget}
              aria-label="Monthly discretionary budget"
              style={{ "--p": `${available ? (budget / available) * 100 : 0}%` } as React.CSSProperties}
              onChange={(e) => setBudget(Number(e.target.value))}
              onPointerUp={() => setAndCommit(budget)}
              onKeyUp={() => setAndCommit(budget)}
              onBlur={() => setAndCommit(budget)}
            />
            <div className={s.ends}>
              <span>$0</span>
              <span className="num">{fmt(available)} — all of it</span>
            </div>
            <p className={s.saveline}>
              {save === "saving" ? "Saving…" : null}
              {save === "saved" ? "Saved." : null}
              {save === "pending" ? <span className={s.crit}>Run migration 0006_discretionary.sql in Supabase to keep this between visits.</span> : null}
              {save === "error" ? <span className={s.crit}>Couldn&apos;t save that — try again.</span> : null}
            </p>
          </div>

          <div className={s.rows}>
            <div className={s.row}><span className={s.k}>Income</span><span className={`${s.v} num`}>{fmt(income)}</span></div>
            <div className={s.row}><span className={s.k}>Essential expenses</span><span className={`${s.v} num`}>−{fmt(essentialsPlanned)}</span></div>
            <div className={s.row}><span className={s.k}>Available to split</span><span className={`${s.v} num`}>{fmt(available)}</span></div>
            <div className={s.row}><span className={s.k}>Kept each month</span><span className={`${s.v} num`}>{fmt(kept)}</span></div>
            <div className={s.row}><span className={s.k}>Kept over a year</span><span className={`${s.v} num`}>{fmt(kept * 12)}</span></div>
            <div className={s.row}>
              <span className={s.k}>Spent on pocket money</span>
              <span className={`${s.v} num ${over > 0 ? s.crit : ""}`}>{fmt(discSpent)}<small>of {fmt(budget)}</small></span>
            </div>
            <div className={s.row}>
              <span className={s.k}>Safe to spend · {daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>
              <span className={`${s.v} num ${over > 0 ? s.crit : s.good}`}>{over > 0 ? "$0" : fmt(perDay)}</span>
            </div>
          </div>

          <p className={s.note}>
            {over > 0 ? (
              <>Pocket money is <b className={s.crit}>{fmt(over)} over</b> the cap with {daysLeft} day{daysLeft === 1 ? "" : "s"} still to go. Holding off until the 1st keeps the month from eating into the {fmt(kept)} you meant to keep.</>
            ) : (
              <><b>{fmt(left)}</b> of pocket money left — about <b>{fmt(perDay)}</b> a day for the {daysLeft} day{daysLeft === 1 ? "" : "s"} remaining.</>
            )}
          </p>

          <div className={s.hist}>
            <div className={s.eyebrow}>Pocket money · six months</div>
            <div className={s.plot}>
              <div className={s.bline} style={{ bottom: `${(budget / histMax) * 100}%` }}><span>Cap</span></div>
              {history.map((h) => (
                <div
                  key={h.month}
                  className={s.bar}
                  style={{ height: `${(h.spentCents / histMax) * 100}%`, background: h.spentCents > budget ? "var(--crit)" : POCKET_FILL }}
                  title={`${monthLabel(h.month)} · ${fmt(h.spentCents)}`}
                />
              ))}
            </div>
            <div className={s.mrow}>
              {history.map((h) => (
                <span key={h.month}>
                  {monthLabel(h.month)}
                  <b className={`num ${h.spentCents > budget ? s.crit : ""}`}>{fmt(h.spentCents)}</b>
                </span>
              ))}
            </div>
          </div>

          <div className={s.later}>Longer-range goals come later — this page is about {monthName}.</div>
        </div>
      </div>
    </main>
  );
}
