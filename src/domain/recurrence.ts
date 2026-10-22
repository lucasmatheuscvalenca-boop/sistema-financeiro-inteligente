import { addDays, assertISODate, dateWithClampedDay, parts, type ISODate } from "./dates";

export type Frequency = "weekly" | "biweekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  startDate: ISODate;
  frequency: Frequency;
  /** A cada N períodos (padrão 1). */
  interval?: number;
  /** Dia fixo do mês para recorrências mensais/anuais; padrão: dia da data inicial. */
  dayOfMonth?: number | null;
  /** Última data possível (inclusiva). */
  endDate?: ISODate | null;
  /** Número máximo de ocorrências a partir da data inicial. */
  count?: number | null;
}

export class RecurrenceError extends Error {}

export function validateRule(rule: RecurrenceRule): void {
  assertISODate(rule.startDate, "Data inicial");
  if (rule.endDate) {
    assertISODate(rule.endDate, "Data final");
    if (rule.endDate < rule.startDate) throw new RecurrenceError("A data final precisa ser posterior à inicial");
  }
  const interval = rule.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) throw new RecurrenceError("Intervalo inválido");
  if (rule.dayOfMonth != null && (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31)) {
    throw new RecurrenceError("Dia do mês inválido");
  }
  if (rule.count != null && (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > 1200)) {
    throw new RecurrenceError("Quantidade de ocorrências inválida");
  }
}

/** n-ésima ocorrência (0 = primeira), sempre calculada a partir da data inicial para não acumular desvios. */
export function nthOccurrence(rule: RecurrenceRule, n: number): ISODate {
  const interval = rule.interval ?? 1;
  const start = parts(rule.startDate);
  switch (rule.frequency) {
    case "weekly":
      return addDays(rule.startDate, 7 * interval * n);
    case "biweekly":
      return addDays(rule.startDate, 14 * interval * n);
    case "monthly":
      return dateWithClampedDay(start.year, start.month + interval * n, rule.dayOfMonth ?? start.day);
    case "yearly":
      return dateWithClampedDay(start.year + interval * n, start.month, rule.dayOfMonth ?? start.day);
  }
}

/**
 * Lista as ocorrências dentro de [from, to] (inclusivo), respeitando data final e
 * quantidade máxima. Limite de segurança: 2.000 ocorrências por chamada.
 */
export function expandOccurrences(rule: RecurrenceRule, from: ISODate, to: ISODate): ISODate[] {
  validateRule(rule);
  if (to < from) return [];
  const result: ISODate[] = [];
  const limit = rule.count ?? Number.POSITIVE_INFINITY;
  let produced = 0;
  for (let n = 0; n < 6000; n++) {
    const date = nthOccurrence(rule, n);
    // Em recorrências mensais com dia fixo, a 1ª ocorrência pode cair antes do início.
    if (date < rule.startDate) continue;
    if (produced >= limit) break;
    produced++;
    if (rule.endDate && date > rule.endDate) break;
    if (date > to) break;
    if (date >= from) result.push(date);
    if (result.length >= 2000) break;
  }
  return result;
}

export function nextOccurrence(rule: RecurrenceRule, onOrAfter: ISODate): ISODate | null {
  const horizon = dateWithClampedDay(parts(onOrAfter).year + 3, parts(onOrAfter).month, parts(onOrAfter).day);
  return expandOccurrences(rule, onOrAfter, horizon)[0] ?? null;
}

export function describeFrequency(frequency: Frequency, interval = 1): string {
  const base: Record<Frequency, [string, string]> = {
    weekly: ["Semanal", "semanas"],
    biweekly: ["Quinzenal", "quinzenas"],
    monthly: ["Mensal", "meses"],
    yearly: ["Anual", "anos"],
  };
  const [single, plural] = base[frequency];
  return interval === 1 ? single : `A cada ${interval} ${plural}`;
}

/** Fator para converter o valor de uma ocorrência em média mensal. */
export function monthlyFactor(frequency: Frequency, interval = 1): number {
  switch (frequency) {
    case "weekly":
      return 52 / 12 / interval;
    case "biweekly":
      return 26 / 12 / interval;
    case "monthly":
      return 1 / interval;
    case "yearly":
      return 1 / 12 / interval;
  }
}
