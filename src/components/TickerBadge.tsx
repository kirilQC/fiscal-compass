export function TickerBadge({ symbol, size = 44 }: { symbol: string; size?: number }) {
  const fontSize = symbol.length > 4 ? size * 0.26 : size * 0.32;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: "var(--surface2)",
        border: "1px solid var(--rule2)",
        fontFamily: "var(--sans)",
        fontWeight: 600,
        fontSize,
        letterSpacing: "0.02em",
        color: "var(--ink)",
        overflow: "hidden",
        flex: "none",
      }}
    >
      {symbol}
      <i style={{ position: "absolute", left: size * 0.22, right: size * 0.22, bottom: size * 0.16, height: 2, background: "var(--accent)", borderRadius: 1 }} />
    </span>
  );
}
