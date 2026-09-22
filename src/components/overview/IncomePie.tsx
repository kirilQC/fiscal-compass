import type { Dashboard } from "@/lib/types";
import { Pie } from "@/components/charts";
import { money } from "@/lib/format";

export function monthlyIncomeCents(d: Dashboard): number | null {
  if (d.plan?.incomeCents) return d.plan.incomeCents;
  const st = d.settings;
  if (st?.paycheckNetCents && st.payDays.length) return st.paycheckNetCents * st.payDays.length;
  return null;
}

export function IncomePie({ d, size = 420 }: { d: Dashboard; size?: number }) {
  const b = d.budget;
  const income = monthlyIncomeCents(d);
  if (!b || !income) return null;
  const spent = b.spentCents;
  const left = Math.max(0, income - spent);
  const monthName = new Date(`${b.month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return (
    <Pie
      slices={[
        { label: "Spent", value: spent },
        { label: "Left", value: left },
      ]}
      colors={["#e46d84", "#f7cdd6"]}
      sortSlices={false}
      title={`${monthName}: ${money(spent)} spent of ${money(income)}`}
      ariaLabel={`Income spent versus remaining, ${monthName}`}
      formatValue={money}
      labelMinPct={5}
      size={size}
    />
  );
}
