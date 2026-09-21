import Link from "next/link";
import { LinkAccountButton } from "./LinkAccountButton";
import styles from "./Onboarding.module.css";

export function Onboarding() {
  return (
    <main className={`wrap ${styles.page}`}>
      <p className="eyebrow">Getting started</p>
      <h1 className={styles.title}>Connect your <em>accounts.</em></h1>
      <p className={styles.lede}>
        Fiscal Compass reads balances and transactions directly from your bank through Stripe. Nothing is stored
        until you finish the connection, and only balances and activity are shared — never your login.
      </p>

      <ol className={styles.steps}>
        <li>
          <div className={styles.stepHead}>
            <span className={styles.stepName}>Chase</span>
            <span className="faint">Checking, savings, Sapphire card</span>
          </div>
          <p className="muted">Choose Chase in the Stripe window and select every account you want tracked.</p>
          <LinkAccountButton label="Connect Chase" />
        </li>
        <li>
          <div className={styles.stepHead}>
            <span className={styles.stepName}>Fidelity</span>
            <span className="faint">Brokerage balance</span>
          </div>
          <p className="muted">
            Stripe returns the account balance and activity. Individual positions need SnapTrade, which can be
            connected in Settings later.
          </p>
          <LinkAccountButton label="Connect Fidelity" />
        </li>
        <li>
          <div className={styles.stepHead}>
            <span className={styles.stepName}>Car loan</span>
            <span className="faint">Balance, rate, payment</span>
          </div>
          <p className="muted">Loans are not exposed by banks over Stripe, so this one is entered by hand.</p>
          <Link href="/settings" className={styles.link}>Add in Settings →</Link>
        </li>
      </ol>

      <p className={`${styles.note} faint`}>The dashboard fills in the moment the first account lands.</p>
    </main>
  );
}
