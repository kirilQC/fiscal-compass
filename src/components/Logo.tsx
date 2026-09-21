export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="var(--accent)" />
      <path d="M16 6.5a9.5 9.5 0 1 0 9.5 9.5" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 25.5a9.5 9.5 0 0 0 0-19" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <circle cx="16" cy="16" r="3.2" fill="var(--accent-ink)" />
    </svg>
  );
}
