import { BANKER, MASCOT_STATE_LABEL, type MascotState } from "@/mascots/catalog";
import { cn } from "@/lib/cn";
import { BankerArt } from "./banker-art";

/**
 * O Banqueiro com seis expressões. A expressão acompanha o contexto (análise, orientação,
 * comemoração, atenção, alerta); a personalidade nunca muda os cálculos. O `id` é aceito só
 * por compatibilidade com registros antigos: o consultor é sempre o mesmo.
 */
export function MascotArt({ state = "neutral", size = 96, className, decorative = false, animate = false }: { id?: string | null; state?: MascotState; size?: number; className?: string; decorative?: boolean; priority?: boolean; animate?: boolean }) {
  const label = `${BANKER.name}, ${BANKER.title} — ${MASCOT_STATE_LABEL[state]}`;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-end justify-center", animate && (state === "celebration" ? "animate-pop" : "animate-float"), className)}
      style={{ width: size, height: size }}
      data-mascot="banqueiro"
      data-state={state}
    >
      <BankerArt state={state} size={size} label={label} decorative={decorative} className="h-full w-full" />
    </span>
  );
}
