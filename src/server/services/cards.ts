import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  currentInvoice,
  invoiceForClosing,
  invoiceForPurchase,
  invoiceStatus,
  limitUsage,
  shiftInvoice,
  type CardCycle,
  type InvoiceRef,
  type InvoiceStatus,
  type LimitUsage,
} from "@/domain/credit-card";
import { dateWithClampedDay, parts, type ISODate } from "@/domain/dates";
import { invoiceTotals, type InvoiceTotals } from "@/domain/ledger";
import type { DbExecutor } from "../db/client";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import type { ServiceContext } from "./context";
import { assertOwned, centsPositive, isoDate, optionalUuid, parse, uuidSchema } from "./common";
import { toLedgerTx } from "./ledger";

export type CardRow = typeof s.creditCards.$inferSelect;
export type InvoiceRow = typeof s.cardInvoices.$inferSelect;

const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cartão").max(60),
  brand: z.string().trim().max(30).nullish(),
  limitCents: z.number().int().min(0, "Limite inválido").max(100_000_000_00),
  closingDay: z.coerce.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31"),
  dueDay: z.coerce.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31"),
  defaultPaymentAccountId: optionalUuid,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
});

export function cycleOf(card: Pick<CardRow, "closingDay" | "dueDay">): CardCycle {
  return { closingDay: card.closingDay, dueDay: card.dueDay };
}

export async function getCard(ctx: ServiceContext, id: string): Promise<CardRow> {
  const [row] = await ctx.db
    .select()
    .from(s.creditCards)
    .where(and(eq(s.creditCards.id, id), eq(s.creditCards.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Cartão não encontrado");
  return row;
}

export async function createCard(ctx: ServiceContext, input: z.input<typeof cardSchema>): Promise<CardRow> {
  const data = parse(cardSchema, input);
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.defaultPaymentAccountId], "Conta de pagamento");
  const [row] = await ctx.db
    .insert(s.creditCards)
    .values({ ...data, userId: ctx.userId, brand: data.brand ?? null, defaultPaymentAccountId: data.defaultPaymentAccountId ?? null, color: data.color ?? null })
    .returning();
  await audit(ctx.db, { userId: ctx.userId, action: "card.created", entityType: "card", entityId: row!.id });
  return row!;
}

export async function updateCard(ctx: ServiceContext, id: string, input: Partial<z.input<typeof cardSchema>>): Promise<void> {
  const current = await getCard(ctx, id);
  const data = parse(cardSchema.partial(), input);
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.defaultPaymentAccountId], "Conta de pagamento");
  const cycle = { closingDay: data.closingDay ?? current.closingDay, dueDay: data.dueDay ?? current.dueDay };
  const cycleChanged = cycle.closingDay !== current.closingDay || cycle.dueDay !== current.dueDay;
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(s.creditCards)
      .set(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)))
      .where(and(eq(s.creditCards.id, id), eq(s.creditCards.userId, ctx.userId)));
    if (cycleChanged) await reorganizeOpenInvoices(tx, ctx.userId, id, cycle, ctx.today);
  });
}

/**
 * Novo dia de fechamento ou de vencimento: as compras das faturas ainda abertas ou futuras são
 * redistribuídas pelo ciclo novo (parcelas mantêm a sequência a partir da fatura da compra). Faturas
 * já fechadas não mudam. Compra que, pelo ciclo novo, cairia numa fatura já fechada vai para a
 * fatura aberta agora: ela ainda não foi cobrada.
 */
