import { useId } from "react";
import { cn } from "@/lib/cn";

/** Marca Meu Banqueiro: “B” com a haste em turquesa e as barrigas em verde-petróleo. */
export function LogoMark({ className }: { className?: string }) {
  // IDs únicos: a marca aparece mais de uma vez (barra lateral e topo do celular).
  const uid = useId().replace(/:/g, "");
  const a = `mb-a-${uid}`;
  const b = `mb-b-${uid}`;
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
      <rect x="5" y="4" width="10" height="32" rx="5" fill={`url(#${a})`} />
      <path fillRule="evenodd" d="M13 4H24A7.5 7.5 0 0 1 24 19H26A8.5 8.5 0 0 1 26 36H13ZM15 9h8a2.5 2.5 0 0 1 0 5h-8ZM15 24h10a3.5 3.5 0 0 1 0 7H15Z" fill={`url(#${b})`} />
    </svg>
  );
}

export function Logo({ inverted = false, compact = false, tagline = false }: { inverted?: boolean; compact?: boolean; tagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className={cn("whitespace-nowrap text-lg font-bold tracking-[0.01em]", inverted ? "text-white" : "text-ink")}>Meu Banqueiro</span>
          {tagline ? <span className={cn("mt-1 text-xs", inverted ? "text-white/70" : "text-muted")}>Seu dinheiro em boas mãos</span> : null}
        </span>
      ) : null}
    </span>
  );
}
