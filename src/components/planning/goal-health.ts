import type { BadgeTone } from "@/components/ui/badge";
import { formatMonthKey, fullMonthsBetween, type ISODate, type MonthKey } from "@/domain/dates";
import type { GoalDiagnosis, GoalHealth } from "@/domain/goals";
import { formatMoney } from "@/domain/money";
import type { Tone } from "@/mascots/voice";

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

export function progressTone(health: GoalHealth): "gold" | "warning" | "petrol" {
  return health === "completed" ? "gold" : health === "at_risk" || health === "overdue" ? "warning" : "petrol";
}

/** “Faltam 7 meses”, “Este mês”, “Sem prazo” ou “Concluída”. */
export function timeLeftLabel(remainingCents: number, today: ISODate, targetDate: ISODate | null): string {
  if (remainingCents <= 0) return "Concluída";
  if (!targetDate) return "Sem prazo";
  const left = Math.max(0, fullMonthsBetween(today, targetDate));
  return left === 0 ? (targetDate < today ? "Prazo vencido" : "Este mês") : `${left} ${left === 1 ? "mês" : "meses"}`;
}

/** Aporte mensal sugerido: o planejado ou, sem ele, o necessário para cumprir o prazo. */
export function suggestedMonthly(plannedMonthlyCents: number | null, d: GoalDiagnosis): number | null {
  if (d.remainingCents <= 0) return null;
  return plannedMonthlyCents ?? d.required.perPeriodCents;
}

const month = (date: ISODate) => formatMonthKey(date.slice(0, 7) as MonthKey);

/**
 * Leitura da meta em uma frase, a partir do diagnóstico determinístico. O mascote só adiciona
 * a abertura; os números vêm daqui.
 */
export function goalInsight(d: GoalDiagnosis, targetDate: ISODate | null): { tone: Tone; text: string } {
  const done = d.projection?.completionDate;
  const need = d.required.perPeriodCents;
  switch (d.health) {
    case "completed":
      return { tone: "positive", text: "O valor do objetivo foi alcançado." };
    case "on_track":
      return { tone: "positive", text: done ? `No ritmo atual, a meta fica pronta em ${month(done)}, dentro do prazo.` : "Os aportes atuais cobrem o prazo." };
    case "at_risk": {
      const late = d.projection?.monthsLate;
      const fix = need ? ` Aportar ${formatMoney(need)} por mês recupera o prazo.` : "";
      return {
        tone: "caution",
        text: done ? `No ritmo atual, a conclusão fica para ${month(done)}${late ? `, ${late} ${late === 1 ? "mês" : "meses"} depois do prazo` : ""}.${fix}` : `Com os aportes atuais a meta não chega ao valor.${fix}`,
      };
    }
    case "not_started":
      return { tone: "unknown", text: need ? `Registre o primeiro aporte. Para cumprir o prazo, o necessário é ${formatMoney(need)} por mês.` : "Registre o primeiro aporte para eu projetar a conclusão." };
    case "no_deadline":
      return { tone: "neutral", text: done ? `Sem prazo definido. No ritmo atual, conclui em ${month(done)}.` : "Defina um prazo para eu calcular o aporte mensal necessário." };
    case "paused":
      return { tone: "neutral", text: "Aportes pausados. Reative quando quiser voltar a avançar." };
    case "overdue":
      return { tone: "critical", text: `O prazo${targetDate ? ` (${month(targetDate)})` : ""} passou e faltam ${formatMoney(d.remainingCents)}. Ajuste a data ou o valor para recalcular o aporte.` };
    case "insufficient_periods":
      return { tone: "critical", text: d.required.explanation };
  }
}
