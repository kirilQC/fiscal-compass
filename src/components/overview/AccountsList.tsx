import Link from "next/link";
import type { Account } from "@/lib/types";
import { prettyName } from "@/components/sections/names";
import s from "./AccountsList.module.css";

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function KindIcon({ kind }: { kind: Account["kind"] }) {
  switch (kind) {
    case "investment":
      return (
        <svg {...ICON}>
          <path d="M2 11.5 6 7.5l2.5 2.5L14 4.5" />
          <path d="M10.5 4.5H14V8" />
        </svg>
      );
    case "credit":
      return (
        <svg {...ICON}>
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
          <path d="M1.5 6.5h13M4 10h3" />
        </svg>
      );
    case "loan":
      return (
        <svg {...ICON}>
          <path d="M2.5 9.5 4 6h8l1.5 3.5v3h-11z" />
          <path d="M2.5 9.5h11M5 12.5v1M11 12.5v1" />
          <circle cx="5" cy="9.7" r="0.6" fill="currentColor" />
          <circle cx="11" cy="9.7" r="0.6" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...ICON}>
          <path d="M2 6.5 8 3l6 3.5H2z" />
          <path d="M3.5 6.5v5M7 6.5v5M9 6.5v5M12.5 6.5v5M2 12.5h12" />
        </svg>
      );
  }
}

function sub(a: Account) {
  if (a.kind === "investment") return a.name.toLowerCase().includes("brokerage") ? prettyName(a.name) : "Brokerage";
  if (a.kind === "checking" || a.kind === "savings") return "Cash";
  if (a.kind === "credit") return "Outstanding balance";
  if (a.kind === "loan") return a.balanceCents === 0 ? "Balance missing" : "Remaining balance";
  return a.institution;
}

function href(a: Account) {
  if (a.kind === "investment") return "/investments";
  if (a.kind === "credit") return "/credit";
  if (a.kind === "loan") return "/goals";
  return "/spending";
}

function label(a: Account) {
  if (a.kind === "investment") return a.institution;
  return prettyName(a.name);
}

export function AccountsList({ accounts }: { accounts: Account[] }) {
  const order: Account["kind"][] = ["investment", "checking", "savings", "credit", "loan", "other"];
  const rows = [...accounts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.balanceCents - a.balanceCents);
  return (
    <section className={s.section}>
      <div className={s.head}>
        <h2 className={s.h2}>Accounts</h2>
        <Link href="/settings" className={s.manage}>
          Manage accounts <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <ul className={s.list}>
        {rows.map((a) => {
          const missing = (a.kind === "loan" || a.kind === "credit") && a.balanceCents === 0;
          const value = a.balanceCents;
          return (
            <li key={a.id}>
              <Link href={missing ? "/settings" : href(a)} className={s.box}>
                <span className={s.top}>
                  <span className={s.icon}>
                    <KindIcon kind={a.kind} />
                  </span>
                  <span className={s.name}>{label(a)}</span>
                  <span className={s.sub}>{sub(a)}</span>
                </span>
                {missing ? (
                  <span className={s.add}>Add balance <b>+</b></span>
                ) : (
                  <span className={`${s.value} num`}>
                    {value < 0 ? "−" : ""}${Math.abs(Math.round(value / 100)).toLocaleString("en-US")}
                  </span>
                )}
                <span className={s.chev} aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
