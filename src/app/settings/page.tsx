import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { LinkAccountButton } from "@/components/LinkAccountButton";
import { money } from "@/lib/format";
import { PageFoot, PageHead } from "@/components/sections/PageHead";
import { AddManualAccount, BriefPreview, DetectedPaychecks, IncomeSettings, SignOut, SyncNow } from "@/components/sections/SettingsPanels";
import { getSession } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Account } from "@/lib/types";
import { AccountsEditor } from "@/components/sections/AccountsEditor";
import s from "@/components/sections/sections.module.css";

export default async function SettingsPage() {
  const d = await getDashboard();
  const session = await getSession();
  let hidden: Account[] = [];
  if (session) {
    const { data } = await session.supabase
      .from("accounts")
      .select("id,institution,name,kind,last4,credit_limit_cents,loan_apr,loan_payment_cents,loan_payments_left,balances_daily(balance_cents,as_of)")
      .eq("user_id", session.userId)
      .eq("is_active", false);
    hidden = (data ?? []).map((a) => {
      const bals = (a.balances_daily as { balance_cents: number; as_of: string }[] | null) ?? [];
      const latest = bals.sort((x, y) => y.as_of.localeCompare(x.as_of))[0];
      return {
        id: a.id, institution: a.institution, name: a.name, kind: a.kind, last4: a.last4,
        balanceCents: latest?.balance_cents ?? 0, creditLimitCents: a.credit_limit_cents, loanApr: a.loan_apr,
        loanPaymentCents: a.loan_payment_cents, loanPaymentsLeft: a.loan_payments_left, changeMtdCents: null,
      };
    });
  }
  const settings = d.settings ?? DEFAULT_SETTINGS;
  const assets = d.accounts.filter((a) => a.balanceCents >= 0).reduce((sum, a) => sum + a.balanceCents, 0);
  const debts = d.accounts.filter((a) => a.balanceCents < 0).reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <main className="wrap">
        <PageHead
          title="Settings"
          lede={`${d.accounts.length} accounts · Chase and Fidelity through Stripe Financial Connections · everything else is detected automatically`}
          figs={[
            { value: money(assets), label: "assets" },
            { value: money(Math.abs(debts)), label: "debts" },
          ]}
        />

        <section className={`${s.section} ${s.two}`}>
          <div>
            <h2 className={s.h2}>Accounts</h2>
            <p className={s.sub}>balances as of {d.asOf} · edit to rename, set a credit limit, or fill in what Stripe can&apos;t read</p>
            <AccountsEditor accounts={d.accounts} asOf={d.asOf} hidden={hidden} />
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
            <h2 className={s.h2}>Income &amp; commitments</h2>
            <p className={s.sub}>what to expect each pay day, and what is spoken for before anything else</p>
            <IncomeSettings initial={settings} />
            <h2 className={s.h2} style={{ marginTop: 36 }}>Paychecks</h2>
            <p className={s.sub}>detected from payroll deposits in checking · drives income and savings rate</p>
            <DetectedPaychecks />
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
