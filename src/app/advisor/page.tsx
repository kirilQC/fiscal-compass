import { getDashboard } from "@/lib/data";
import { suggestedPrompts } from "@/lib/advisor";
import { getStore } from "@/lib/threads";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { AdvisorChat } from "@/components/AdvisorChat";

export const dynamic = "force-dynamic";

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  const store = await getStore();
  const threads = await store.list();
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} />
      <AdvisorChat initialThreads={threads} prompts={suggestedPrompts(d)} brief={d.brief} initialQuery={q?.trim() || null} />
    </>
  );
}
