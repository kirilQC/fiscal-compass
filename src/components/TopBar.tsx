"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./TopBar.module.css";
import { LogoMark } from "./Logo";
import { AdvisorIcon, CreditIcon, GoalsIcon, InvestmentsIcon, OverviewIcon, SettingsIcon, SpendingIcon } from "./NavIcons";

const NAV = [
  { href: "/", label: "Overview", Icon: OverviewIcon },
  { href: "/investments", label: "Investments", Icon: InvestmentsIcon },
  { href: "/credit", label: "Credit", Icon: CreditIcon },
  { href: "/spending", label: "Spending", Icon: SpendingIcon },
  { href: "/goals", label: "Goals", Icon: GoalsIcon },
  { href: "/advisor", label: "Advisor", Icon: AdvisorIcon },
];

function BrandInner() {
  return (
    <>
      <LogoMark />
      <span className={styles.wordmark}>
        <span>Fiscal</span>
        <span>Compass</span>
      </span>
    </>
  );
}

export function TopBar({ asOf, isSample, loadError }: { asOf: string; isSample: boolean; loadError?: string }) {
  const pathname = usePathname();
  return (
    <header className={styles.bar}>
      <div className={`wrap ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          <BrandInner />
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? styles.active : undefined} aria-current={active ? "page" : undefined} aria-label={label}>
                <Icon />
                <span className={styles.label}>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.meta}>
          {isSample ? <span className={styles.sample} title={`As of ${asOf}`}>Sample data</span> : null}
          <Link href="/settings" className={`${styles.settings} ${pathname.startsWith("/settings") ? styles.active : ""}`} aria-label="Settings">
            <SettingsIcon />
            <span className={styles.label}>Settings</span>
          </Link>
        </div>
      </div>
      {loadError ? <div className={`wrap ${styles.error}`}>Couldn&apos;t build your dashboard from live data — showing sample numbers. {loadError}</div> : null}
    </header>
  );
}

export function TopBarSkeleton() {
  return (
    <header className={styles.bar}>
      <div className={`wrap ${styles.inner}`}>
        <span className={styles.brand}>
          <BrandInner />
        </span>
        <nav className={styles.nav} aria-hidden="true">
          {NAV.map(({ href, label, Icon }) => (
            <span key={href}>
              <Icon />
              <span className={styles.label}>{label}</span>
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
