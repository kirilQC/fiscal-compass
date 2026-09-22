import type { Dashboard } from "@/lib/types";
import { longDate } from "./util";
import s from "./overview.module.css";

export function Foot({ d }: { d: Dashboard }) {
  return (
    <footer className={s.foot}>
      <span>{d.isSample ? "Sample data — illustrative figures until accounts are linked." : `Synced ${syncedLabel(d)}`}</span>
      <span>Built by Kiril Ivlev<span hidden data-build={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"} /></span>
    </footer>
  );
}

function syncedLabel(d: Dashboard) {
  if (!d.syncedAt) return longDate(d.asOf);
  const t = new Date(d.syncedAt);
  const day = t.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" });
  const time = t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago" });
  return `${day} @ ${time}`;
}
