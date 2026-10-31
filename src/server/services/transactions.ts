import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { buildInstallmentSchedule, invoiceForPurchase } from "@/domain/credit-card";
import { addDays, endOfMonth, startOfMonth, type ISODate } from "@/domain/dates";
import { matchOccurrences } from "@/domain/import/classify";
import { expandOccurrences, type Frequency } from "@/domain/recurrence";
import { validateLedgerTx, LedgerError, type TxKind, type TxStatus } from "@/domain/ledger";
import type { DbExecutor } from "../db/client";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import type { ServiceContext } from "./context";
import { assertOwned, centsPositive, diffFields, isoDate, optionalUuid, parse } from "./common";
import { cycleOf, ensureInvoice } from "./cards";
import type { TxRow } from "./ledger";

export const INCOME_TYPES = ["salary", "commission", "yield", "variable", "extraordinary", "other"] as const;
export const EXPENSE_NATURES = ["fixed", "variable", "extraordinary"] as const;

export const INCOME_TYPE_LABEL: Record<(typeof INCOME_TYPES)[number], string> = {
  salary: "Renda fixa / salário",
  commission: "Comissão",
  yield: "Rendimento",
  variable: "Receita variável",
  extraordinary: "Ganho extraordinário",
  other: "Outra",
};

export const EXPENSE_NATURE_LABEL: Record<(typeof EXPENSE_NATURES)[number], string> = {
  fixed: "Fixa",
  variable: "Variável",
  extraordinary: "Extraordinária",
};

const createSchema = z.object({
  kind: z.enum(["income", "expense", "refund", "transfer"]),
  status: z.enum(["realized", "scheduled", "estimated"]).optional(),
  amountCents: centsPositive,
  date: isoDate,
  description: z.string().trim().min(1, "Informe uma descrição").max(140, "Descrição muito longa"),
  notes: z.string().trim().max(1000).nullish(),
  categoryId: optionalUuid,
  accountId: optionalUuid,
  toAccountId: optionalUuid,
  cardId: optionalUuid,
  incomeType: z.enum(INCOME_TYPES).nullish(),
  expenseNature: z.enum(EXPENSE_NATURES).nullish(),
  essential: z.boolean().nullish(),
  installments: z.coerce.number().int().min(1).max(120).optional(),
});

export type CreateTransactionInput = z.input<typeof createSchema>;

const HISTORY_FIELDS = [
  "kind",
  "status",
  "amountCents",
  "date",
  "description",
  "notes",
  "categoryId",
  "accountId",
  "toAccountId",
  "cardId",
  "invoiceId",
  "incomeType",
  "expenseNature",
  "essential",
] as const;

function resolveStatus(kind: TxKind, requested: TxStatus | undefined, date: string, today: string, card: boolean): TxStatus {
  if (requested === "estimated") {
    if (kind !== "income" && kind !== "expense") throw new ValidationError("Apenas receitas e despesas podem ser estimadas");
    if (card) throw new ValidationError("Compras no cartão não podem ser estimadas");
    return "estimated";
  }
  if (requested === "realized" && date > today) {
    throw new ValidationError("Um lançamento realizado não pode ter data futura. Use 'previsto'.", { date: "Data futura" });
  }
  if (requested) return requested;
  return date > today ? "scheduled" : "realized";
}

async function validateRefs(db: DbExecutor, userId: string, data: { kind: TxKind; categoryId?: string | null; accountId?: string | null; toAccountId?: string | null; cardId?: string | null }) {
  await assertOwned(db, s.accounts, userId, [data.accountId, data.toAccountId], "Conta");
  await assertOwned(db, s.creditCards, userId, [data.cardId], "Cartão");
  let category: typeof s.categories.$inferSelect | undefined;
  if (data.categoryId) {
    if (data.kind === "transfer") throw new ValidationError("Transferências não têm categoria");
    [category] = await db
      .select()
      .from(s.categories)
      .where(and(eq(s.categories.id, data.categoryId), eq(s.categories.userId, userId)))
      .limit(1);
    if (!category) throw new NotFoundError("Categoria não encontrada");
    const expected = data.kind === "income" ? "income" : "expense";
    if (category.kind !== expected) {
      throw new ValidationError(expected === "income" ? "Use uma categoria de receita" : "Use uma categoria de despesa", { categoryId: "Tipo de categoria incompatível" });
    }
  }
  return category;
}

function shape(data: { kind: TxKind; status: TxStatus; amountCents: number; date: string; accountId?: string | null; toAccountId?: string | null; cardId?: string | null }) {
  try {
    validateLedgerTx({ ...data, accountId: data.accountId ?? null, toAccountId: data.toAccountId ?? null, cardId: data.cardId ?? null });
  } catch (e) {
    if (e instanceof LedgerError) throw new ValidationError(e.message);
    throw e;
  }
}

