/**
 * Catálogo oficial e fechado de mascotes. Exatamente seis personagens.
 * Os identificadores são estáveis e também existem na tabela `mascots` do banco
 * (chave estrangeira em `user_preferences.mascot_id`).
 */
export const MASCOT_IDS = ["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"] as const;

export type MascotId = (typeof MASCOT_IDS)[number];

export const MASCOT_STATES = ["neutral", "analysis", "guidance", "celebration", "attention", "alert"] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

export const MASCOT_STATE_LABEL: Record<MascotState, string> = {
  neutral: "Neutro",
  analysis: "Análise",
  guidance: "Orientação",
  celebration: "Celebração",
  attention: "Atenção",
  alert: "Alerta importante",
};

export interface Mascot {
  id: MascotId;
  name: string;
  title: string;
  /** Concordância de gênero do título ("O Estrategista" / "A Companheira"). */
  article: "o" | "a";
  personality: string[];
  shortDescription: string;
  catchphrase: string;
  communicationFocus: string;
  /** Cores da ilustração. */
  palette: { primary: string; secondary: string; accent: string };
}

export const MASCOTS: Record<MascotId, Mascot> = {
  lince: {
    id: "lince",
    name: "Lince",
    title: "O Estrategista",
    article: "o",
    personality: ["inteligente", "analítico", "estratégico", "observador"],
    shortDescription: "Lê os números com atenção e mostra os cenários antes de cada decisão.",
    catchphrase: "Vamos tomar decisões melhores hoje para conquistar mais liberdade amanhã.",
    communicationFocus: "análises, oportunidades, previsões, cenários e decisões fundamentadas em dados",
    palette: { primary: "#C08A4B", secondary: "#F3E3CC", accent: "#1E3A5F" },
  },
  capivara: {
    id: "capivara",
    name: "Capivara",
    title: "A Companheira",
    article: "a",
    personality: ["tranquila", "acolhedora", "paciente", "equilibrada"],
    shortDescription: "Ajuda a criar hábitos sustentáveis, sem pressa e sem culpa.",
    catchphrase: "Um passo de cada vez. Consistência também é uma forma de riqueza.",
    communicationFocus: "bem-estar financeiro, hábitos sustentáveis, equilíbrio e qualidade de vida",
    palette: { primary: "#9C6B48", secondary: "#E9D3BF", accent: "#2E7D6B" },
  },
  coruja: {
    id: "coruja",
    name: "Coruja",
    title: "A Conselheira",
    article: "a",
    personality: ["sábia", "didática", "analítica", "cuidadosa"],
    shortDescription: "Explica o porquê de cada número para você decidir com segurança.",
    catchphrase: "Entender seu dinheiro é o primeiro passo para decidir melhor.",
    communicationFocus: "educação financeira, explicações, riscos e planejamento de longo prazo",
    palette: { primary: "#5B4A7A", secondary: "#E4DDF0", accent: "#C9A227" },
  },
  polvo: {
    id: "polvo",
    name: "Polvo",
    title: "O Organizador",
    article: "o",
    personality: ["organizado", "versátil", "prático", "atento aos detalhes"],
    shortDescription: "Coloca contas, categorias e compromissos no lugar certo.",
    catchphrase: "Vamos colocar tudo em ordem para você ter controle de verdade.",
    communicationFocus: "contas, categorias, orçamento, compromissos e organização cotidiana",
    palette: { primary: "#D9675A", secondary: "#FBE0DA", accent: "#0E7C7B" },
  },
  raposa: {
    id: "raposa",
    name: "Raposa",
    title: "A Estrategista",
    article: "a",
    personality: ["perspicaz", "adaptável", "ambiciosa", "orientada a resultados"],
    shortDescription: "Procura alternativas e simulações para chegar mais rápido às metas.",
    catchphrase: "Com a estratégia certa, seus objetivos ficam mais próximos.",
    communicationFocus: "otimização de recursos, alternativas, simulações e metas ambiciosas",
    palette: { primary: "#E07A2E", secondary: "#FCE6D2", accent: "#0B1F3A" },
  },
  guardiao: {
    id: "guardiao",
    name: "Guardião",
    title: "O Consultor Digital",
    article: "o",
    personality: ["tecnológico", "proativo", "confiável", "objetivo"],
    shortDescription: "Monitora seu plano e avisa antes que os problemas apareçam.",
    catchphrase: "Estou acompanhando seu plano. Vamos agir antes que os problemas apareçam.",
    communicationFocus: "monitoramento, alertas, prevenção e acompanhamento contínuo",
    palette: { primary: "#2B6CB0", secondary: "#D9E8F7", accent: "#14B8A6" },
  },
};

export function isMascotId(value: unknown): value is MascotId {
  return typeof value === "string" && (MASCOT_IDS as readonly string[]).includes(value);
}

export function getMascot(id: MascotId): Mascot {
  return MASCOTS[id];
}

export const MASCOT_LIST: readonly Mascot[] = MASCOT_IDS.map((id) => MASCOTS[id]);
