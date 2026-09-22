import Image from "next/image";
import s from "./BrandLogo.module.css";

type Kind = "chase" | "chase-mark" | "chase-card" | "fidelity" | "spdr";

const SRC: Record<Kind, { src: string; alt: string; w: number; h: number }> = {
  chase: { src: "/logos/chase.png", alt: "Chase", w: 640, h: 427 },
  "chase-mark": { src: "/logos/chase-mark.png", alt: "Chase", w: 256, h: 256 },
  "chase-card": { src: "/logos/chase-freedom-card.png", alt: "Chase Freedom Unlimited card", w: 550, h: 344 },
  fidelity: { src: "/logos/fidelity.png", alt: "Fidelity", w: 512, h: 512 },
  spdr: { src: "/logos/spdr.png", alt: "SPDR", w: 320, h: 320 },
};

// `size` is the rendered height in px; width follows the image's own ratio.
// The Chase wordmark is dark ink, so it sits on a light pill to read on the dark ground.
export function BrandLogo({ kind, size = 24, className }: { kind: Kind; size?: number; className?: string }) {
  const m = SRC[kind];
  if (kind === "chase") {
    return (
      <span className={`${s.pill} ${className ?? ""}`} style={{ height: size + 8 }}>
        <Image src={m.src} alt={m.alt} width={m.w} height={m.h} unoptimized style={{ height: size, width: "auto" }} />
      </span>
    );
  }
  if (kind === "chase-card") {
    const w = size;
    const h = Math.round((size * m.h) / m.w);
    return <Image src={m.src} alt={m.alt} width={w} height={h} unoptimized className={`${s.card} ${className ?? ""}`} />;
  }
  return <Image src={m.src} alt={m.alt} width={size} height={size} unoptimized className={`${s.round} ${className ?? ""}`} />;
}
