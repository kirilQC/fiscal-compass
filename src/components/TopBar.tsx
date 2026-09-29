"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./TopBar.module.css";
import { LogoMark } from "./Logo";
import { CreditIcon, GoalsIcon, InvestmentsIcon, OverviewIcon, SettingsIcon, SpendingIcon } from "./NavIcons";

const NAV = [
  { href: "/", label: "Overview", Icon: OverviewIcon },
  { href: "/investments", label: "Investments", Icon: InvestmentsIcon },
  { href: "/credit", label: "Credit", Icon: CreditIcon },
  { href: "/spending", label: "Spending", Icon: SpendingIcon },
  { href: "/goals", label: "Goals", Icon: GoalsIcon },
  { href: "/advisor", label: "Sterling", Icon: SterlingIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

// Sterling, the advisor, appears in the nav as his own small portrait.
function SterlingIcon() {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static avatar
  return <img src="/sterling.jpg" alt="" width={18} height={18} className={styles.avatar} />;
}

function BrandInner() {
  return (
    <>
      <LogoMark size={22} />
      <span className={styles.wordmark}>Fiscal Compass</span>
    </>
  );
}

export function TopBar({ asOf, isSample, loadError }: { asOf: string; isSample: boolean; loadError?: string }) {
  const pathname = usePathname();
  return (
    <header className={styles.bar}>
      <div className={styles.pill}>
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
      </div>
      {isSample || loadError ? (
        <div className={styles.below}>
          {isSample ? <span className={styles.sample} title={`As of ${asOf}`}>Sample data</span> : null}
          {loadError ? <span className={styles.error}>Couldn&apos;t build your dashboard from live data — showing sample numbers. {loadError}</span> : null}
        </div>
      ) : null}
    </header>
  );
}

export function TopBarSkeleton() {
  return (
    <header className={styles.bar}>
      <div className={styles.pill}>
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
