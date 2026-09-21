import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";

export default async function OverviewPage() {
  const d = await getDashboard();
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} />
      <main className="wrap" style={{ paddingBlock: 48 }}>
        <p className="eyebrow">Net worth</p>
        <h1 className="serif num" style={{ fontSize: 120, fontWeight: 300, margin: 0 }}>
          ${(d.netWorthCents / 100).toLocaleString()}
        </h1>
      </main>
    </>
  );
}
