import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Onboarding } from "@/components/Onboarding";
import { CreditPage } from "@/components/credit/CreditPage";

export default async function Credit() {
  const d = await getDashboard();
  if (d.needsSetup) return <><TopBar asOf={d.asOf} isSample={false} /><Onboarding /></>;
  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <CreditPage credit={d.credit} accounts={d.accounts.filter((a) => a.kind === "credit")} month={d.asOf.slice(0, 7)} />
    </>
  );
}
