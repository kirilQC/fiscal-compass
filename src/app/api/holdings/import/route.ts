import { z } from "zod";
import { parseBody, withUser } from "@/lib/api";
import { today } from "@/lib/sync";
import { refreshInvestmentBalance } from "@/lib/holdings";

const Body = z.object({ accountId: z.string().uuid(), csv: z.string().min(1) });

const ASSET_CLASS: Record<string, string> = {
  FXAIX: "us_equity", VTI: "us_equity", VOO: "us_equity", FSKAX: "us_equity", FZROX: "us_equity", QQQ: "us_equity",
  VXUS: "intl_equity", FTIHX: "intl_equity", FZILX: "intl_equity", VEA: "intl_equity", VWO: "intl_equity",
  BND: "bond", FXNAX: "bond", AGG: "bond", VBTLX: "bond",
  SPAXX: "cash", FDRXX: "cash", FZFXX: "cash", "CORE**": "cash", FCASH: "cash",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const num = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
};

export async function POST(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const { accountId, csv } = await parseBody(request, Body);
    const rows = parseCsv(csv);
    const headerIdx = rows.findIndex((r) => r.some((c) => /^symbol$/i.test(c.trim())));
    if (headerIdx < 0) throw new Error("Could not find a Symbol column in the CSV");
    const header = rows[headerIdx].map((h) => h.trim().toLowerCase());
    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const iSym = col(/^symbol$/), iDesc = col(/description/), iQty = col(/quantity/), iPrice = col(/last price$|^price$/), iVal = col(/current value|market value/);
    if (iVal < 0) throw new Error("Could not find a Current Value column");

    let imported = 0;
    for (const r of rows.slice(headerIdx + 1)) {
      const symbol = (r[iSym] ?? "").trim().toUpperCase().replace(/\*+$/, "**");
      const value = num(r[iVal]);
      if (!symbol || value === null || /^(account total|pending activity)/i.test(symbol)) continue;
      const { data, error } = await supabase
        .from("holdings")
        .upsert(
          { user_id: userId, account_id: accountId, symbol, name: iDesc >= 0 ? r[iDesc]?.trim() || null : null, asset_class: ASSET_CLASS[symbol] ?? (symbol.includes("**") ? "cash" : null) },
          { onConflict: "account_id,symbol" },
        )
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const price = iPrice >= 0 ? num(r[iPrice]) : null;
      await supabase.from("holdings_daily").upsert(
        {
          holding_id: data.id,
          user_id: userId,
          as_of: today(),
          quantity: iQty >= 0 ? num(r[iQty]) : null,
          price_cents: price === null ? null : Math.round(price * 100),
          value_cents: Math.round(value * 100),
        },
        { onConflict: "holding_id,as_of" },
      );
      imported++;
    }
    await refreshInvestmentBalance(supabase, userId, accountId);
    return { imported };
  });
}
