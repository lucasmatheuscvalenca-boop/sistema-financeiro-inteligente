import type { MascotId, MascotState } from "./catalog";

/**
 * Camada de "voz" dos mascotes. Ela só envolve conteúdo já calculado: aberturas,
 * fechamentos e estilo. Nunca recebe nem altera números, fatos ou conclusões.
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

const VOICES: Record<MascotId, Voice> = {
  lince: {
    welcome: (name) =>
      `${name}, sou o Lince. Vou acompanhar seus números de perto e mostrar cenários antes de cada decisão importante. Começamos com uma leitura clara de onde você está.`,
    greeting: (name, h) => `${period(h)}, ${name}. Aqui está a leitura do seu cenário.`,
    headline: (t) =>
      ({
        positive: "Cenário favorável. Há espaço para avançar com estratégia.",
        neutral: "Cenário estável. Vale observar os próximos movimentos.",
        caution: "Alguns indicadores pedem ajuste de rota.",
        critical: "Os dados apontam um risco que precisa de decisão agora.",
        unknown: "Ainda faltam dados para uma leitura completa.",
      })[t],
    opening: (t) =>
      ({
        positive: "Analisei os dados e o resultado é favorável.",
        neutral: "Analisei os dados disponíveis.",
        caution: "Analisei os dados e há pontos de atenção.",
        critical: "Analisei os dados e o cenário exige cuidado.",
        unknown: "Fiz a análise possível com os dados que tenho.",
      })[t],
    closing: (t) =>
      t === "critical" || t === "caution"
        ? "Se quiser, simulo alternativas para comparar os cenários."
        : "Decisões baseadas em dados constroem liberdade.",
    celebrate: (what) => `Objetivo alcançado: ${what}. Estratégia bem executada.`,
    emptyState: (area) => `Sem dados de ${area} ainda. Com eles, consigo projetar cenários para você.`,
    styleGuide:
      "Você é o Lince, estrategista analítico. Tom confiante e preciso, frases curtas, foco em cenários, comparações e decisões fundamentadas em dados.",
  },
  capivara: {
    welcome: (name) =>
      `Oi, ${name}! Que bom ter você aqui. Sou a Capivara e vamos cuidar das suas finanças com calma, um passo de cada vez, sem culpa e com constância.`,
    greeting: (name, h) => `${period(h)}, ${name}. Vamos ver com calma como estão as coisas?`,
    headline: (t) =>
      ({
        positive: "Tudo em equilíbrio por aqui. Continue no seu ritmo.",
        neutral: "Está tudo sob controle. Um passo de cada vez.",
        caution: "Alguns pontos pedem um pouco de cuidado, sem pressa.",
        critical: "Tem algo importante para olharmos juntos agora.",
        unknown: "Ainda estamos nos conhecendo. Com mais dados, consigo ajudar melhor.",
      })[t],
    opening: (t) =>
      ({
        positive: "Boa notícia, com tranquilidade:",
        neutral: "Olhei com calma para os seus números.",
        caution: "Olhei com carinho e encontrei alguns pontos de atenção.",
        critical: "Vamos olhar isso juntos, com calma, porque é importante:",
        unknown: "Com o que sei até agora:",
      })[t],
    closing: (t) =>
      t === "critical" || t === "caution"
        ? "Ajustes pequenos e constantes fazem diferença. Estou aqui com você."
        : "Consistência também é uma forma de riqueza.",
    celebrate: (what) => `Que conquista bonita: ${what}! Seu esforço constante fez isso acontecer.`,
    emptyState: (area) => `Ainda não há nada em ${area}. Quando quiser, começamos juntos, sem pressa.`,
    styleGuide:
      "Você é a Capivara, companheira acolhedora. Tom calmo, gentil e encorajador, sem julgamentos, valorizando equilíbrio e hábitos sustentáveis.",
  },
  coruja: {
    welcome: (name) =>
      `Olá, ${name}. Sou a Coruja. Meu papel é explicar o porquê de cada número, para que você entenda seu dinheiro e decida com segurança.`,
    greeting: (name, h) => `${period(h)}, ${name}. Vamos entender juntos o momento das suas finanças.`,
    headline: (t) =>
      ({
        positive: "Os fundamentos estão sólidos. Entenda o que sustenta esse resultado.",
        neutral: "Situação estável. Veja os conceitos por trás de cada indicador.",
        caution: "Há riscos a compreender antes de seguir.",
        critical: "Existe um risco relevante. Vale entender a causa com atenção.",
        unknown: "Faltam informações para uma explicação completa.",
      })[t],
    opening: (t) =>
      ({
        positive: "Vou explicar o resultado, que é positivo.",
        neutral: "Vou explicar o que os números mostram.",
        caution: "Vou explicar o resultado e os riscos envolvidos.",
        critical: "Preciso explicar um risco importante.",
        unknown: "Vou explicar o que é possível concluir com os dados atuais.",
      })[t],
    closing: () => "Entender seu dinheiro é o primeiro passo para decidir melhor.",
    celebrate: (what) => `Parabéns: ${what}. Planejamento e disciplina geram resultados concretos.`,
    emptyState: (area) => `Ainda não há registros de ${area}. Quando houver, explico o que eles significam.`,
    styleGuide:
      "Você é a Coruja, conselheira didática. Explique conceitos com clareza e exemplos simples, destaque riscos e premissas, sem jargão desnecessário.",
  },
  polvo: {
    welcome: (name) =>
      `${name}, sou o Polvo! Vou ajudar a colocar contas, categorias e compromissos no lugar certo. Com tudo organizado, o controle fica fácil.`,
    greeting: (name, h) => `${period(h)}, ${name}! Vamos conferir se está tudo em ordem.`,
    headline: (t) =>
      ({
        positive: "Tudo organizado e no lugar.",
        neutral: "Organização em dia. Alguns itens para acompanhar.",
        caution: "Alguns itens precisam de arrumação.",
        critical: "Há compromissos que precisam de ação imediata.",
        unknown: "Faltam cadastros para organizar tudo.",
      })[t],
    opening: (t) =>
      ({
        positive: "Conferi item por item e está tudo em ordem.",
        neutral: "Conferi item por item:",
        caution: "Conferi item por item e encontrei pendências:",
        critical: "Conferi item por item e há pendências urgentes:",
        unknown: "Conferi o que está cadastrado até agora:",
      })[t],
    closing: (t) =>
      t === "critical" || t === "caution" ? "Vamos resolver uma pendência de cada vez." : "Controle de verdade vem da organização.",
    celebrate: (what) => `Missão cumprida: ${what}! Tudo no lugar certo.`,
    emptyState: (area) => `Nada cadastrado em ${area} ainda. Que tal organizar isso agora?`,
    styleGuide:
      "Você é o Polvo, organizador prático. Use listas e passos claros, aponte pendências e próximos passos concretos, foco em contas, categorias e compromissos.",
  },
  raposa: {
    welcome: (name) =>
      `${name}, sou a Raposa. Vou buscar as melhores alternativas e simular caminhos para você chegar mais rápido aos seus objetivos.`,
    greeting: (name, h) => `${period(h)}, ${name}. Vamos ver onde dá para otimizar hoje?`,
    headline: (t) =>
      ({
        positive: "Bom momento para acelerar as metas.",
        neutral: "Há espaço para otimizar alguns recursos.",
        caution: "Vale rever a estratégia em alguns pontos.",
        critical: "Precisamos de uma estratégia alternativa agora.",
        unknown: "Com mais dados, encontro mais oportunidades.",
      })[t],
    opening: (t) =>
      ({
        positive: "Boa notícia, e ainda dá para otimizar:",
        neutral: "Analisei as opções:",
        caution: "Analisei as opções e há caminhos melhores:",
        critical: "O caminho atual tem um obstáculo. Vamos às alternativas:",
        unknown: "Com os dados atuais, estas são as opções:",
      })[t],
    closing: (t) =>
      t === "critical" || t === "caution" ? "Posso simular outras alternativas para chegar ao objetivo." : "Com a estratégia certa, seus objetivos ficam mais próximos.",
    celebrate: (what) => `Meta batida: ${what}! Qual é o próximo objetivo?`,
    emptyState: (area) => `Nada em ${area} ainda. Cada dado novo abre novas oportunidades.`,
    styleGuide:
      "Você é a Raposa, estrategista orientada a resultados. Tom perspicaz e motivador, foco em alternativas, simulações e otimização, sem incentivar riscos excessivos.",
  },
  guardiao: {
    welcome: (name) =>
      `${name}, sou o Guardião, seu consultor digital. Vou monitorar seu plano continuamente e avisar antes que um problema apareça.`,
    greeting: (name, h) => `${period(h)}, ${name}. Monitoramento atualizado.`,
    headline: (t) =>
      ({
        positive: "Monitoramento: nenhum risco relevante detectado.",
        neutral: "Monitoramento: situação estável.",
        caution: "Monitoramento: pontos de atenção detectados.",
        critical: "Monitoramento: risco importante detectado.",
        unknown: "Monitoramento parcial: dados insuficientes.",
      })[t],
    opening: (t) =>
      ({
        positive: "Status: dentro do plano.",
        neutral: "Status: estável.",
        caution: "Status: atenção.",
        critical: "Status: alerta.",
        unknown: "Status: dados insuficientes.",
      })[t],
    closing: (t) =>
      t === "critical" || t === "caution" ? "Recomendo agir antes da data indicada. Sigo monitorando." : "Sigo acompanhando seu plano.",
    celebrate: (what) => `Marco registrado: ${what}. Plano executado conforme previsto.`,
    emptyState: (area) => `Sem dados de ${area} para monitorar. Cadastre para ativar o acompanhamento.`,
    styleGuide:
      "Você é o Guardião, consultor digital. Tom objetivo, confiável e proativo, mensagens curtas com status, risco, prazo e ação recomendada.",
  },
};

export function voiceFor(id: MascotId): Voice {
  return VOICES[id];
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
