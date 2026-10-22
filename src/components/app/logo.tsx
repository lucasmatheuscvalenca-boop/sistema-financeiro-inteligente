import { useId } from "react";
import { cn } from "@/lib/cn";

/** Marca NEXO: “N” em turquesa com diagonal em verde-petróleo. */
export function LogoMark({ className }: { className?: string }) {
  // IDs únicos: a marca aparece mais de uma vez (barra lateral e topo do celular).
  const uid = useId().replace(/:/g, "");
  const a = `nexo-a-${uid}`;
  const b = `nexo-b-${uid}`;
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={a} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3FD3D3" />
          <stop offset="1" stopColor="#0EA5A5" />
        </linearGradient>
        <linearGradient id={b} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B8E92" />
          <stop offset="1" stopColor="#0B5F6E" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="10" height="32" rx="5" fill={`url(#${a})`} />
      <rect x="26" y="4" width="10" height="32" rx="5" fill={`url(#${a})`} />
      <path d="M8.6 6.6a5 5 0 0 1 7.6-1.1l17.6 23.9a5 5 0 0 1-8 6L8.2 11.5a5 5 0 0 1 .4-4.9Z" fill={`url(#${b})`} />
    </svg>
  );
}

export function Logo({ inverted = false, compact = false, tagline = false }: { inverted?: boolean; compact?: boolean; tagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className={cn("text-xl font-bold tracking-[0.02em]", inverted ? "text-white" : "text-ink")}>NEXO</span>
          {tagline ? <span className={cn("mt-1 text-xs", inverted ? "text-white/70" : "text-muted")}>Seu futuro em boas decisões</span> : null}
        </span>
      ) : null}
    </span>
  );
}
