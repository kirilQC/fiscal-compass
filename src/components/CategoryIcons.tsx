import type { ReactNode, SVGProps } from "react";

// One line icon per spending category, drawn on the same 16px grid and stroke as NavIcons.
// Shown in place of a merchant's logo when the company has none.

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

const dot = (cx: number, cy: number, r = 0.9) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const PATHS: Record<string, ReactNode> = {
  Groceries: (
    <>
      <path d="M1.75 5.75h12.5l-1.4 7a1 1 0 0 1-1 .75H4.15a1 1 0 0 1-1-.75z" />
      <path d="M5.25 5.75 7 2.25M10.75 5.75 9 2.25M6 8.5v2.75M10 8.5v2.75" />
    </>
  ),
  Dining: (
    <>
      <path d="M4.25 1.75v4.5a1.5 1.5 0 0 0 3 0v-4.5M5.75 1.75v12.5" />
      <path d="M11.75 14.25V1.75c-1.5.5-2.5 2.25-2.5 4.5v3h2.5" />
    </>
  ),
  Transport: (
    <>
      <path d="M2.25 10.75V8.4l1.5-3.9a1 1 0 0 1 .95-.65h6.6a1 1 0 0 1 .95.65l1.5 3.9v2.35a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75z" />
      <path d="M2.25 8.25h11.5M4 11.5v1.75M12 11.5v1.75" />
      {dot(5, 9.9, 0.7)}
      {dot(11, 9.9, 0.7)}
    </>
  ),
  Shopping: (
    <>
      <path d="M3 5.25h10l-.7 8.1a1 1 0 0 1-1 .9H4.7a1 1 0 0 1-1-.9z" />
      <path d="M5.75 7V4.25a2.25 2.25 0 0 1 4.5 0V7" />
    </>
  ),
  Subscriptions: (
    <>
      <path d="M13.25 6.25A5.25 5.25 0 0 0 3.6 4.4M2.75 9.75a5.25 5.25 0 0 0 9.65 1.85" />
      <path d="M3.25 1.9v2.85H6.1M12.75 14.1v-2.85H9.9" />
    </>
  ),
  Utilities: <path d="M8.9 1.75 3.25 9h4.25l-.4 5.25L12.75 7H8.5z" />,
  Housing: (
    <>
      <path d="M1.75 7.25 8 2l6.25 5.25" />
      <path d="M3.5 6v7.5a.75.75 0 0 0 .75.75h7.5a.75.75 0 0 0 .75-.75V6M6.5 14.25v-4h3v4" />
    </>
  ),
  Insurance: (
    <>
      <path d="M8 1.75 2.75 3.75v4c0 3.1 2.2 5.4 5.25 6.5 3.05-1.1 5.25-3.4 5.25-6.5v-4z" />
      <path d="m5.75 8 1.6 1.6 2.9-3.1" />
    </>
  ),
  Health: (
    <>
      <path d="M8 13.75S1.75 10.1 1.75 5.9A3.15 3.15 0 0 1 8 4.6a3.15 3.15 0 0 1 6.25 1.3c0 4.2-6.25 7.85-6.25 7.85z" />
      <path d="M4 7.75h1.9l1-1.75 1.5 3.25 1-1.5H12" />
    </>
  ),
  Fitness: (
    <>
      <path d="M5.25 8h5.5M3.5 4.75v6.5M12.5 4.75v6.5M1.75 6.25v3.5M14.25 6.25v3.5" />
    </>
  ),
  Entertainment: (
    <>
      <path d="M1.75 4.25h12.5v2.1a1.65 1.65 0 0 0 0 3.3v2.1H1.75V9.65a1.65 1.65 0 0 0 0-3.3z" />
      <path d="M10 4.25v7.5" strokeDasharray="1.2 1.4" />
    </>
  ),
  Giving: (
    <>
      <path d="M8 7.9S4.5 6 4.5 3.75a1.75 1.75 0 0 1 3.5-.6 1.75 1.75 0 0 1 3.5.6C11.5 6 8 7.9 8 7.9z" />
      <path d="M1.75 11.25 4.5 9.5h3.25a1.25 1.25 0 0 1 0 2.5H6.25M7.75 12h2.5l3.25-2.25a1.1 1.1 0 0 1 1.1 1.8L10.5 14.25H4.25l-2.5-1" />
    </>
  ),
  Travel: <path d="M14 2c-.6-.6-1.8-.3-2.6.5L9.2 4.7 3 3.2 1.9 4.3l5 2.9-2.5 2.5-2-.3-.9.9 2.3 1.2 1.2 2.3.9-.9-.3-2 2.5-2.5 2.9 5 1.1-1.1-1.5-6.2 2.2-2.2c.8-.8 1.1-2 .5-2.6z" />,
  "Personal Care": (
    <>
      <circle cx="4.25" cy="4.5" r="2" />
      <circle cx="4.25" cy="11.5" r="2" />
      <path d="M5.9 5.6 14 12.25M5.9 10.4 14 3.75" />
    </>
  ),
  Education: (
    <>
      <path d="M1.75 6 8 3l6.25 3L8 9z" />
      <path d="M4.25 7.25v3.5c0 1 1.7 2 3.75 2s3.75-1 3.75-2v-3.5M14.25 6v3.75" />
    </>
  ),
  "Loan Payment": (
    <>
      <path d="M1.75 5.75 8 2.25l6.25 3.5M2.75 13.75h10.5M3.75 13.75v-5.5M6.5 13.75v-5.5M9.5 13.75v-5.5M12.25 13.75v-5.5M2.75 5.75h10.5" />
    </>
  ),
  "Payments to People": (
    <>
      <circle cx="6" cy="5" r="2.4" />
      <path d="M1.75 13.75c.3-2.4 2-3.9 4.25-3.9s3.95 1.5 4.25 3.9M11 4.25h3.25M12.75 2.75l1.5 1.5-1.5 1.5" />
    </>
  ),
  Wedding: (
    <>
      <circle cx="5.75" cy="9.5" r="3.75" />
      <circle cx="10.25" cy="9.5" r="3.75" />
      <path d="m8.5 3.25 1.75-1.5 1.75 1.5-1.75 1.5z" />
    </>
  ),
  Cash: (
    <>
      <rect x="1.75" y="4.25" width="12.5" height="7.5" rx="1" />
      <circle cx="8" cy="8" r="1.9" />
      <path d="M4 6.5v3M12 6.5v3" />
    </>
  ),
  "Fees & Interest": (
    <>
      <path d="M12.5 3.5 3.5 12.5" />
      <circle cx="4.5" cy="4.5" r="1.9" />
      <circle cx="11.5" cy="11.5" r="1.9" />
    </>
  ),
  Income: (
    <>
      <path d="M8 1.75v7.5M5 6.25l3 3 3-3" />
      <path d="M1.75 9.75v3a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>
  ),
  Transfer: <path d="M2.25 5.25h10.5M10.25 2.75l2.5 2.5-2.5 2.5M13.75 10.75H3.25M5.75 8.25l-2.5 2.5 2.5 2.5" />,
  Reimbursed: (
    <>
      <path d="M2.75 5.75A5.5 5.5 0 1 1 2.5 9.5" />
      <path d="M2.5 2.5v3.25h3.25M8 5.5v5M9.6 6.6c-.3-.5-.9-.85-1.6-.85-.9 0-1.6.55-1.6 1.25 0 1.6 3.2.9 3.2 2.5 0 .7-.7 1.25-1.6 1.25-.75 0-1.35-.35-1.65-.9" />
    </>
  ),
  Other: (
    <>
      {dot(3.5, 8, 1.1)}
      {dot(8, 8, 1.1)}
      {dot(12.5, 8, 1.1)}
    </>
  ),
};

export const hasCategoryIcon = (category?: string | null) => !!category && category in PATHS;

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      {PATHS[category] ?? PATHS.Other}
    </svg>
  );
}
