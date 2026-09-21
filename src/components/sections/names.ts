const WORDS: Record<string, string> = {
  CKG: "Checking",
  CHK: "Checking",
  SVG: "Savings",
  SAV: "Savings",
  ACCT: "Account",
  CC: "Credit Card",
};

// Bank names often arrive in ALL CAPS ("PREMIER PLUS CKG"); leave anything already mixed-case alone.
export function prettyName(name: string): string {
  if (!name || name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((w) => WORDS[w] ?? w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
