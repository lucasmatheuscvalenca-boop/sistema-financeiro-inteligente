import { and, eq, gte, isNotNull, isNull, ne } from "drizzle-orm";
import * as s from "../db/schema";
import { invoiceForPurchase, shiftInvoice, type CardCycle } from "@/domain/credit-card";
import { addMonthsToKey, type ISODate, type MonthKey } from "@/domain/dates";
import { bestPurchaseDay, groupInstallments, type BestPurchaseDay, type InstallmentGroup, type InstallmentRowInput } from "@/domain/installments";
import type { ServiceContext } from "./context";

export interface CardInstallments {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  best: BestPurchaseDay;
  /** Mês da fatura que vence agora (a mais próxima ainda não vencida). */
  currentReference: MonthKey;
}

export interface MonthCommitment {
  reference: MonthKey;
  /** Parcelas (gravadas + projetadas). */
  installmentsCents: number;
  /** Outras compras já lançadas na fatura desse mês. */
  otherCents: number;
}

export interface InstallmentCenter {
  cards: CardInstallments[];
  groups: Array<InstallmentGroup & { cardName: string }>;
  months: MonthCommitment[];
  remainingCents: number;
}

/** Fatura que vence agora: a fechada ainda não vencida ou, se já venceu, a aberta. */
function currentReferenceFor(cycle: CardCycle, today: ISODate): MonthKey {
  const open = invoiceForPurchase(today, cycle);
  const previous = shiftInvoice(open, -1, cycle);
  return previous.dueDate >= today ? previous.reference : open.reference;
}

const HORIZON = 12;

export async function getInstallmentCenter(ctx: ServiceContext): Promise<InstallmentCenter> {
  const cardRows = await ctx.db
    .select({ id: s.creditCards.id, name: s.creditCards.name, closingDay: s.creditCards.closingDay, dueDay: s.creditCards.dueDay })
    .from(s.creditCards)
    .where(and(eq(s.creditCards.userId, ctx.userId), isNull(s.creditCards.archivedAt)));
  if (!cardRows.length) return { cards: [], groups: [], months: [], remainingCents: 0 };

  const cards: CardInstallments[] = cardRows.map((c) => {
    const cycle = { closingDay: c.closingDay, dueDay: c.dueDay };
    return { ...c, best: bestPurchaseDay(cycle, ctx.today), currentReference: currentReferenceFor(cycle, ctx.today) };
  });
  const fromReference = cards.map((c) => c.currentReference).sort()[0]!;
  const minDueDate = `${addMonthsToKey(fromReference, -24)}-01`;

  // Uma consulta para todas as compras no cartão com fatura (parcelas e à vista), dos últimos dois anos em diante.
  const charges = await ctx.db
    .select({
      cardId: s.transactions.cardId,
      kind: s.transactions.kind,
      amountCents: s.transactions.amountCents,
      description: s.transactions.description,
      planId: s.transactions.installmentPlanId,
      number: s.transactions.installmentNumber,
      count: s.transactions.installmentCount,
      reference: s.cardInvoices.reference,
    })
    .from(s.transactions)
    .innerJoin(s.cardInvoices, eq(s.cardInvoices.id, s.transactions.invoiceId))
    .where(and(eq(s.transactions.userId, ctx.userId), isNotNull(s.transactions.cardId), ne(s.transactions.status, "estimated"), gte(s.cardInvoices.dueDate, minDueDate)));

  const cardName = new Map(cards.map((c) => [c.id, c.name]));
  const groups: InstallmentCenter["groups"] = [];
  for (const card of cards) {
    const rows: InstallmentRowInput[] = charges
      .filter((r) => r.cardId === card.id && r.kind === "expense" && (r.count ?? 0) > 1 && r.number)
      .map((r) => ({ cardId: card.id, planId: r.planId, description: r.description, amountCents: r.amountCents, number: r.number!, count: r.count!, reference: r.reference }));
    for (const g of groupInstallments(rows, card.currentReference)) groups.push({ ...g, cardName: cardName.get(card.id) ?? "Cartão" });
  }
  groups.sort((a, b) => a.lastReference.localeCompare(b.lastReference) || b.remainingCents - a.remainingCents);

  // Comprometido por mês: parcelas (gravadas e projetadas) + outras compras já lançadas na fatura.
  const months: MonthCommitment[] = Array.from({ length: HORIZON }, (_, i) => ({ reference: addMonthsToKey(fromReference, i), installmentsCents: 0, otherCents: 0 }));
  const idx = new Map(months.map((m, i) => [m.reference, i]));
  for (const g of groups) for (const p of g.schedule) {
    const i = idx.get(p.reference);
    if (i !== undefined) months[i]!.installmentsCents += p.amountCents;
  }
  for (const r of charges) {
    const i = idx.get(r.reference);
    if (i === undefined || (r.count ?? 0) > 1) continue;
    if (r.kind === "expense") months[i]!.otherCents += r.amountCents;
    else if (r.kind === "refund") months[i]!.otherCents -= r.amountCents;
  }
  // Sem meses vazios no fim da lista.
  while (months.length > 1 && months[months.length - 1]!.installmentsCents === 0 && months[months.length - 1]!.otherCents === 0) months.pop();

  return { cards, groups, months, remainingCents: groups.reduce((t, g) => t + g.remainingCents, 0) };
}
