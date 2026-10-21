import { centsToDecimalString, formatMoney } from "@/domain/money";
import { formatDateBR, formatDateShort, formatMonthKey } from "@/domain/dates";

export { formatMoney, formatDateBR, formatDateShort, formatMonthKey };

/** Valor em centavos para preencher campos de formulário ("1234,56"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return centsToDecimalString(cents).replace(".", ",");
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatRelativeDays(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

/** Data e hora de um instante no fuso do usuário ("21/10/2026 14:05"). */
export function formatDateTime(at: Date | null | undefined, timeZone = "America/Sao_Paulo"): string {
  if (!at) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);
}