/**
 * Recorrência que este lançamento realiza (ex.: a conta de luz prevista para o dia 5 lançada
 * no dia 6). Ligar evita que a ocorrência continue prevista e seja contada de novo na projeção.
 */
async function recurrenceFor(db: DbExecutor, userId: string, data: { kind: TxKind; amountCents: number; date: ISODate; description: string; accountId?: string | null; cardId?: string | null }) {
  if (data.kind !== "income" && data.kind !== "expense") return null;
  const rules = (await db.select().from(s.recurrences).where(and(eq(s.recurrences.userId, userId), eq(s.recurrences.active, true), eq(s.recurrences.kind, data.kind)))).filter((r) =>
    data.cardId ? r.cardId === data.cardId : r.accountId === (data.accountId ?? null) && !r.cardId,
  );
  if (rules.length === 0) return null;
  const done = new Set(
    (await db.select({ recurrenceId: s.transactions.recurrenceId, occurrenceDate: s.transactions.occurrenceDate }).from(s.transactions).where(inArray(s.transactions.recurrenceId, rules.map((r) => r.id)))).map((m) => `${m.recurrenceId}|${m.occurrenceDate}`),
  );
  const occurrences = rules.flatMap((r) =>
    expandOccurrences({ startDate: r.startDate, frequency: r.frequency as Frequency, interval: r.interval, dayOfMonth: r.dayOfMonth, endDate: r.endDate, count: r.count }, addDays(data.date, -7), addDays(data.date, 7))
      .filter((date) => !done.has(`${r.id}|${date}`))
      .map((date) => ({ recurrenceId: r.id, date, amountCents: r.amountCents, kind: r.kind as "income" | "expense", accountId: r.accountId, cardId: r.cardId, description: r.description, certainty: r.certainty as "scheduled" | "estimated" })),
  );
  const signed = data.kind === "income" ? data.amountCents : -data.amountCents;
  const hit = matchOccurrences([{ index: 0, date: data.date, amountCents: signed, kind: data.kind, description: data.description, accountId: data.accountId ?? null, cardId: data.cardId ?? null }], occurrences).get(0);
  return hit ? { recurrenceId: hit.recurrenceId, occurrenceDate: hit.date } : null;
}

async function recordHistory(db: DbExecutor, userId: string, transactionId: string, action: "create" | "update" | "delete" | "confirm", changes: Record<string, { from: unknown; to: unknown }>, actor: string) {
  await db.insert(s.transactionHistory).values({ transactionId, userId, action, changes, actorUserId: actor });
}

export async function createTransaction(ctx: ServiceContext, input: CreateTransactionInput): Promise<TxRow[]> {
  const data = parse(createSchema, input);
  const card = !!data.cardId;
  const status = resolveStatus(data.kind, data.status, data.date, ctx.today, card);
  const installments = data.installments ?? 1;
  if (installments > 1 && data.kind !== "expense") throw new ValidationError("Só despesas podem ser parceladas");
  if (installments > 1 && status === "estimated") throw new ValidationError("Parcelamentos não podem ser estimados");
  shape({ ...data, status });

  return ctx.db.transaction(async (tx) => {
    const category = await validateRefs(tx, ctx.userId, data);
    const essential = data.essential ?? (data.kind === "expense" ? (category?.essential ?? false) : null);
    let cardRow: typeof s.creditCards.$inferSelect | undefined;
    if (data.cardId) {
      [cardRow] = await tx.select().from(s.creditCards).where(eq(s.creditCards.id, data.cardId)).limit(1);
    }
    const base = {
      userId: ctx.userId,
      kind: data.kind,
      description: data.description,
      notes: data.notes ?? null,
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      toAccountId: data.toAccountId ?? null,
      cardId: data.cardId ?? null,
      incomeType: data.kind === "income" ? (data.incomeType ?? null) : null,
      expenseNature: data.kind === "expense" ? (data.expenseNature ?? null) : null,
      essential,
      source: "manual" as const,
    };

    const created: TxRow[] = [];
    if (installments === 1) {
      let invoiceId: string | null = null;
      if (cardRow) invoiceId = await ensureInvoice(tx, ctx.userId, cardRow.id, invoiceForPurchase(data.date, cycleOf(cardRow)));
      const occurrence = status === "estimated" ? null : await recurrenceFor(tx, ctx.userId, data);
      const [row] = await tx.insert(s.transactions).values({ ...base, status, amountCents: data.amountCents, date: data.date, invoiceId, ...(occurrence ?? {}) }).returning();
      created.push(row!);
    } else {
      const schedule = buildInstallmentSchedule({
        totalCents: data.amountCents,
        count: installments,
        firstDate: data.date,
        cycle: cardRow ? cycleOf(cardRow) : undefined,
      });
      const [plan] = await tx
        .insert(s.installmentPlans)
        .values({
          userId: ctx.userId,
          description: data.description,
          totalCents: data.amountCents,
          count: installments,
          firstDate: data.date,
          cardId: base.cardId,
          accountId: base.accountId,
          categoryId: base.categoryId,
        })
        .returning({ id: s.installmentPlans.id });
      for (const item of schedule) {
        const invoiceId = cardRow && item.invoice ? await ensureInvoice(tx, ctx.userId, cardRow.id, item.invoice) : null;
        // No cartão, a compra aconteceu na data inicial: as parcelas futuras são compromissos confirmados.
        const itemStatus: TxStatus = item.date <= ctx.today ? (status === "scheduled" ? "scheduled" : "realized") : "scheduled";
        const [row] = await tx
          .insert(s.transactions)
          .values({
            ...base,
            description: `${data.description} (${item.number}/${item.of})`,
            status: itemStatus,
            amountCents: item.amountCents,
            date: item.date,
            invoiceId,
            installmentPlanId: plan!.id,
            installmentNumber: item.number,
            installmentCount: item.of,
          })
          .returning();
        created.push(row!);
      }
    }
    for (const row of created) {
      await recordHistory(tx, ctx.userId, row.id, "create", {}, ctx.userId);
    }
    return created;
  });
}

