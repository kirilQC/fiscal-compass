import { getDashboard } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { moneyExact } from "@/lib/format";
import { getSession } from "@/lib/session";
import { fetchLog, monthToDateCost } from "@/lib/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Account } from "@/lib/types";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AccountsPanel } from "@/components/settings/AccountsPanel";
import { LogPanel, type LogEntry } from "@/components/settings/LogPanel";
import { SterlingPanel, type Memory } from "@/components/settings/SterlingPanel";
import { PaychecksPanel, type Paycheck } from "@/components/settings/PaychecksPanel";

export default async function SettingsPage() {
  const d = await getDashboard();
  const session = await getSession();
  const settings = d.settings ?? DEFAULT_SETTINGS;
  let hidden: Account[] = [];
  let monthUsd: number | null = null;
  let log: LogEntry[] = [];
  let memories: Memory[] = [];
  let paychecks: Paycheck[] = [];

  if (session) {
    const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;
    const [hiddenQ, memQ, payQ, cost, entries] = await Promise.all([
      session.supabase.from("accounts")
        .select("id,institution,name,kind,last4,credit_limit_cents,loan_apr,loan_payment_cents,loan_payments_left,balances_daily(balance_cents,as_of)")
        .eq("user_id", session.userId).eq("is_active", false),
      session.supabase.from("advisor_notes").select("id,body,created_at").eq("user_id", session.userId).eq("kind", "memory").order("created_at", { ascending: true }),
      session.supabase.from("paychecks").select("id,pay_date,employer,net_cents").eq("user_id", session.userId).order("pay_date", { ascending: false }).limit(60),
      admin ? monthToDateCost(admin, session.userId).then((c) => c.monthUsd).catch(() => null) : Promise.resolve(null),
      admin ? fetchLog(admin, session.userId).catch(() => []) : Promise.resolve([]),
    ]);
    hidden = (hiddenQ.data ?? []).map((a) => {
      const bals = (a.balances_daily as { balance_cents: number; as_of: string }[] | null) ?? [];
      const latest = bals.sort((x, y) => y.as_of.localeCompare(x.as_of))[0];
      return {
        id: a.id, institution: a.institution, name: a.name, kind: a.kind, last4: a.last4,
        balanceCents: latest?.balance_cents ?? 0, creditLimitCents: a.credit_limit_cents, loanApr: a.loan_apr,
        loanPaymentCents: a.loan_payment_cents, loanPaymentsLeft: a.loan_payments_left, changeMtdCents: null,
      };
    });
    memories = memQ.data ?? [];
    paychecks = (payQ.data ?? []).map((p) => ({ id: p.id, payDate: p.pay_date, employer: p.employer, netCents: p.net_cents }));
    monthUsd = cost;
    log = entries;
  }

  const lastPay = paychecks[0]?.netCents ?? settings.paycheckNetCents;
  const tabs = [
    { id: "accounts", label: "Linked accounts", summary: `${d.accounts.length} linked`, panel: <AccountsPanel accounts={d.accounts} hidden={hidden} asOf={d.asOf} monthUsd={monthUsd} /> },
    { id: "log", label: "Stripe log", summary: monthUsd !== null ? `$${monthUsd.toFixed(2)}` : `${log.length}`, panel: <LogPanel entries={log} monthUsd={monthUsd} /> },
    { id: "sterling", label: "Sterling", summary: `${memories.length} facts`, panel: <SterlingPanel notes={settings.notes} memories={memories} /> },
    { id: "paychecks", label: "Paychecks", summary: lastPay ? moneyExact(lastPay) : "none yet", panel: <PaychecksPanel income={settings} paychecks={paychecks} /> },
  ];

  return (
    <>
      <TopBar asOf={d.asOf} isSample={d.isSample} loadError={d.loadError} />
      <SettingsShell tabs={tabs} />
    </>
  );
}
