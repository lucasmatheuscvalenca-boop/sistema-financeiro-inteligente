import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Marca Meu Banqueiro: um laço dourado em espiral, como uma fita de seda que se fecha em
 * anel, sobre creme ou verde profundo. Só dourado, para a marca não disputar com o verde.
 */
export function LogoMark({ className }: { className?: string }) {
  // IDs únicos: a marca aparece mais de uma vez (barra lateral e topo do celular).
  const uid = useId().replace(/:/g, "");
  const g = `mb-g-${uid}`;
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1D78F" />
          <stop offset="0.55" stopColor="#D4AF57" />
          <stop offset="1" stopColor="#B8923B" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${g})`} strokeLinecap="round">
        {/* Anel aberto: a fita principal. */}
        <path d="M30.5 13.5 A12.5 12.5 0 1 0 32.5 22" strokeWidth="4.6" />
        {/* A ponta da fita entra no anel e se enrola no centro. */}
        <path d="M32.5 22 C30 28 22 29 18 25 C14.5 21.5 17 15.5 22 15.5 C26 15.5 27.5 20 24.5 22" strokeWidth="3.4" />
      </g>
    </svg>
  );
}

export function Logo({ inverted = false, compact = false, tagline = false, stacked = false }: { inverted?: boolean; compact?: boolean; tagline?: boolean; stacked?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          {stacked ? (
            <span className={cn("font-display text-[17px] font-semibold leading-[1.05] tracking-[-0.01em]", inverted ? "text-white" : "text-ink")}>
              Meu
              <br />
              Banqueiro
            </span>
          ) : (
            <span className={cn("whitespace-nowrap font-display text-[19px] font-semibold tracking-[-0.01em]", inverted ? "text-white" : "text-ink")}>Meu Banqueiro</span>
          )}
          {tagline ? <span className={cn("mt-1 text-xs", inverted ? "text-white/70" : "text-muted")}>Seu dinheiro em boas mãos</span> : null}
        </span>
      ) : null}
    </span>
  );
}