async function reorganizeOpenInvoices(tx: DbExecutor, userId: string, cardId: string, cycle: CardCycle, today: ISODate): Promise<void> {
  const open = await tx
    .select()
    .from(s.cardInvoices)
    .where(and(eq(s.cardInvoices.cardId, cardId), eq(s.cardInvoices.userId, userId), gt(s.cardInvoices.closingDate, today)));
  if (open.length === 0) return;
  // Faturas que continuam válidas no ciclo novo (mesmo dia de fechamento) ganham o novo vencimento.
  for (const inv of open) {
    const ref = invoiceForClosing(inv.closingDate, cycle);
    const { year, month } = parts(inv.closingDate);
    if (dateWithClampedDay(year, month, cycle.closingDay) !== inv.closingDate) continue;
    if (ref.dueDate !== inv.dueDate || ref.reference !== inv.reference) {
      await tx.update(s.cardInvoices).set({ dueDate: ref.dueDate, reference: ref.reference }).where(eq(s.cardInvoices.id, inv.id));
    }
  }
  const purchases = await tx
    .select({ id: s.transactions.id, date: s.transactions.date, invoiceId: s.transactions.invoiceId, number: s.transactions.installmentNumber, firstDate: s.installmentPlans.firstDate })
    .from(s.transactions)
    .leftJoin(s.installmentPlans, eq(s.installmentPlans.id, s.transactions.installmentPlanId))
    .where(and(eq(s.transactions.userId, userId), eq(s.transactions.cardId, cardId), inArray(s.transactions.kind, ["expense", "refund"]), inArray(s.transactions.invoiceId, open.map((i) => i.id))));
  const current = currentInvoice(today, cycle);
  const invoiceIds = new Map<string, string>();
  const moves = new Map<string, string[]>();
  for (const t of purchases) {
    let ref = t.firstDate && t.number ? shiftInvoice(invoiceForPurchase(t.firstDate, cycle), t.number - 1, cycle) : invoiceForPurchase(t.date, cycle);
    if (ref.closingDate <= today) ref = current;
    let target = invoiceIds.get(ref.closingDate);
    if (!target) {
      target = await ensureInvoice(tx, userId, cardId, ref);
      invoiceIds.set(ref.closingDate, target);
    }
    if (target !== t.invoiceId) moves.set(target, [...(moves.get(target) ?? []), t.id]);
  }
  for (const [invoiceId, ids] of moves) {
    await tx.update(s.transactions).set({ invoiceId }).where(and(eq(s.transactions.userId, userId), inArray(s.transactions.id, ids)));
  }
  // Faturas do ciclo antigo que ficaram vazias saem da lista.
  const keep = new Set(invoiceIds.values());
  const candidates = open.map((i) => i.id).filter((id) => !keep.has(id));
  if (candidates.length) {
    const used = await tx
      .selectDistinct({ id: s.transactions.invoiceId })
      .from(s.transactions)
      .where(and(eq(s.transactions.userId, userId), inArray(s.transactions.invoiceId, candidates)));
    const empty = candidates.filter((id) => !used.some((u) => u.id === id));
    if (empty.length) await tx.delete(s.cardInvoices).where(and(eq(s.cardInvoices.userId, userId), inArray(s.cardInvoices.id, empty)));
  }
}

export async function archiveCard(ctx: ServiceContext, id: string): Promise<void> {
  await getCard(ctx, id);
  await ctx.db
    .update(s.creditCards)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.creditCards.id, id), eq(s.creditCards.userId, ctx.userId)));
}

/** Fatura que um pagamento feito em `paymentDate` quita: a que fechou antes dele. */
export function invoicePaidBy(paymentDate: ISODate, card: Pick<CardRow, "closingDay" | "dueDay">): InvoiceRef {
  return shiftInvoice(invoiceForPurchase(paymentDate, cycleOf(card)), -1, cycleOf(card));
}

/**
 * Total (compras − estornos) da fatura que um pagamento em `paymentDate` quitaria, em cada
 * cartão. Serve para reconhecer, pelo valor, qual cartão um pagamento de fatura pagou.
 */
export async function closedInvoiceTotals(db: DbExecutor, userId: string, cards: ReadonlyArray<Pick<CardRow, "id" | "closingDay" | "dueDay">>, paymentDate: ISODate): Promise<Map<string, number>> {
  if (cards.length === 0) return new Map();
  const closingByCard = new Map(cards.map((c) => [c.id, invoicePaidBy(paymentDate, c).closingDate]));
  const rows = await db
    .select({
      cardId: s.cardInvoices.cardId,
      closingDate: s.cardInvoices.closingDate,
      total: sql<number>`coalesce(sum(case when ${s.transactions.kind} = 'expense' then ${s.transactions.amountCents} when ${s.transactions.kind} = 'refund' then -${s.transactions.amountCents} else 0 end), 0)`.mapWith(Number),
    })
    .from(s.cardInvoices)
    .leftJoin(s.transactions, eq(s.transactions.invoiceId, s.cardInvoices.id))
    .where(and(eq(s.cardInvoices.userId, userId), inArray(s.cardInvoices.cardId, [...closingByCard.keys()]), inArray(s.cardInvoices.closingDate, [...new Set(closingByCard.values())])))
    .groupBy(s.cardInvoices.cardId, s.cardInvoices.closingDate);
  return new Map(rows.filter((r) => closingByCard.get(r.cardId) === r.closingDate).map((r) => [r.cardId, r.total]));
}

/** Garante a existência da fatura (idempotente) e retorna seu id. */
export async function ensureInvoice(db: DbExecutor, userId: string, cardId: string, ref: InvoiceRef): Promise<string> {
  await db
    .insert(s.cardInvoices)
    .values({ userId, cardId, closingDate: ref.closingDate, dueDate: ref.dueDate, reference: ref.reference })
    .onConflictDoNothing({ target: [s.cardInvoices.cardId, s.cardInvoices.closingDate] });
  const [row] = await db
    .select({ id: s.cardInvoices.id })
    .from(s.cardInvoices)
    .where(and(eq(s.cardInvoices.cardId, cardId), eq(s.cardInvoices.closingDate, ref.closingDate)))
    .limit(1);
  return row!.id;
}

