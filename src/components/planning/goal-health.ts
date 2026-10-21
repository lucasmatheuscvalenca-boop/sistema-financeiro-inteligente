import type { BadgeTone } from "@/components/ui/badge";
import type { GoalHealth } from "@/domain/goals";

export const GOAL_HEALTH: Record<GoalHealth, { label: string; tone: BadgeTone }> = {
  completed: { label: "Concluída", tone: "gold" },
  paused: { label: "Pausada", tone: "neutral" },
  overdue: { label: "Prazo vencido", tone: "negative" },
  insufficient_periods: { label: "Sem tempo para aportes", tone: "negative" },
  on_track: { label: "No prazo", tone: "positive" },
  at_risk: { label: "Em risco de atraso", tone: "warning" },
  not_started: { label: "Não iniciada", tone: "neutral" },
  no_deadline: { label: "Sem prazo", tone: "info" },
};
