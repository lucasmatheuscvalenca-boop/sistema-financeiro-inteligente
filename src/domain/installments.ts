import { addMonthsToKey, diffDays, type ISODate, type MonthKey } from "./dates";
import { invoiceForPurchase, type CardCycle } from "./credit-card";
import type { Cents } from "./money";

/**
 * Central de parcelas: junta as compras parceladas no cartão, mostra quanto das próximas faturas
 * já está comprometido e projeta as parcelas que o banco ainda não mandou (no Open Finance e nos
 * extratos chega uma parcela por mês; nos lançamentos à mão todas já existem).
 */

export interface InstallmentRowInput {
  cardId: string;
  /** Plano criado no app (todas as parcelas existem). Nulo para parcelas importadas do banco. */
  planId: string | null;
  description: string;
  amountCents: Cents;
  number: number;
  count: number;
  /** Mês de referência da fatura (mês do vencimento). */
  reference: MonthKey;
}

export interface InstallmentGroup {
  key: string;
  cardId: string;
  description: string;
  count: number;
  /** Valor da parcela (a mais recente conhecida). */
  amountCents: Cents;
  /** Parcelas em faturas que já venceram. */
  paidCount: number;
  remainingCount: number;
  remainingCents: Cents;
  /** Mês da última parcela. */
  lastReference: MonthKey;
  /** Parcelas por mês de fatura, incluindo as projetadas. */
  schedule: Array<{ reference: MonthKey; number: number; amountCents: Cents; projected: boolean }>;
}

/** Tira o "3/10", "(03/10)", "PARC 3/10" do fim da descrição para juntar as parcelas da mesma compra. */
export function baseDescription(description: string): string {
  return description
    .replace(/\s*[-–(]?\s*(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\s*\)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Agrupa as parcelas por compra e projeta as que faltam. `currentReference` é o mês da fatura que
 * vence agora: parcelas em faturas anteriores contam como pagas.
 */
export function groupInstallments(rows: readonly InstallmentRowInput[], currentReference: MonthKey): InstallmentGroup[] {
  const buckets = new Map<string, InstallmentRowInput[]>();
  for (const r of rows) {
    if (r.count < 2 || r.number < 1 || r.number > r.count) continue;
    const key = r.planId ? `plano:${r.planId}` : `banco:${r.cardId}|${baseDescription(r.description).toLowerCase()}|${r.count}`;
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  const groups: InstallmentGroup[] = [];
  for (const [key, list] of buckets) {
    // Uma parcela por número (a importação pode trazer a mesma parcela de duas fontes).
    const byNumber = new Map<number, InstallmentRowInput>();
    for (const r of list) if (!byNumber.has(r.number)) byNumber.set(r.number, r);
    const known = [...byNumber.values()].sort((a, b) => a.number - b.number);
    const last = known[known.length - 1]!;
    const schedule: InstallmentGroup["schedule"] = known.map((r) => ({ reference: r.reference, number: r.number, amountCents: r.amountCents, projected: false }));
    for (let n = last.number + 1; n <= last.count; n++) {
      schedule.push({ reference: addMonthsToKey(last.reference, n - last.number), number: n, amountCents: last.amountCents, projected: true });
    }
    // Parcelas anteriores à primeira conhecida (importação recente de compra antiga) contam como pagas.
    const first = known[0]!;
    const paidBefore = first.number - 1;
    const pending = schedule.filter((p) => p.reference >= currentReference);
    groups.push({
      key,
      cardId: last.cardId,
      description: baseDescription(last.description) || last.description,
      count: last.count,
      amountCents: last.amountCents,
      paidCount: paidBefore + schedule.filter((p) => p.reference < currentReference).length,
      remainingCount: pending.length,
      remainingCents: pending.reduce((s, p) => s + p.amountCents, 0),
      lastReference: schedule[schedule.length - 1]!.reference,
      schedule,
    });
  }
  return groups.filter((g) => g.remainingCount > 0).sort((a, b) => a.lastReference.localeCompare(b.lastReference) || b.remainingCents - a.remainingCents);
}

/** Total de parcelas por mês de fatura, a partir de `fromReference`, por `months` meses. */
export function installmentsByMonth(groups: readonly InstallmentGroup[], fromReference: MonthKey, months: number): Array<{ reference: MonthKey; cents: Cents }> {
  const out = Array.from({ length: months }, (_, i) => ({ reference: addMonthsToKey(fromReference, i), cents: 0 }));
  const idx = new Map(out.map((o, i) => [o.reference, i]));
  for (const g of groups) for (const p of g.schedule) {
    const i = idx.get(p.reference);
    if (i !== undefined) out[i]!.cents += p.amountCents;
  }
  return out;
}

export interface BestPurchaseDay {
  /** Comprar a partir deste dia joga a compra para a fatura seguinte. */
  day: number;
  /** Prazo até pagar, para compras feitas no melhor dia (em dias). */
  daysToPay: number;
  /** Próximo fechamento a partir de hoje. */
  nextClosing: ISODate;
  daysToClosing: number;
}

/** Melhor dia de compra: o dia do fechamento (a compra entra na fatura seguinte e dá o maior prazo). */
export function bestPurchaseDay(cycle: CardCycle, today: ISODate): BestPurchaseDay {
  const current = invoiceForPurchase(today, cycle);
  const afterClosing = invoiceForPurchase(current.closingDate, cycle);
  return {
    day: cycle.closingDay,
    daysToPay: diffDays(current.closingDate, afterClosing.dueDate),
    nextClosing: current.closingDate,
    daysToClosing: diffDays(today, current.closingDate),
  };
}
