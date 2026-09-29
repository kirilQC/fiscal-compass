import type { ChartSpec } from "@/lib/advisor/agent";
import s from "./AdvisorChart.module.css";

// Charts the advisor draws inside an answer: bar, line and donut, from the spec it sends through show_chart.

const SERIES = ["var(--accent)", "var(--cat-1)", "var(--cat-3)"];
const DONUT = ["var(--cat-1)", "var(--accent)", "var(--cat-3)", "var(--cat-4)", "var(--cat-7)", "var(--cat-2)", "var(--cat-5)", "var(--ink3)"];

function fmt(v: number, unit: ChartSpec["unit"], short = false) {
  if (unit === "pct") return `${Math.round(v)}%`;
  if (unit === "count") return String(Math.round(v));
  const a = Math.abs(v);
  if (short && a >= 1000) return `${v < 0 ? "−" : ""}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${v < 0 ? "−" : ""}$${a.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 })}`;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) ?? v;
}

function Legend({ spec }: { spec: ChartSpec }) {
  if (spec.series.length < 2) return null;
  return <div className={s.legend}>{spec.series.map((x, i) => <span key={x.name}><i style={{ background: SERIES[i] }} />{x.name}</span>)}</div>;
}

function Columns({ spec }: { spec: ChartSpec }) {
  const W = 560, H = 210, L = 44, B = 26, T = 14;
  const all = spec.series.flatMap((x) => x.values).concat(spec.reference ? [spec.reference.value] : []);
  const max = niceMax(Math.max(...all, 0));
  const n = spec.labels.length, k = spec.series.length;
  const band = (W - L) / n, bw = Math.min(40, (band * 0.7) / k);
  const y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={spec.title}>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} className={s.grid} /><text x={L - 8} y={y(max * f) + 4} className={s.axis} textAnchor="end">{fmt(max * f, spec.unit, true)}</text></g>)}
      {spec.labels.map((lab, i) => (
        <g key={lab + i}>
          {spec.series.map((x, j) => { const cx = L + band * i + band / 2 - (bw * k) / 2 + bw * j; return (
            <g key={x.name}>
              <rect x={cx} y={y(x.values[i])} width={bw - 3} height={Math.max(0, H - B - y(x.values[i]))} rx={3} fill={SERIES[j]} opacity={k > 1 && j > 0 ? 0.75 : 1}><title>{`${lab} · ${x.name}: ${fmt(x.values[i], spec.unit)}`}</title></rect>
              {k === 1 && n <= 12 ? <text x={cx + (bw - 3) / 2} y={y(x.values[i]) - 5} className={s.val} textAnchor="middle">{fmt(x.values[i], spec.unit, true)}</text> : null}
            </g>); })}
          <text x={L + band * i + band / 2} y={H - 8} className={s.axis} textAnchor="middle">{lab.length > 9 ? lab.slice(0, 8) + "…" : lab}</text>
        </g>
      ))}
      {spec.reference ? <g><line x1={L} x2={W} y1={y(spec.reference.value)} y2={y(spec.reference.value)} className={s.ref} /><text x={W} y={y(spec.reference.value) - 5} className={s.refLabel} textAnchor="end">{spec.reference.label} {fmt(spec.reference.value, spec.unit, true)}</text></g> : null}
    </svg>
  );
}

// Long labels (merchants, categories) read better as horizontal bars.
function Rows({ spec }: { spec: ChartSpec }) {
  const x = spec.series[0];
  const max = Math.max(...x.values, spec.reference?.value ?? 0, 1);
  return (
    <div className={s.rows}>
      {spec.labels.map((lab, i) => (
        <div key={lab + i} className={s.row}>
          <span className={s.rowLabel}>{lab}</span>
          <span className={s.rowBar}><i style={{ width: `${(Math.max(0, x.values[i]) / max) * 100}%` }} />{spec.reference ? <b style={{ left: `${(spec.reference.value / max) * 100}%` }} /> : null}</span>
          <span className={`${s.rowVal} num`}>{fmt(x.values[i], spec.unit)}</span>
        </div>
      ))}
      {spec.reference ? <div className={s.refNote}>line: {spec.reference.label} {fmt(spec.reference.value, spec.unit)}</div> : null}
    </div>
  );
}

