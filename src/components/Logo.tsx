// Three interlocking crescents (each the difference of two offset circles) forming a triangular knot.
const CRESCENT = "M75.2 23.4 A27 27 0 1 0 44.4 59.4 A24 24 0 0 1 75.2 23.4 Z";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g fill="var(--accent)">
        <path d={CRESCENT} />
        <path d={CRESCENT} transform="rotate(120 50 50)" />
        <path d={CRESCENT} transform="rotate(240 50 50)" />
      </g>
    </svg>
  );
}