export interface InvoiceSummary extends InvoiceRow, InvoiceTotals {
  status: InvoiceStatus;
  scheduledPaymentsCents: number;
}

export async function listInvoices(ctx: ServiceContext, cardId: string): Promise<InvoiceSummary[]> {
  const card = await getCard(ctx, cardId);
  const invoices = await ctx.db
    .select()
    .from(s.cardInvoices)
    .where(and(eq(s.cardInvoices.cardId, cardId), eq(s.cardInvoices.userId, ctx.userId)))
    .orderBy(desc(s.cardInvoices.closingDate));
  const txs = await ctx.db
    .select()
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), eq(s.transactions.cardId, cardId)));
  return invoices.map((inv) => {
    const related = txs.filter((t) => t.invoiceId === inv.id).map(toLedgerTx);
    const totals = invoiceTotals(related);
    const scheduledPayments = related.filter((t) => t.kind === "card_payment" && t.status === "scheduled").reduce((sum, t) => sum + t.amountCents, 0);
    return {
      ...inv,
      ...totals,
      scheduledPaymentsCents: scheduledPayments,
      status: invoiceStatus({
        invoice: { closingDate: inv.closingDate, dueDate: inv.dueDate, reference: inv.reference },
        totalCents: totals.totalCents,
        paidCents: totals.paymentsCents,
        today: ctx.today,
        cycle: cycleOf(card),
      }),
    };
  });
}

export interface CardOverview extends CardRow {
  limit: LimitUsage;
  openInvoice: { ref: InvoiceRef; totalCents: number } | null;
  nextDue: InvoiceSummary | null;
  invoices: InvoiceSummary[];
}

export async function listCardsOverview(ctx: ServiceContext): Promise<CardOverview[]> {
  const cards = await ctx.db
    .select()
    .from(s.creditCards)
    .where(and(eq(s.creditCards.userId, ctx.userId), isNull(s.creditCards.archivedAt)))
    .orderBy(asc(s.creditCards.createdAt));
  const result: CardOverview[] = [];
  for (const card of cards) {
    const invoices = await listInvoices(ctx, card.id);
    // Comprometimento do limite: tudo em aberto, inclusive parcelas futuras.
    const unpaid = invoices.reduce((sum, inv) => sum + inv.outstandingCents, 0);
    const open = currentInvoice(ctx.today, cycleOf(card));
    const openRow = invoices.find((i) => i.closingDate === open.closingDate);
    const nextDue =
      [...invoices]
        .filter((i) => i.dueDate >= ctx.today && i.outstandingCents > 0 && i.status !== "open" && i.status !== "future")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
      invoices.find((i) => i.status === "overdue") ??
      null;
    result.push({
      ...card,
      limit: limitUsage(card.limitCents, unpaid),
      openInvoice: { ref: open, totalCents: openRow?.totalCents ?? 0 },
      nextDue,
      invoices,
    });
  }
  return result;
}

const paySchema = z.object({
  invoiceId: uuidSchema,
  accountId: uuidSchema,
  amountCents: centsPositive,
  date: isoDate,
});

/**
 * Registra o pagamento de uma fatura. Gera uma transação card_payment, que tira o
 * dinheiro da conta mas NÃO é despesa (as compras já foram contadas).
 */
export async function payInvoice(ctx: ServiceContext, input: z.input<typeof paySchema>): Promise<string> {
  const data = parse(paySchema, input);
  const [invoice] = await ctx.db
    .select()
    .from(s.cardInvoices)
    .where(and(eq(s.cardInvoices.id, data.invoiceId), eq(s.cardInvoices.userId, ctx.userId)))
    .limit(1);
  if (!invoice) throw new NotFoundError("Fatura não encontrada");
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.accountId], "Conta");
  const card = await getCard(ctx, invoice.cardId);
  if (data.date < invoice.closingDate && data.date < ctx.today) {
    throw new ValidationError("A data do pagamento não pode ser anterior ao período da fatura");
  }
  const [tx] = await ctx.db
    .insert(s.transactions)
    .values({
      userId: ctx.userId,
      kind: "card_payment",
      status: data.date <= ctx.today ? "realized" : "scheduled",
      amountCents: data.amountCents,
      date: data.date,
      description: `Pagamento da fatura ${card.name} (${invoice.reference})`,
      accountId: data.accountId,
      cardId: card.id,
      invoiceId: invoice.id,
    })
    .returning({ id: s.transactions.id });
  await ctx.db.insert(s.transactionHistory).values({ transactionId: tx!.id, userId: ctx.userId, action: "create", actorUserId: ctx.userId, changes: {} });
  return tx!.id;
}

export function invoiceRefOf(row: Pick<InvoiceRow, "closingDate" | "dueDate" | "reference">): InvoiceRef {
  return { closingDate: row.closingDate, dueDate: row.dueDate, reference: row.reference };
}

export { invoiceForClosing };
