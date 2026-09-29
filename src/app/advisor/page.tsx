import { getDashboard } from "@/lib/data";
import { suggestedPrompts } from "@/lib/advisor";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/threads";
import { loadLedger } from "@/lib/advisor/ledger";
import { computeInsights, type Insight } from "@/lib/advisor/insights";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { AdvisorChat } from "@/components/AdvisorChat";

export const dynamic = "force-dynamic";

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ q?: string; t?: string }> }) {
  const { q, t } = await searchParams;
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const session = await getSession();
  const [threads, ledger] = await Promise.all([
    getStore().then((s) => s.list()),
    session && !d.isSample ? loadLedger(session.supabase, session.userId).catch(() => null) : Promise.resolve(null),
  ]);
  const insights: Insight[] = ledger ? computeInsights(ledger) : [];
  const memories = (ledger?.memories ?? []).map((m) => ({ id: m.id, body: m.body, created_at: m.createdAt }));
  // The questions worth asking are the ones the analysis raised.
  const prompts = insights.length ? insights.filter((i) => i.level !== "good").slice(0, 3).map((i) => i.ask) : suggestedPrompts(d);
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <AdvisorChat initialThreads={threads} prompts={prompts} brief={d.brief} initialQuery={q?.trim() || null} memories={memories} initialThreadId={t && threads.some((x) => x.id === t) ? t : null} />
    </>
  );
}
