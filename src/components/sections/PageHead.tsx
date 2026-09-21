import type { ReactNode } from "react";
import s from "./sections.module.css";

export function PageHead({ title, lede, figs }: { title: ReactNode; lede?: ReactNode; figs?: { value: ReactNode; label: string; tone?: string }[] }) {
  return (
    <header className={s.head}>
      <div>
        <h1 className={s.title}>{title}</h1>
        {lede ? <p className={s.lede}>{lede}</p> : null}
      </div>
      {figs?.length ? (
        <div className={s.figs}>
          {figs.map((f) => (
            <div key={f.label}>
              <b className={`num ${f.tone ?? ""}`}>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function PageFoot({ isSample }: { isSample: boolean }) {
  return (
    <footer className={s.foot}>
      <span>{isSample ? "Sample data — illustrative figures until accounts are linked." : "Figures update with each sync."}</span>
      <span>Chase and Fidelity via Stripe · Supabase · Vercel</span>
    </footer>
  );
}
