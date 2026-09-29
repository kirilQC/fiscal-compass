"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart } from "@/components/charts";
import { monthLabel } from "@/lib/format";
import { band, SCORE_MODELS, type CreditReport, type CreditScore as Score } from "@/lib/credit";
import { call } from "@/components/sections/api";
import s from "./CreditScore.module.css";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Screenshots are shrunk to a readable JPEG before upload so a handful fit under the 4 MB request limit.
async function shrink(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.size < 900_000) return f;
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : f;
  } catch { return f; }
}

export function CreditScore({ scores, report }: { scores: Score[]; report: CreditReport | null }) {
  const router = useRouter();
  const last = scores[scores.length - 1] ?? null;
  const model = last?.model ?? SCORE_MODELS[0];
  // One point per month (the latest reading) in the model he reads most recently, so the line compares like with like.
  const byMonth = new Map<string, Score>();
  for (const x of scores.filter((x) => x.model === model)) byMonth.set(x.asOf.slice(0, 7), x);
  const line = [...byMonth.values()];
  const prev = line.length > 1 ? line[line.length - 2] : null;
  const diff = last && prev && last.model === model ? last.score - prev.score : null;

  const [mode, setMode] = useState<"none" | "log" | "history" | "report">("none");
  const [f, setF] = useState({ score: "", asOf: today(), model });
  const [st, setSt] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const [up, setUp] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const fileRef = useRef<HTMLInputElement>(null);

  async function log(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(f.score);
    if (!Number.isInteger(n) || n < 300 || n > 850) return setSt({ busy: false, err: "Scores run from 300 to 850." });
    setSt({ busy: true });
    const r = await call("/api/credit-score", "POST", { score: n, asOf: f.asOf, model: f.model });
    if (!r.ok) return setSt({ busy: false, err: r.error });
    setSt({ busy: false, msg: `Logged ${n}.` }); setF({ ...f, score: "" }); setMode("none");
    router.refresh();
  }
  async function remove(id: string) {
    const r = await call("/api/credit-score", "DELETE", { id });
    if (r.ok) router.refresh();
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUp({ busy: true });
    const fd = new FormData();
    for (const file of await Promise.all([...list].map(shrink))) fd.append("files", file);
    try {
      const res = await fetch("/api/credit-report", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setUp({ busy: false, err: j.error ?? "Upload failed." });
      setUp({ busy: false, msg: `Read it. Found ${j.scores} score reading${j.scores === 1 ? "" : "s"} and saved ${j.facts?.length ?? 0} fact${j.facts?.length === 1 ? "" : "s"} for Sterling.` });
      setMode("report");
      router.refresh();
    } catch {
      setUp({ busy: false, err: "Upload failed. Check the connection and try again." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const lo = line.length ? Math.floor((Math.min(...line.map((p) => p.score)) - 25) / 10) * 10 : 600;
  const hi = line.length ? Math.ceil((Math.max(...line.map((p) => p.score)) + 25) / 10) * 10 : 800;

  return (
    <section className={s.band} aria-label="Credit score">
      <div className={s.now}>
        <div className={s.eyebrow}>Credit score</div>
        {last ? (
          <>
            <div className={s.scoreRow}>
              <span className={`${s.score} num`}>{last.score}</span>
              {diff ? <span className={diff > 0 ? s.up : s.down}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}</span> : null}
            </div>
            <div className={s.meta}><b>{band(last.score)}</b> · {last.model} · {day(last.asOf)}</div>
            <Gauge score={last.score} />
          </>
        ) : (
          <p className={s.hint}>Nothing logged yet. Add the number from Chase Credit Journey, or upload your Credit Journey history and the past readings fill in on their own.</p>
        )}
      </div>

      <div className={s.chart}>
        {line.length > 1 ? (
          <LineChart
            ariaLabel={`Credit score over time, ${model}`}
            series={[{ id: "score", points: line.map((p) => ({ date: p.asOf, valueCents: p.score })), area: true }]}
            width={760} height={190} pad={{ top: 14, right: 16, bottom: 30, left: 0 }}
            yTicks={3} yMin={lo} yMax={hi}
            formatY={(v) => String(Math.round(v))}
            endpointLabel={(v) => String(Math.round(v))}
            references={[670, 740, 800].filter((v) => v > lo && v < hi).map((v) => ({ value: v, label: band(v), color: "var(--ink3)", dashed: true }))}
            xLabel={(p) => monthLabel(p.date.slice(0, 7))}
          />
        ) : (
          <p className={s.hint}>{last ? "The trend draws in from the second month. Sterling asks for the number once a month." : "Log a few months, or upload your history, to see the trend here."}</p>
        )}
      </div>

      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={() => setMode(mode === "log" ? "none" : "log")} aria-expanded={mode === "log"}>Log score</button>
        <button type="button" className={s.ghost} onClick={() => fileRef.current?.click()} disabled={up.busy}>{up.busy ? "Reading your report…" : report ? "Upload a newer report" : "Upload Credit Journey"}</button>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
        <span className={s.links}>
          {scores.length ? <button type="button" onClick={() => setMode(mode === "history" ? "none" : "history")}>History · {scores.length}</button> : null}
          {report ? <button type="button" onClick={() => setMode(mode === "report" ? "none" : "report")}>What Sterling read</button> : null}
        </span>
        {up.busy ? <span className={s.hint}>PDF or screenshots, read once. This takes up to a minute.</span> : null}
        {up.msg ? <span className={s.ok}>{up.msg}</span> : null}
        {up.err ? <span className={s.err}>{up.err}</span> : null}
        {st.msg && mode === "none" ? <span className={s.ok}>{st.msg}</span> : null}
      </div>

      {mode === "log" ? (
        <form className={s.drawer} onSubmit={log}>
          <label className={s.field}><span>Score</span><input className={`${s.input} num`} inputMode="numeric" autoFocus value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} placeholder="742" /></label>
          <label className={s.field}><span>As of</span><input className={s.input} type="date" value={f.asOf} max={today()} onChange={(e) => setF({ ...f, asOf: e.target.value })} /></label>
          <label className={s.field}><span>From</span>
            <select className={s.input} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>
              <option value="VantageScore 3.0">Chase Credit Journey (VantageScore 3.0)</option>
              <option value="FICO 8">Experian app (FICO 8)</option>
              <option value="Other">Somewhere else</option>
            </select>
          </label>
          <button type="submit" className={s.primary} disabled={st.busy}>{st.busy ? "Saving…" : "Save"}</button>
          {st.err ? <span className={s.err}>{st.err}</span> : null}
        </form>
      ) : null}

      {mode === "history" ? (
        <div className={s.drawer}>
          <ul className={s.hist}>
            {[...scores].reverse().map((x) => (
              <li key={x.id}>
                <span className="num">{day(x.asOf)}</span>
                <b className="num">{x.score}</b>
                <span>{x.model}{x.source === "upload" ? " · from upload" : x.source === "sterling" ? " · told Sterling" : ""}</span>
                <button type="button" onClick={() => remove(x.id)} aria-label={`Delete ${x.score} on ${x.asOf}`}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "report" && report ? (
        <div className={s.drawer}>
          <div className={s.report}>
            <p className={s.summary}>{report.summary}</p>
            {report.facts.length ? (
              <>
                <div className={s.eyebrow}>Saved to Sterling&apos;s memory</div>
                <ul className={s.facts}>{report.facts.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            ) : null}
            <details className={s.details}><summary>Full rundown Sterling reads</summary><pre>{report.details}</pre></details>
            <p className={s.hint}>From {report.files.join(", ") || "your upload"} · {day(report.uploadedAt.slice(0, 10))} · <button type="button" className={s.inline} onClick={() => remove(report.id)}>Remove report</button> (the saved facts stay in Settings, where you can edit them)</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// 300 to 850 on one track, with the bands marked; the dot is where he is.
function Gauge({ score }: { score: number }) {
  const at = (v: number) => `${((v - 300) / 550) * 100}%`;
  return (
    <div className={s.gauge} role="img" aria-label={`${score} on a 300 to 850 scale`}>
      <div className={s.track}>
        {[580, 670, 740, 800].map((v) => <i key={v} style={{ left: at(v) }} />)}
        <b style={{ left: at(score) }} />
      </div>
      <div className={s.ticks}><span>300</span><span style={{ left: at(670) }}>670</span><span style={{ left: at(740) }}>740</span><span>850</span></div>
    </div>
  );
}
