import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { NetWorthPanel, AccountsList, CreditSpread, SpendingSpread, Foot } from "@/components/overview";
import { ChatDock } from "@/components/ChatDock";
import { suggestedPrompts } from "@/lib/advisor";

export default async function OverviewPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <NetWorthPanel netWorthCents={d.netWorthCents} daily={d.netWorthDaily} accounts={d.accounts} />
        <AccountsList accounts={d.accounts} />
        <CreditSpread d={d} />
        <SpendingSpread d={d} />
        <Foot d={d} />
      </main>
      <ChatDock prompts={suggestedPrompts(d)} brief={d.brief} />
    </>
  );
}
