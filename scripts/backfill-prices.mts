import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const probe = await admin.from("prices").select("symbol").limit(1);
if (probe.error) {
  console.log("prices table missing — run supabase/migrations/0005_prices.sql first:", probe.error.message);
  process.exit(0);
}

const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1y&interval=1d", { headers: { "user-agent": "Mozilla/5.0" } });
const json: any = await res.json();
const r = json.chart.result[0];
const rows: { symbol: string; as_of: string; close_cents: number }[] = [];
r.timestamp.forEach((t: number, i: number) => {
  const c = r.indicators.quote[0].close[i];
  if (c != null) rows.push({ symbol: "SPY", as_of: new Date(t * 1000).toISOString().slice(0, 10), close_cents: Math.round(c * 100) });
});
const recent = rows.slice(-120);
const { error } = await admin.from("prices").upsert(recent, { onConflict: "symbol,as_of" });
if (error) throw error;
console.log(`backfilled ${recent.length} SPY closes; latest ${recent.at(-1)!.as_of} = $${(recent.at(-1)!.close_cents / 100).toFixed(2)}`);
