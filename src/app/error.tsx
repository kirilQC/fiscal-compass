"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap" style={{ paddingBlock: 96, maxWidth: 720 }}>
      <p className="eyebrow">Something broke</p>
      <h1 className="serif" style={{ fontWeight: 300, fontSize: 56, lineHeight: 1, margin: "8px 0 20px" }}>
        The page couldn&apos;t render.
      </h1>
      <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{error.message}</p>
      {error.digest ? <p className="faint" style={{ fontSize: 12 }}>digest {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        style={{ marginTop: 20, padding: "9px 16px", border: "1px solid var(--ink)", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase" }}
      >
        Try again
      </button>
    </main>
  );
}
