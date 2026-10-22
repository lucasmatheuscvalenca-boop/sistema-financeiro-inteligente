import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  currentInvoice,
  invoiceForClosing,
  invoiceStatus,
  limitUsage,
  type CardCycle,
  type InvoiceRef,
  type InvoiceStatus,
  type LimitUsage,
} from "@/domain/credit-card";
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
  await getCard(ctx, id);
  const data = parse(cardSchema.partial(), input);
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.defaultPaymentAccountId], "Conta de pagamento");
  await ctx.db
    .update(s.creditCards)
    .set(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)))
    .where(and(eq(s.creditCards.id, id), eq(s.creditCards.userId, ctx.userId)));
}

export async function archiveCard(ctx: ServiceContext, id: string): Promise<void> {
  await getCard(ctx, id);
  await ctx.db
    .update(s.creditCards)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.creditCards.id, id), eq(s.creditCards.userId, ctx.userId)));
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
