import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { Hero, NetWorthSpread, InvestmentsSpread, CreditSpread, SpendingSpread, AdvisorSpread, GoalsSpread, Ledger, Foot } from "@/components/overview";

export default async function OverviewPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} />
      <main className="wrap">
        <Hero d={d} />
        <NetWorthSpread d={d} />
        <InvestmentsSpread d={d} />
        <CreditSpread d={d} />
        <SpendingSpread d={d} />
        <AdvisorSpread d={d} />
        <GoalsSpread d={d} />
        <Ledger d={d} />
        <Foot d={d} />
      </main>
    </>
  );
}
