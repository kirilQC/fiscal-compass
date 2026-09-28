"use client";

import { useState } from "react";
import { Pie } from "@/components/charts";
import { money } from "@/lib/format";

// Essential vs discretionary share of the month's spending; untagged charges get their own slice until tagged.
const COLORS = ["#f7cdd6", "#e46d84", "#6b676c"];

export function SpendSplitPie({ essentialCents, discretionaryCents, untaggedCents, size = 300 }: { essentialCents: number; discretionaryCents: number; untaggedCents: number; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = essentialCents + discretionaryCents + untaggedCents;
  if (!total) return null;
  const slices = [
    { label: "Essential", value: essentialCents },
    { label: "Discretionary", value: discretionaryCents },
    ...(untaggedCents ? [{ label: "Untagged", value: untaggedCents }] : []),
  ];
  const discPct = Math.round((discretionaryCents / total) * 100);
  return (
    <Pie
      slices={slices}
      colors={COLORS}
      sortSlices={false}
      title=""
      ariaLabel="Essential versus discretionary spending"
      formatValue={money}
      size={size}
      innerRadiusPct={46}
      centerLines={[`${discPct}%`, "discretionary"]}
      hoveredIndex={hover}
      onSliceHover={(i) => setHover(i)}
    />
  );
}
