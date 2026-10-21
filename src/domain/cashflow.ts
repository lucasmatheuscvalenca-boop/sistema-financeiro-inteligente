import { addDays, diffDays, type ISODate } from "./dates";
import type { Cents } from "./money";

export type CashEventKind =
  | "income"
  | "expense"
  | "invoice"
  | "goal_contribution"
  | "transfer_out"
  | "transfer_in"
  | "purchase";

export type Certainty = "confirmed" | "estimated";

/** Movimento futuro de caixa nas contas disponíveis para gastos. Valor com sinal. */
export interface CashEvent {
  date: ISODate;
  amountCents: Cents;
  label: string;
  kind: CashEventKind;
  certainty: Certainty;
  sourceId?: string;
  /** Aportes planejados podem ser ignorados em cenários "sem aportes". */
  optional?: boolean;
}

export interface CashFlowDay {
  date: ISODate;
  confirmedCents: Cents;
  withEstimatedCents: Cents;
  events: CashEvent[];
}

export interface CashFlowProjection {
  startDate: ISODate;
  endDate: ISODate;
  openingCents: Cents;
  days: CashFlowDay[];
  lowestConfirmed: { date: ISODate; balanceCents: Cents };
  lowestWithEstimated: { date: ISODate; balanceCents: Cents };
  firstNegativeConfirmed: ISODate | null;
  closingConfirmedCents: Cents;
  closingWithEstimatedCents: Cents;
  totals: { confirmedInCents: Cents; confirmedOutCents: Cents; estimatedInCents: Cents; estimatedOutCents: Cents };
}

/**
 * Projeta o saldo diário. Linha "confirmada" usa só eventos confirmados; a linha
 * "com estimativas" soma também receitas/despesas estimadas.
 */
export function projectCashFlow(input: {
  startDate: ISODate;
  endDate: ISODate;
  openingCents: Cents;
  events: readonly CashEvent[];
  includeOptional?: boolean;
}): CashFlowProjection {
  const includeOptional = input.includeOptional ?? true;
  const byDate = new Map<ISODate, CashEvent[]>();
  for (const e of input.events) {
    if (e.date < input.startDate || e.date > input.endDate) continue;
    if (e.optional && !includeOptional) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const totals = { confirmedInCents: 0, confirmedOutCents: 0, estimatedInCents: 0, estimatedOutCents: 0 };
  let confirmed = input.openingCents;
  let withEstimated = input.openingCents;
  const days: CashFlowDay[] = [];
  let lowestConfirmed = { date: input.startDate, balanceCents: confirmed };
  let lowestWithEstimated = { date: input.startDate, balanceCents: withEstimated };
  let firstNegative: ISODate | null = confirmed < 0 ? input.startDate : null;
  const total = Math.max(0, diffDays(input.startDate, input.endDate));
  for (let d = 0; d <= total; d++) {
    const date = addDays(input.startDate, d);
    const events = byDate.get(date) ?? [];
    for (const e of events) {
      withEstimated += e.amountCents;
      if (e.certainty === "confirmed") {
        confirmed += e.amountCents;
        if (e.amountCents >= 0) totals.confirmedInCents += e.amountCents;
        else totals.confirmedOutCents += -e.amountCents;
      } else if (e.amountCents >= 0) totals.estimatedInCents += e.amountCents;
      else totals.estimatedOutCents += -e.amountCents;
    }
    days.push({ date, confirmedCents: confirmed, withEstimatedCents: withEstimated, events });
    if (confirmed < lowestConfirmed.balanceCents) lowestConfirmed = { date, balanceCents: confirmed };
    if (withEstimated < lowestWithEstimated.balanceCents) lowestWithEstimated = { date, balanceCents: withEstimated };
    if (firstNegative === null && confirmed < 0) firstNegative = date;
  }
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    openingCents: input.openingCents,
    days,
    lowestConfirmed,
    lowestWithEstimated,
    firstNegativeConfirmed: firstNegative,
    closingConfirmedCents: confirmed,
    closingWithEstimatedCents: withEstimated,
    totals,
  };
}

/** Menor saldo confirmado entre duas datas (inclusivas) de uma projeção. */
export function lowestBetween(projection: CashFlowProjection, from: ISODate, to: ISODate): { date: ISODate; balanceCents: Cents } {
  let lowest: { date: ISODate; balanceCents: Cents } | null = null;
  for (const day of projection.days) {
    if (day.date < from || day.date > to) continue;
    if (!lowest || day.confirmedCents < lowest.balanceCents) lowest = { date: day.date, balanceCents: day.confirmedCents };
  }
  return lowest ?? { date: from, balanceCents: projection.openingCents };
}

/** Primeira receita confirmada depois de `after` (exclusivo). */
export function nextConfirmedIncome(events: readonly CashEvent[], after: ISODate): CashEvent | null {
  let best: CashEvent | null = null;
  for (const e of events) {
    if (e.kind !== "income" || e.certainty !== "confirmed" || e.amountCents <= 0) continue;
    if (e.date <= after) continue;
    if (!best || e.date < best.date) best = e;
  }
  return best;
}
