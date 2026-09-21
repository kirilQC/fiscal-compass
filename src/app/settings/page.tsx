import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { LinkAccountButton } from "@/components/LinkAccountButton";
import { money } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { AddManualAccount, BriefPreview, Paychecks, SignOut, SyncNow } from "@/components/sections/SettingsPanels";
import { AccountsEditor } from "@/components/sections/AccountsEditor";
import s from "@/components/sections/sections.module.css";

export default async function SettingsPage() {
  const d = await getDashboard();
  const assets = d.accounts.filter((a) => a.balanceCents >= 0).reduce((sum, a) => sum + a.balanceCents, 0);
  const debts = d.accounts.filter((a) => a.balanceCents < 0).reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <PageHead
          title="Settings"
          lede={`${d.accounts.length} accounts · Chase and Fidelity through Stripe Financial Connections; loans and holdings entered here`}
          figs={[
            { value: money(assets), label: "assets" },
            { value: money(Math.abs(debts)), label: "debts" },
          ]}
        />

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Accounts</h2>
            <p className={s.sub}>balances as of {d.asOf} · edit to rename, set a credit limit, or fill in what Stripe can&apos;t read</p>
            <AccountsEditor accounts={d.accounts} asOf={d.asOf} />
            <div className={s.actions} style={{ marginTop: 28 }}>
              <LinkAccountButton label="Link a bank through Stripe" />
              <SyncNow />
            </div>
            <p className={s.hint} style={{ marginTop: 14 }}>Balances refresh every morning at 10:00 UTC and whenever Stripe reports new data. Card and checking transactions arrive with the same sync.</p>
          </div>
          <div>
            <h2 className={s.h2}>Add an account by hand</h2>
            <p className={s.sub}>for the car loan, or anything Stripe can&apos;t reach</p>
            <AddManualAccount />
          </div>
        </section>

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Paychecks</h2>
            <p className={s.sub}>gross, net, and what came out — this drives the savings rate</p>
            <Paychecks />
          </div>
          <div>
            <h2 className={s.h2}>Morning brief</h2>
            <p className={s.sub}>what the Grok bot reads each morning</p>
            <p className={s.hint} style={{ marginBottom: 14 }}>The bot calls this endpoint with the brief token from the environment and gets JSON with a ready-to-send <code>text</code> field plus the numbers behind it.</p>
            <pre className={s.code}>{`GET /api/brief
Authorization: Bearer <BRIEF_TOKEN>

→ { asOf, netWorth, changeMtd,
    budget: { total, spent, remaining, pctUsed, dayOfMonth, daysInMonth, projected, overCategories },
    upcoming, goalsOffTrack, anomalies, text }`}</pre>
            <div style={{ marginTop: 22 }}>
              <BriefPreview />
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.sectionTight}`}>
          <div className={s.actions}>
            <SignOut />
            <span className={s.hint}>Only {process.env.ALLOWED_EMAIL ?? "the owner's address"} can sign in.</span>
          </div>
        </section>

        <PageFoot isSample={d.isSample} />
      </main>
    </>
  );
}
