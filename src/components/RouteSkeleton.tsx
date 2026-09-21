import { TopBarSkeleton } from "./TopBar";
import styles from "./TopBar.module.css";

export function RouteSkeleton() {
  return (
    <>
      <TopBarSkeleton />
      <main className={`wrap ${styles.skeleton}`} aria-busy="true" aria-label="Loading">
        <span className={styles.skelEyebrow} />
        <span className={styles.skelHero} />
        <span className={styles.skelLine} />
        <div className={styles.skelRow}>
          <span />
          <span />
          <span />
        </div>
        <span className={styles.skelLine} />
      </main>
    </>
  );
}
