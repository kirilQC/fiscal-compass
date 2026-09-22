import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyClose {
  date: string;
  closeCents: number;
}

const UA = "Mozilla/5.0 (compatible; FiscalCompass/1.0)";

export async function fetchDailyCloses(symbol: string, days: number): Promise<DailyClose[]> {
  try {
    const rows = await fromStooq(symbol);
    if (rows.length) return rows.slice(-days);
  } catch {
    // Stooq sits behind a browser challenge from some networks; Yahoo is the fallback.
  }
  const rows = await fromYahoo(symbol, days);
  return rows.slice(-days);
}

async function fromStooq(symbol: string): Promise<DailyClose[]> {
  const res = await fetch(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`, { headers: { "user-agent": UA } });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text.startsWith("Date,")) return [];
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","))
    .filter((c) => c.length >= 5 && c[4] && c[4] !== "N/D")
    .map((c) => ({ date: c[0], closeCents: Math.round(parseFloat(c[4]) * 100) }));
}

async function fromYahoo(symbol: string, days: number): Promise<DailyClose[]> {
  const range = days > 250 ? "2y" : days > 120 ? "1y" : days > 60 ? "6mo" : days > 20 ? "3mo" : "1mo";
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, {
    headers: { "user-agent": UA },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] } };
  const r = json.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyClose[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), closeCents: Math.round(c * 100) });
  }
  return out;
}

export async function upsertPrices(admin: SupabaseClient, symbol: string, rows: DailyClose[]) {
  if (!rows.length) return 0;
  const { error } = await admin
    .from("prices")
    .upsert(rows.map((r) => ({ symbol, as_of: r.date, close_cents: r.closeCents })), { onConflict: "symbol,as_of" });
  if (error) throw new Error(`prices upsert failed: ${error.message}`);
  return rows.length;
}

// Refresh recent closes for every symbol the user holds. Tolerates the prices table being absent.
export async function refreshPrices(admin: SupabaseClient, userId: string): Promise<Record<string, number | string>> {
  const { data } = await admin.from("holdings").select("symbol").eq("user_id", userId);
  const symbols = [...new Set((data ?? []).map((h) => (h.symbol as string).toUpperCase()))].filter((s) => /^[A-Z.]{1,6}$/.test(s));
  const out: Record<string, number | string> = {};
  for (const s of symbols) {
    try {
      out[s] = await upsertPrices(admin, s, await fetchDailyCloses(s, 7));
    } catch (e) {
      out[s] = e instanceof Error ? e.message : String(e);
    }
  }
  return out;
}
