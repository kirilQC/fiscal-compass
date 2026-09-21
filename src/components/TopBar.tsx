"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./TopBar.module.css";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/investments", label: "Investments" },
  { href: "/credit", label: "Credit" },
  { href: "/spending", label: "Spending" },
  { href: "/goals", label: "Goals" },
  { href: "/advisor", label: "Advisor" },
];

export function TopBar({ asOf, isSample }: { asOf: string; isSample: boolean }) {
  const pathname = usePathname();
  return (
    <header className={styles.bar}>
      <div className={`wrap ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          Fiscal <em>Compass</em>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? styles.active : undefined} aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.meta}>
          {isSample ? <span className={styles.sample}>Sample data</span> : null}
          <span className="faint">As of {asOf}</span>
          <Link href="/settings" className={styles.settings}>Settings</Link>
        </div>
      </div>
    </header>
  );
}
