import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { NetWorthPanel, AccountsList, CreditSpread, SpendingSpread, Foot } from "@/components/overview";
import { ChatDock } from "@/components/ChatDock";
import { suggestedPrompts } from "@/lib/advisor";
import { getSession } from "@/lib/session";
import { loadLedger } from "@/lib/advisor/ledger";
import { computeInsights, type Insight } from "@/lib/advisor/insights";
import { Flags } from "@/components/overview/Flags";

export default async function OverviewPage() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const session = d.isSample ? null : await getSession();
  const insights: Insight[] = session ? await loadLedger(session.supabase, session.userId).then(computeInsights).catch(() => []) : [];
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <NetWorthPanel netWorthCents={d.netWorthCents} daily={d.netWorthDaily} accounts={d.accounts} />
        <Flags insights={insights} />
        <AccountsList accounts={d.accounts} />
        <CreditSpread d={d} />
        <SpendingSpread d={d} />
        <Foot d={d} />
      </main>
      <ChatDock prompts={insights.length ? insights.filter((i) => i.level !== "good").slice(0, 3).map((i) => i.ask) : suggestedPrompts(d)} brief={d.brief} />
    </>
  );
}
