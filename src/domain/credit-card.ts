import { addDays, addMonths, dateWithClampedDay, monthKey, parts, type ISODate, type MonthKey } from "./dates";
import { assertCents, percentOf, splitEvenly, type Cents } from "./money";

export interface CardCycle {
  /** Dia em que a fatura fecha. Compras feitas neste dia ou depois vão para a próxima fatura. */
  closingDay: number;
  /** Dia de vencimento. Se for menor ou igual ao fechamento, vence no mês seguinte ao fechamento. */
  dueDay: number;
}

export interface InvoiceRef {
  closingDate: ISODate;
  dueDate: ISODate;
  /** Mês de referência da fatura = mês do vencimento ("YYYY-MM"). */
  reference: MonthKey;
}

export class CardError extends Error {}

export function validateCycle(cycle: CardCycle): void {
  for (const [label, day] of [
    ["fechamento", cycle.closingDay],
    ["vencimento", cycle.dueDay],
  ] as const) {
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new CardError(`Dia de ${label} inválido`);
  }
}

function closingDateIn(year: number, month: number, cycle: CardCycle): ISODate {
  return dateWithClampedDay(year, month, cycle.closingDay);
}

function dueDateForClosing(closingDate: ISODate, cycle: CardCycle): ISODate {
  const c = parts(closingDate);
  const sameMonth = cycle.dueDay > cycle.closingDay;
  return dateWithClampedDay(c.year, c.month + (sameMonth ? 0 : 1), cycle.dueDay);
}

export function invoiceForClosing(closingDate: ISODate, cycle: CardCycle): InvoiceRef {
  const dueDate = dueDateForClosing(closingDate, cycle);
  return { closingDate, dueDate, reference: monthKey(dueDate) };
}

/** Em qual fatura cai uma compra feita em `purchaseDate`. */
export function invoiceForPurchase(purchaseDate: ISODate, cycle: CardCycle): InvoiceRef {
  validateCycle(cycle);
  const p = parts(purchaseDate);
  let closing = closingDateIn(p.year, p.month, cycle);
  if (purchaseDate >= closing) closing = closingDateIn(p.year, p.month + 1, cycle);
  return invoiceForClosing(closing, cycle);
}

/** Fatura deslocada em N ciclos (usada em parcelamentos). */
export function shiftInvoice(invoice: InvoiceRef, cycles: number, cycle: CardCycle): InvoiceRef {
  const c = parts(invoice.closingDate);
  return invoiceForClosing(closingDateIn(c.year, c.month + cycles, cycle), cycle);
}

/** Período de compras de uma fatura: [fechamento anterior, fechamento - 1 dia]. */
export function invoicePeriod(invoice: InvoiceRef, cycle: CardCycle): { start: ISODate; end: ISODate } {
  const c = parts(invoice.closingDate);
  return { start: closingDateIn(c.year, c.month - 1, cycle), end: addDays(invoice.closingDate, -1) };
}

/** Fatura em aberto (ainda recebendo compras) numa data. */
export function currentInvoice(today: ISODate, cycle: CardCycle): InvoiceRef {
  return invoiceForPurchase(today, cycle);
}

export type InvoiceStatus = "open" | "closed" | "paid" | "partially_paid" | "overdue" | "future";

export function invoiceStatus(input: {
  invoice: InvoiceRef;
  totalCents: Cents;
  paidCents: Cents;
  today: ISODate;
  cycle: CardCycle;
}): InvoiceStatus {
  const { invoice, totalCents, paidCents, today, cycle } = input;
  const period = invoicePeriod(invoice, cycle);
  if (today < period.start) return "future";
  if (today < invoice.closingDate) return "open";
  if (totalCents <= 0 || paidCents >= totalCents) return "paid";
  if (today > invoice.dueDate) return "overdue";
  return paidCents > 0 ? "partially_paid" : "closed";
}

export interface InstallmentScheduleItem {
  number: number;
  of: number;
  amountCents: Cents;
  /** Data de competência da parcela (data da compra + N meses). */
  date: ISODate;
  invoice?: InvoiceRef;
}

/**
 * Gera o cronograma de um parcelamento. No cartão, a parcela N cai na fatura da compra
 * deslocada em N-1 ciclos. Fora do cartão, cada parcela vence no mesmo dia dos meses seguintes.
 */
export function buildInstallmentSchedule(input: {
  totalCents: Cents;
  count: number;
  firstDate: ISODate;
  cycle?: CardCycle;
}): InstallmentScheduleItem[] {
  assertCents(input.totalCents, "total");
  if (input.totalCents <= 0) throw new CardError("O valor total precisa ser positivo");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 120) {
    throw new CardError("Quantidade de parcelas deve estar entre 1 e 120");
  }
  const amounts = splitEvenly(input.totalCents, input.count);
  const firstInvoice = input.cycle ? invoiceForPurchase(input.firstDate, input.cycle) : undefined;
  return amounts.map((amountCents, i) => ({
    number: i + 1,
    of: input.count,
    amountCents,
    date: addMonths(input.firstDate, i),
    invoice: firstInvoice && input.cycle ? shiftInvoice(firstInvoice, i, input.cycle) : undefined,
  }));
}

export interface LimitUsage {
  limitCents: Cents;
  committedCents: Cents;
  availableCents: Cents;
  usedPct: number;
  overLimit: boolean;
}

/**
 * Comprometimento do limite: tudo que foi comprado e ainda não foi pago,
 * incluindo parcelas futuras (que já ocupam o limite no cartão real).
 */
export function limitUsage(limitCents: Cents, unpaidChargesCents: Cents): LimitUsage {
  const committed = Math.max(0, unpaidChargesCents);
  return {
    limitCents,
    committedCents: committed,
    availableCents: limitCents - committed,
    usedPct: percentOf(committed, limitCents),
    overLimit: committed > limitCents,
  };
}
