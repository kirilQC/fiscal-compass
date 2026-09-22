const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const money = (cents: number) => usd0.format(cents / 100);
export const moneyExact = (cents: number) => usd2.format(cents / 100);
export const signed = (cents: number) => (cents >= 0 ? "+" : "−") + usd0.format(Math.abs(cents) / 100);
export const pct = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
export const compact = (cents: number) => {
  const v = cents / 100;
  return Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : usd0.format(v);
};
export const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
export const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const prettyMerchant = (m: string) => {
  const cleaned = m.replace(/^(www\.|tst\*|sq \*|fh\*|ubr\*\s*)/i, "").replace(/\.com$/i, "").replace(/\s+/g, " ").trim();
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
};