function Line({ spec }: { spec: ChartSpec }) {
  const W = 560, H = 210, L = 44, R = 12, B = 26, T = 14;
  const all = spec.series.flatMap((x) => x.values).concat(spec.reference ? [spec.reference.value] : []);
  const max = niceMax(Math.max(...all, 0)), n = spec.labels.length;
  const X = (i: number) => L + (n === 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
  const Y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const every = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={spec.title}>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={Y(max * f)} y2={Y(max * f)} className={s.grid} /><text x={L - 8} y={Y(max * f) + 4} className={s.axis} textAnchor="end">{fmt(max * f, spec.unit, true)}</text></g>)}
      {spec.labels.map((lab, i) => (i % every === 0 || i === n - 1 ? <text key={lab + i} x={X(i)} y={H - 8} className={s.axis} textAnchor="middle">{lab}</text> : null))}
      {spec.reference ? <g><line x1={L} x2={W - R} y1={Y(spec.reference.value)} y2={Y(spec.reference.value)} className={s.ref} /><text x={W - R} y={Y(spec.reference.value) - 5} className={s.refLabel} textAnchor="end">{spec.reference.label}</text></g> : null}
      {spec.series.map((x, j) => {
        const pts = x.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
        return (
          <g key={x.name}>
            {j === 0 ? <polygon points={`${X(0)},${Y(0)} ${pts} ${X(n - 1)},${Y(0)}`} fill={SERIES[0]} opacity={0.12} /> : null}
            <polyline points={pts} fill="none" stroke={SERIES[j]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            {x.values.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={i === n - 1 ? 4 : 2.6} fill={SERIES[j]}><title>{`${spec.labels[i]} · ${x.name}: ${fmt(v, spec.unit)}`}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ spec }: { spec: ChartSpec }) {
  const vals = spec.series[0].values.map((v) => Math.max(0, v));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const R = 62, C = 2 * Math.PI * R;
  const lens = vals.map((v) => (v / total) * C);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className={s.donutWrap}>
      <svg viewBox="0 0 160 160" className={s.donut} role="img" aria-label={spec.title}>
        {vals.map((v, i) => (
          <circle key={i} cx={80} cy={80} r={R} fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth={22} strokeDasharray={`${Math.max(0, lens[i] - 1.5)} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 80 80)">
            <title>{`${spec.labels[i]}: ${fmt(v, spec.unit)}`}</title>
          </circle>
        ))}
        <text x={80} y={78} textAnchor="middle" className={s.donutTotal}>{fmt(total, spec.unit, true)}</text>
        <text x={80} y={96} textAnchor="middle" className={s.axis}>total</text>
      </svg>
      <ul className={s.donutLegend}>
        {spec.labels.map((lab, i) => <li key={lab + i}><i style={{ background: DONUT[i % DONUT.length] }} /><span>{lab}</span><b className="num">{fmt(vals[i], spec.unit)}</b><em>{Math.round((vals[i] / total) * 100)}%</em></li>)}
      </ul>
    </div>
  );
}

export function AdvisorChart({ spec }: { spec: ChartSpec }) {
  const longLabels = spec.labels.some((l) => l.length > 9) || spec.labels.length > 12;
  return (
    <figure className={s.figure}>
      {spec.title ? <figcaption className={s.title}>{spec.title}</figcaption> : null}
      {spec.type === "donut" ? <Donut spec={spec} /> : spec.type === "line" ? <Line spec={spec} /> : longLabels && spec.series.length === 1 ? <Rows spec={spec} /> : <Columns spec={spec} />}
      <Legend spec={spec} />
    </figure>
  );
}
