"use client";

import { useState } from "react";
import s from "./MerchantLogo.module.css";

// A merchant's company logo, or its initials when there is none (or the image fails to load).
export function MerchantLogo({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .replace(/^(zelle payment (to|from)|cash app\*?)\s*/i, "")
      .split(/[\s*&.-]+/)
      .filter((w) => /^[a-z]/i.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "•";
  if (!src || failed) {
    return (
      <span className={s.mono} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
        {initials}
      </span>
    );
  }
  return (
    <span className={s.frame} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- stored logos are small public files; no optimizer needed */}
      <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

/** Logo beside the merchant name, with any extra labels (account, pending, tags) after the name. */
export function MerchantCell({ src, name, size = 28, children }: { src?: string | null; name: string; size?: number; children?: React.ReactNode }) {
  return (
    <span className={s.cell}>
      <MerchantLogo src={src} name={name} size={size} />
      <span className={s.cellText}>
        {name}
        {children}
      </span>
    </span>
  );
}
