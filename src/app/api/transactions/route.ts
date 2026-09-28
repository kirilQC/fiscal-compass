import { withUser } from "@/lib/api";
import { getPlanRows } from "@/lib/plan";
import { essentialPatterns, spendClass } from "@/lib/spend";

export async function GET(request: Request) {
  return withUser(async ({ supabase, userId }) => {
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const limit = Math.min(2000, Number(url.searchParams.get("limit") ?? 500) || 500);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const [{ data, error }, planRows] = await Promise.all([
      supabase
        .from("transactions")
        .select("id,posted_on,merchant,amount_cents,category,is_transfer,is_income,status,anomaly_note,spend_class,accounts!inner(name,kind)")
        .eq("user_id", userId)
        .gte("posted_on", start)
        .lte("posted_on", end)
        .order("posted_on", { ascending: false })
        .limit(limit),
      getPlanRows(supabase, userId),
    ]);
    const patterns = essentialPatterns(planRows);
    if (error) throw new Error(error.message);
    type Row = {
      id: string; posted_on: string; merchant: string; amount_cents: number; category: string; is_transfer: boolean;
      is_income: boolean; status: string; anomaly_note: string | null; spend_class: string | null; accounts: { name: string; kind: string } | { name: string; kind: string }[];
    };
    return (data as unknown as Row[]).map((t) => {
      const acct = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts;
      return {
        id: t.id,
        postedOn: t.posted_on,
        merchant: t.merchant,
        amountCents: t.amount_cents,
        category: t.category,
        accountName: acct?.name ?? "",
        accountKind: acct?.kind ?? "",
        isTransfer: t.is_transfer,
        isIncome: t.is_income,
        status: t.status,
        anomalyNote: t.anomaly_note,
        spendClass: spendClass(t, patterns),
        spendClassManual: t.spend_class !== null,
      };
    });
  });
}
