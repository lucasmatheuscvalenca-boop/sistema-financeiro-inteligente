/**
 * O consultor do Meu Banqueiro é um só: O Banqueiro. O catálogo continua com a mesma forma
 * (id estável, estados, textos) porque a tabela `mascots` e o histórico de escolhas existem no
 * banco; os seis personagens anteriores ficam registrados só como ids legados.
 */
export const MASCOT_IDS = ["banqueiro"] as const;

export type MascotId = (typeof MASCOT_IDS)[number];

/** Ids dos personagens anteriores: ainda aparecem em registros antigos, mas todos mostram O Banqueiro. */
export const LEGACY_MASCOT_IDS = ["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"] as const;

export const MASCOT_STATES = ["neutral", "analysis", "guidance", "celebration", "attention", "alert"] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

export const MASCOT_STATE_LABEL: Record<MascotState, string> = {
  neutral: "Neutro",
  analysis: "Análise",
  guidance: "Orientação",
  celebration: "Comemoração",
  attention: "Atenção",
  alert: "Alerta",
};

export interface Mascot {
  id: MascotId;
  name: string;
  title: string;
  /** Concordância de gênero do título. */
  article: "o" | "a";
  personality: string[];
  shortDescription: string;
  catchphrase: string;
  communicationFocus: string;
  /** Cores da ilustração. */
  palette: { primary: string; secondary: string; accent: string };
}

export const MASCOTS: Record<MascotId, Mascot> = {
  banqueiro: {
    id: "banqueiro",
    name: "O Banqueiro",
    title: "Seu consultor financeiro",
    article: "o",
    personality: ["experiente", "claro", "próximo", "confiável"],
    shortDescription: "Lê seus números todos os dias e explica, com calma, o que fazer a seguir.",
    catchphrase: "Decisões claras hoje, liberdade amanhã.",
    communicationFocus: "leitura diária das contas, decisões de gasto, metas e planejamento de longo prazo",
    palette: { primary: "#0F4A3A", secondary: "#F7F5EF", accent: "#D4AF57" },
  },
};

export const BANKER: Mascot = MASCOTS.banqueiro;

export function isMascotId(value: unknown): value is MascotId {
  return typeof value === "string" && (MASCOT_IDS as readonly string[]).includes(value);
}

/** Converte o que vier do banco (id atual, legado ou nulo) no consultor atual. */
export function normalizeMascotId(value: unknown): MascotId | null {
  if (isMascotId(value)) return value;
  if (typeof value === "string" && (LEGACY_MASCOT_IDS as readonly string[]).includes(value)) return "banqueiro";
  return null;
}

export function getMascot(_id?: MascotId | string | null): Mascot {
  return BANKER;
}

export const MASCOT_LIST: readonly Mascot[] = MASCOT_IDS.map((id) => MASCOTS[id]);
