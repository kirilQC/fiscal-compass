import type { Dashboard } from "@/lib/types";
import { longDate } from "./util";
import s from "./overview.module.css";

export function Foot({ d }: { d: Dashboard }) {
  return (
    <footer className={s.foot}>
      <span>{d.isSample ? "Sample data — illustrative figures until accounts are linked." : `Synced ${longDate(d.asOf)}`}</span>
      <span>Chase and Fidelity via Stripe · Supabase · Vercel{process.env.VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}</span>
    </footer>
  );
}
