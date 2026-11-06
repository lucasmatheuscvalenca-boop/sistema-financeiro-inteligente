import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Textura orgânica da marca em SVG: curvas suaves, desfocadas, com luz branca e um sopro
 * dourado atravessando o verde. Fica atrás do conteúdo (position absolute, inset 0), nunca
 * compete com texto ou números. Para fundos grandes e simples, a classe CSS `.silk` basta.
 */
export function Silk({ className, strength = 1 }: { className?: string; strength?: number }) {
  const id = useId().replace(/:/g, "");
  const o = (v: number) => Math.min(1, v * strength);
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id={`b-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={o(0.14)} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`d-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#e8c77a" stopOpacity={o(0.16)} />
          <stop offset="1" stopColor="#e8c77a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`l-${id}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fcf9f" stopOpacity={o(0.18)} />
          <stop offset="1" stopColor="#6fcf9f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g filter={`url(#b-${id})`}>
        <path d="M-40 300 C 120 180, 260 420, 420 260 S 700 120, 860 220 L 860 420 L -40 420 Z" fill={`url(#g-${id})`} />
        <path d="M-60 120 C 100 40, 240 200, 400 110 S 640 -40, 860 60 L 860 180 C 700 240, 520 140, 380 220 S 120 300, -60 230 Z" fill={`url(#l-${id})`} />
        <path d="M520 420 C 560 300, 700 280, 860 330 L 860 420 Z" fill={`url(#d-${id})`} />
        <ellipse cx="640" cy="40" rx="260" ry="90" fill="#ffffff" fillOpacity={o(0.06)} />
      </g>
    </svg>
  );
}