const updateSchema = createSchema.omit({ kind: true, installments: true }).partial();

export async function getTransaction(ctx: ServiceContext, id: string): Promise<TxRow> {
  const [row] = await ctx.db
    .select()
    .from(s.transactions)
    .where(and(eq(s.transactions.id, id), eq(s.transactions.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Movimentação não encontrada");
  return row;
}

export async function updateTransaction(ctx: ServiceContext, id: string, input: z.input<typeof updateSchema>): Promise<TxRow> {
  const current = await getTransaction(ctx, id);
  const data = parse(updateSchema, input);
  if (current.kind === "card_payment" && (data.cardId !== undefined || data.categoryId)) {
    throw new ValidationError("Pagamentos de fatura só permitem alterar valor, data, conta e situação");
  }
  const merged = {
    kind: current.kind as TxKind,
    amountCents: data.amountCents ?? current.amountCents,
    date: data.date ?? current.date,
    description: data.description ?? current.description,
    notes: data.notes === undefined ? current.notes : data.notes,
    categoryId: data.categoryId === undefined ? current.categoryId : data.categoryId,
    accountId: data.accountId === undefined ? current.accountId : data.accountId,
    toAccountId: data.toAccountId === undefined ? current.toAccountId : data.toAccountId,
    cardId: data.cardId === undefined ? current.cardId : data.cardId,
    incomeType: data.incomeType === undefined ? current.incomeType : data.incomeType,
    expenseNature: data.expenseNature === undefined ? current.expenseNature : data.expenseNature,
    essential: data.essential === undefined ? current.essential : data.essential,
  };
  const status =
    current.kind === "card_payment"
      ? (data.status ?? (merged.date > ctx.today ? "scheduled" : (current.status as TxStatus)))
      : resolveStatus(
          merged.kind,
          (data.status ?? (current.status === "realized" && merged.date > ctx.today ? "scheduled" : current.status)) as TxStatus,
          merged.date,
          ctx.today,
          !!merged.cardId,
        );
  if (status === "realized" && merged.date > ctx.today) throw new ValidationError("Um lançamento realizado não pode ter data futura");
  shape({ ...merged, status });

  return ctx.db.transaction(async (tx) => {
    if (current.kind !== "card_payment") await validateRefs(tx, ctx.userId, merged);
    else await assertOwned(tx, s.accounts, ctx.userId, [merged.accountId], "Conta");
    let invoiceId = current.invoiceId;
    if (current.kind !== "card_payment") {
      if (merged.cardId && (merged.cardId !== current.cardId || merged.date !== current.date || !invoiceId)) {
        const [card] = await tx.select().from(s.creditCards).where(eq(s.creditCards.id, merged.cardId)).limit(1);
        invoiceId = await ensureInvoice(tx, ctx.userId, card!.id, invoiceForPurchase(merged.date, cycleOf(card!)));
      } else if (!merged.cardId) invoiceId = null;
    }
    const next = { ...merged, status, invoiceId };
    const changes = diffFields(current as unknown as Record<string, unknown>, next, HISTORY_FIELDS);
    const [row] = await tx
      .update(s.transactions)
      .set(next)
      .where(and(eq(s.transactions.id, id), eq(s.transactions.userId, ctx.userId)))
      .returning();
    if (Object.keys(changes).length > 0) await recordHistory(tx, ctx.userId, id, "update", changes, ctx.userId);
    return row!;
  });
}

/** Confirma um lançamento previsto/estimado (ex.: a comissão caiu na conta). */
export async function confirmTransaction(ctx: ServiceContext, id: string, input: { amountCents?: number; date?: string } = {}): Promise<TxRow> {
  const current = await getTransaction(ctx, id);
  if (current.status === "realized") return current;
  const date = input.date ?? (current.date > ctx.today ? ctx.today : current.date);
  return updateTransaction(ctx, id, { status: "realized", date, amountCents: input.amountCents ?? current.amountCents });
}

export async function deleteTransaction(ctx: ServiceContext, id: string, scope: "single" | "plan" = "single"): Promise<number> {
  const current = await getTransaction(ctx, id);
  return ctx.db.transaction(async (tx) => {
    const targets =
      scope === "plan" && current.installmentPlanId
        ? await tx
            .select()
            .from(s.transactions)
            .where(and(eq(s.transactions.installmentPlanId, current.installmentPlanId), eq(s.transactions.userId, ctx.userId)))
        : [current];
    for (const t of targets) {
      const snapshot = Object.fromEntries(HISTORY_FIELDS.map((f) => [f, { from: (t as Record<string, unknown>)[f] ?? null, to: null }]));
      await recordHistory(tx, ctx.userId, t.id, "delete", snapshot, ctx.userId);
    }
    if (scope === "plan" && current.installmentPlanId) {
      await tx.delete(s.installmentPlans).where(and(eq(s.installmentPlans.id, current.installmentPlanId), eq(s.installmentPlans.userId, ctx.userId)));
    } else {
      await tx.delete(s.transactions).where(and(eq(s.transactions.id, id), eq(s.transactions.userId, ctx.userId)));
    }
    return targets.length;
  });
}

export async function transactionHistory(ctx: ServiceContext, id: string) {
  return ctx.db
    .select()
    .from(s.transactionHistory)
    .where(and(eq(s.transactionHistory.transactionId, id), eq(s.transactionHistory.userId, ctx.userId)))
    .orderBy(asc(s.transactionHistory.createdAt));
}

export interface TransactionFilters {
  month?: string;
  from?: string;
  to?: string;
  accountId?: string;
  cardId?: string;
  categoryId?: string | "none";
  kind?: TxKind;
  status?: TxStatus;
  source?: "manual" | "import" | "connector" | "demo";
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listTransactions(ctx: ServiceContext, f: TransactionFilters = {}): Promise<TxRow[]> {
  const conds: SQL[] = [eq(s.transactions.userId, ctx.userId)];
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    conds.push(gte(s.transactions.date, startOfMonth(f.month)), lte(s.transactions.date, endOfMonth(f.month)));
  }
  if (f.from) conds.push(gte(s.transactions.date, f.from));
  if (f.to) conds.push(lte(s.transactions.date, f.to));
  if (f.accountId) conds.push(or(eq(s.transactions.accountId, f.accountId), eq(s.transactions.toAccountId, f.accountId))!);
  if (f.cardId) conds.push(eq(s.transactions.cardId, f.cardId));
  if (f.categoryId === "none") conds.push(isNull(s.transactions.categoryId));
  else if (f.categoryId) {
    // Categoria principal inclui as subcategorias.
    const children = ctx.db
      .select({ id: s.categories.id })
      .from(s.categories)
      .where(and(eq(s.categories.userId, ctx.userId), eq(s.categories.parentId, f.categoryId)));
    conds.push(or(eq(s.transactions.categoryId, f.categoryId), inArray(s.transactions.categoryId, children))!);
  }
  if (f.kind) conds.push(eq(s.transactions.kind, f.kind));
  if (f.status) conds.push(eq(s.transactions.status, f.status));
  if (f.source) conds.push(eq(s.transactions.source, f.source));
  if (f.search?.trim()) {
    const term = f.search.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`);
    conds.push(ilike(s.transactions.description, `%${term}%`));
  }
  return ctx.db
    .select()
    .from(s.transactions)
    .where(and(...conds))
    .orderBy(desc(s.transactions.date), desc(s.transactions.createdAt))
    .limit(Math.min(f.limit ?? 300, 1000))
    .offset(f.offset ?? 0);
}
