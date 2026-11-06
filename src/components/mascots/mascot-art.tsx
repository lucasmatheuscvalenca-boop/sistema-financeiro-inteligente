import type { MascotState } from "@/mascots/catalog";
import type { BanqueiroExpressao } from "@/mascots/banqueiro-assets";
import { cn } from "@/lib/cn";
import { BanqueiroMascot } from "./banqueiro-mascot";

/** Estado de contexto do app → arquivo de expressão do kit aprovado. */
export const EXPRESSAO_DO_ESTADO: Record<MascotState, BanqueiroExpressao> = {
  neutral: "neutro",
  analysis: "analise",
  guidance: "orientacao",
  celebration: "comemoracao",
  attention: "atencao",
  alert: "alerta",
};

/**
 * O Banqueiro numa caixa quadrada, na expressão do contexto (análise ao calcular, orientação em
 * dicas, comemoração em conquistas, atenção e alerta em riscos). Usa só os arquivos aprovados,
 * via `BanqueiroMascot`. O `id` é aceito por compatibilidade com registros antigos.
 */
export function MascotArt({ state = "neutral", size = 96, className, decorative = false, priority = false, animate = false }: { id?: string | null; state?: MascotState; size?: number; className?: string; decorative?: boolean; priority?: boolean; animate?: boolean }) {
  return (
    <BanqueiroMascot
      expressao={EXPRESSAO_DO_ESTADO[state]}
      estado={state}
      largura={size}
      altura={size}
      decorativo={decorative}
      prioridade={priority}
      className={cn(animate && (state === "celebration" ? "animate-pop" : "animate-float"), className)}
    />
  );
}
