import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export function OverviewIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M10.6 5.4 9.2 9.2 5.4 10.6l1.4-3.8z" />
      <path d="M8 1.75v1.2M8 13.05v1.2M1.75 8h1.2M13.05 8h1.2" />
    </svg>
  );
}

export function InvestmentsIcon() {
  return (
    <svg {...base}>
      <path d="M1.75 12.25 5.5 8.5l2.5 2 5-6" />
      <circle cx="13" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M1.75 14.25h12.5" />
    </svg>
  );
}

export function CreditIcon() {
  return (
    <svg {...base}>
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.25" />
      <path d="M1.75 6.75h12.5M4.25 10h2.5" />
    </svg>
  );
}

export function SpendingIcon() {
  return (
    <svg {...base}>
      <path d="M4 1.75h8v12.5l-1.6-1-1.6 1-1.6-1-1.6 1-1.6-1-1.6 1z" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </svg>
  );
}

export function GoalsIcon() {
  return (
    <svg {...base}>
      <path d="M3.75 14.25V2.25" />
      <path d="M3.75 2.75h8.5l-1.75 3 1.75 3h-8.5" />
    </svg>
  );
}

export function AdvisorIcon() {
  return (
    <svg {...base}>
      <path d="M2.25 3.75A1.5 1.5 0 0 1 3.75 2.25h8.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2.75V11.25h.25a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M5.25 5.75h5.5M5.25 8h3.5" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <path d="M1.75 4.25h12.5M1.75 8h12.5M1.75 11.75h12.5" />
      <circle cx="5.5" cy="4.25" r="1.4" fill="var(--bg)" />
      <circle cx="10.5" cy="8" r="1.4" fill="var(--bg)" />
      <circle cx="6.5" cy="11.75" r="1.4" fill="var(--bg)" />
    </svg>
  );
}
