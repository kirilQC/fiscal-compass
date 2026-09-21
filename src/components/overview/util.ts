import type { Tone } from "@/components/charts";

export const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export const monthShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export const plainMoney = (cents: number) => {
  const abs = Math.abs(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return cents < 0 ? `−$${abs}` : `$${abs}`;
};

export const toneOf = (pct: number): Tone => (pct >= 100 ? "crit" : pct >= 90 ? "warn" : "good");
