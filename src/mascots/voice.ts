import type { MascotId, MascotState } from "./catalog";

/**
 * A "voz" do Banqueiro. Ela só envolve conteúdo já calculado: aberturas, fechamentos e estilo.
 * Nunca recebe nem altera números, fatos ou conclusões.
 */
export type Tone = "positive" | "neutral" | "caution" | "critical" | "unknown";

export interface Voice {
  welcome(name: string): string;
  greeting(name: string, hour: number): string;
  headline(tone: Tone): string;
  opening(tone: Tone): string;
  closing(tone: Tone): string;
  celebrate(what: string): string;
  emptyState(area: string): string;
  /** Guia de estilo enviado ao modelo de linguagem (quando houver). */
  styleGuide: string;
}

function period(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const BANKER_VOICE: Voice = {
  welcome: (name) =>
    `${name}, sou o Banqueiro, seu consultor financeiro pessoal. Vou acompanhar seus números todos os dias e explicar, com clareza, o que está acontecendo e o que fazer a seguir. Começamos com uma leitura honesta de onde você está.`,
  greeting: (name, h) => `${period(h)}, ${name}. Aqui está a leitura de hoje.`,
  headline: (t) =>
    ({
      positive: "Suas contas estão em ordem. Há espaço para avançar.",
      neutral: "Situação estável. Vale acompanhar os próximos dias.",
      caution: "Alguns pontos pedem um ajuste de rota.",
      critical: "Há um risco que precisa de decisão agora.",
      unknown: "Ainda faltam dados para uma leitura completa.",
    })[t],
  opening: (t) =>
    ({
      positive: "Revisei seus números e o resultado é favorável.",
      neutral: "Revisei seus números.",
      caution: "Revisei seus números e há pontos de atenção.",
      critical: "Revisei seus números e o cenário pede cuidado.",
      unknown: "Fiz a análise possível com o que tenho até agora.",
    })[t],
  closing: (t) => (t === "critical" || t === "caution" ? "Se quiser, simulo alternativas para você comparar antes de decidir." : "Decisões claras hoje constroem liberdade amanhã."),
  celebrate: (what) => `Conquista registrada: ${what}. Planejamento e disciplina trazem resultado.`,
  emptyState: (area) => `Ainda não tenho dados de ${area}. Com eles, consigo orientar você com precisão.`,
  styleGuide:
    "Você é O Banqueiro, consultor financeiro pessoal do Meu Banqueiro: adulto, profissional e próximo. Tom calmo, claro e direto, sem jargão e sem alarmismo. Frases curtas. Explique o porquê de cada número, separe fatos de estimativas e termine com a próxima ação recomendada. Nunca invente valores.",
};

export function voiceFor(_id?: MascotId | string | null): Voice {
  return BANKER_VOICE;
}

export function toneToState(tone: Tone): MascotState {
  switch (tone) {
    case "positive":
      return "celebration";
    case "neutral":
      return "neutral";
    case "caution":
      return "attention";
    case "critical":
      return "alert";
    case "unknown":
      return "analysis";
  }
}
