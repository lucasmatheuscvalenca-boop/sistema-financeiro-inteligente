import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Textura orgânica da marca em SVG: faixas largas e desfocadas, como dobras de seda ou fumaça,
 * com a luz entrando pelo canto inferior esquerdo e atravessando o verde na diagonal. Fica atrás
 * do conteúdo (position absolute, inset 0) e nunca compete com texto ou números. Para fundos
 * grandes e simples, a classe CSS `.silk` basta.
 */
export function Silk({ className, strength = 1 }: { className?: string; strength?: number }) {
  const id = useId().replace(/:/g, "");
  const o = (v: number) => Math.min(1, v * strength);
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id={`b-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id={`s-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {/* Luz: branca, mais forte no meio da dobra e sumindo nas bordas. */}
        <linearGradient id={`w-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={o(0.2)} />
          <stop offset="0.7" stopColor="#dff5e8" stopOpacity={o(0.12)} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`l-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#6fcf9f" stopOpacity="0" />
          <stop offset="0.5" stopColor="#6fcf9f" stopOpacity={o(0.22)} />
          <stop offset="1" stopColor="#6fcf9f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`k-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity={o(0.22)} />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`d-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#e8c77a" stopOpacity="0" />
          <stop offset="0.6" stopColor="#e8c77a" stopOpacity={o(0.1)} />
          <stop offset="1" stopColor="#e8c77a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Sombra no canto superior esquerdo dá profundidade ao verde. */}
      <rect x="0" y="0" width="800" height="400" fill={`url(#k-${id})`} />
      <g filter={`url(#b-${id})`}>
        {/* Dobra principal: sobe da esquerda para a direita, larga e suave. */}
        <path d="M-60 420 C 120 360, 200 250, 360 230 S 620 160, 880 40 L 880 140 C 640 240, 520 300, 380 320 S 120 400, -60 470 Z" fill={`url(#w-${id})`} />
        {/* Dobra secundária, mais estreita e um pouco acima, em verde-claro. */}
        <path d="M-40 300 C 140 260, 260 160, 420 150 S 680 90, 880 -20 L 880 40 C 700 120, 560 190, 420 200 S 160 300, -40 350 Z" fill={`url(#l-${id})`} />
        {/* Sopro dourado perto da base, bem contido. */}
        <path d="M200 420 C 340 380, 520 380, 760 330 L 880 310 L 880 420 Z" fill={`url(#d-${id})`} />
      </g>
      {/* Fio de luz mais nítido no topo da dobra principal, como o brilho de uma seda. */}
      <g filter={`url(#s-${id})`}>
        <path d="M-40 388 C 150 330, 230 236, 380 214 S 640 140, 880 24" fill="none" stroke="#ffffff" strokeOpacity={o(0.16)} strokeWidth="2" />
      </g>
    </svg>
  );
}
