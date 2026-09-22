import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await admin.from("prices").select("as_of,close_cents").eq("symbol", "SPY").order("as_of");
const rows = data ?? [];
console.log("count", rows.length, "first", rows[0], "last", rows.at(-1));
for (const r of rows.filter((_, i) => i % 15 === 0)) console.log(r.as_of, (r.close_cents / 100).toFixed(2));
