/** Estados possíveis de um agente (espelha o enum agent_status do banco). */
export const AGENT_STATUSES = [
  "available",
  "planning",
  "working",
  "waiting_agent",
  "waiting_approval",
  "paused",
  "done",
  "error",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  available: "Disponível",
  planning: "Planejando",
  working: "Trabalhando",
  waiting_agent: "Aguardando outro agente",
  waiting_approval: "Aguardando aprovação",
  paused: "Pausado",
  done: "Concluído",
  error: "Com erro",
};

/**
 * Comportamento visual do personagem no escritório (Fase 2). Derivado do estado real — nunca o contrário.
 * Estados ativos (planning/working) só podem ser exibidos se existir uma execução real em andamento.
 */
export type VisualBehavior = "idle" | "at_desk" | "in_meeting" | "presenting" | "blocked" | "stopped" | "alert";

export function visualBehaviorFor(status: AgentStatus, activity?: "research" | "meeting" | null): VisualBehavior {
  switch (status) {
    case "planning":
    case "working":
      return activity === "meeting" ? "in_meeting" : "at_desk";
    case "waiting_agent":
      return "in_meeting";
    case "waiting_approval":
      return "blocked";
    case "done":
      return "presenting";
    case "paused":
      return "stopped";
    case "error":
      return "alert";
    case "available":
      return "idle";
  }
}

/** Estados que representam trabalho em andamento (exigem execução real correspondente). */
export function isActiveStatus(status: AgentStatus): boolean {
  return status === "planning" || status === "working";
}
