import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { invoiceForPurchase } from "@/domain/credit-card";
import { dateWithClampedDay, parts, type ISODate } from "@/domain/dates";
import { LedgerError, validateLedgerTx } from "@/domain/ledger";
import { expandOccurrences, RecurrenceError, validateRule, type Frequency } from "@/domain/recurrence";
import * as s from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { ServiceContext } from "./context";
import { assertOwned, centsPositive, isoDate, isUniqueViolation, optionalUuid, parse } from "./common";
import { cycleOf, ensureInvoice } from "./cards";
import { getBriefing } from "./briefing";
import { EXPENSE_NATURES, INCOME_TYPES } from "./transactions";

export type RecurrenceRow = typeof s.recurrences.$inferSelect;

const schema = z.object({
  kind: z.enum(["income", "expense", "transfer"]),
  certainty: z.enum(["scheduled", "estimated"]).default("scheduled"),
  amountCents: centsPositive,
  description: z.string().trim().min(1, "Informe uma descrição").max(140),
  categoryId: optionalUuid,
  accountId: optionalUuid,
  toAccountId: optionalUuid,
  cardId: optionalUuid,
  frequency: z.enum(["weekly", "biweekly", "monthly", "yearly"]),
  interval: z.coerce.number().int().min(1).max(60).default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
  startDate: isoDate,
  endDate: isoDate.nullish(),
  count: z.coerce.number().int().min(1).max(1200).nullish(),
  incomeType: z.enum(INCOME_TYPES).nullish(),
  expenseNature: z.enum(EXPENSE_NATURES).nullish(),
  essential: z.boolean().optional(),
});

function validate(data: z.output<typeof schema>) {
  try {
    validateRule({ ...data, frequency: data.frequency as Frequency });
    validateLedgerTx({ kind: data.kind, status: "scheduled", amountCents: data.amountCents, date: data.startDate, accountId: data.accountId, toAccountId: data.toAccountId, cardId: data.cardId });
  } catch (e) {
    if (e instanceof RecurrenceError || e instanceof LedgerError) throw new ValidationError(e.message);
    throw e;
  }
  if (data.cardId && data.certainty === "estimated") throw new ValidationError("Recorrências no cartão não podem ser estimadas");
}

export async function getRecurrence(ctx: ServiceContext, id: string): Promise<RecurrenceRow> {
  const [row] = await ctx.db
    .select()
    .from(s.recurrences)
    .where(and(eq(s.recurrences.id, id), eq(s.recurrences.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Recorrência não encontrada");
  return row;
}

export async function listRecurrences(ctx: ServiceContext, opts: { activeOnly?: boolean } = {}): Promise<RecurrenceRow[]> {
  const conds = [eq(s.recurrences.userId, ctx.userId)];
  if (opts.activeOnly) conds.push(eq(s.recurrences.active, true));
  return ctx.db
    .select()
    .from(s.recurrences)
    .where(and(...conds))
    .orderBy(desc(s.recurrences.createdAt));
}

async function checkRefs(ctx: ServiceContext, data: { kind: string; categoryId?: string | null; accountId?: string | null; toAccountId?: string | null; cardId?: string | null }) {
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.accountId, data.toAccountId], "Conta");
  await assertOwned(ctx.db, s.creditCards, ctx.userId, [data.cardId], "Cartão");
  if (data.categoryId) {
    const [cat] = await ctx.db
      .select()
      .from(s.categories)
      .where(and(eq(s.categories.id, data.categoryId), eq(s.categories.userId, ctx.userId)))
      .limit(1);
    if (!cat) throw new NotFoundError("Categoria não encontrada");
    if (data.kind === "transfer") throw new ValidationError("Transferências não têm categoria");
    if (cat.kind !== (data.kind === "income" ? "income" : "expense")) throw new ValidationError("Tipo de categoria incompatível");
    return cat;
  }
  return null;
}

export async function createRecurrence(ctx: ServiceContext, input: z.input<typeof schema>): Promise<RecurrenceRow> {
  const data = parse(schema, input);
  validate(data);
  const cat = await checkRefs(ctx, data);
  const [row] = await ctx.db
    .insert(s.recurrences)
    .values({
      ...data,
      userId: ctx.userId,
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      toAccountId: data.toAccountId ?? null,
      cardId: data.cardId ?? null,
      dayOfMonth: data.dayOfMonth ?? null,
      endDate: data.endDate ?? null,
      count: data.count ?? null,
      incomeType: data.kind === "income" ? (data.incomeType ?? null) : null,
      expenseNature: data.kind === "expense" ? (data.expenseNature ?? "fixed") : null,
      essential: data.essential ?? cat?.essential ?? false,
    })
    .returning();
  return row!;
}

export async function updateRecurrence(ctx: ServiceContext, id: string, input: Partial<z.input<typeof schema>>): Promise<RecurrenceRow> {
  const current = await getRecurrence(ctx, id);
  const data = parse(schema, { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) });
  validate(data);
  await checkRefs(ctx, data);
  const [row] = await ctx.db
    .update(s.recurrences)
    .set({ ...data, essential: data.essential ?? current.essential })
    .where(and(eq(s.recurrences.id, id), eq(s.recurrences.userId, ctx.userId)))
    .returning();
  return row!;
}

export async function setRecurrenceActive(ctx: ServiceContext, id: string, active: boolean): Promise<void> {
  await getRecurrence(ctx, id);
  await ctx.db
    .update(s.recurrences)
    .set({ active })
    .where(and(eq(s.recurrences.id, id), eq(s.recurrences.userId, ctx.userId)));
}

export async function deleteRecurrence(ctx: ServiceContext, id: string): Promise<void> {
  await getRecurrence(ctx, id);
  // Lançamentos já materializados permanecem (recurrence_id vira nulo).
  await ctx.db.delete(s.recurrences).where(and(eq(s.recurrences.id, id), eq(s.recurrences.userId, ctx.userId)));
}

export interface Occurrence {
  recurrence: RecurrenceRow;
  date: ISODate;
  amountCents: number;
  certainty: "scheduled" | "estimated";
}

/** Ocorrências virtuais ainda não materializadas em lançamentos, num intervalo. */
export async function pendingOccurrences(ctx: ServiceContext, from: ISODate, to: ISODate, recurrences?: RecurrenceRow[]): Promise<Occurrence[]> {
  const rules = recurrences ?? (await listRecurrences(ctx, { activeOnly: true }));
  if (rules.length === 0) return [];
  const materialized = await ctx.db
    .select({ recurrenceId: s.transactions.recurrenceId, occurrenceDate: s.transactions.occurrenceDate })
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), isNotNull(s.transactions.recurrenceId)));
  const done = new Set(materialized.map((m) => `${m.recurrenceId}|${m.occurrenceDate}`));
  const result: Occurrence[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    const dates = expandOccurrences(
      { startDate: r.startDate, frequency: r.frequency as Frequency, interval: r.interval, dayOfMonth: r.dayOfMonth, endDate: r.endDate, count: r.count },
      from,
      to,
    );
    for (const date of dates) {
      if (done.has(`${r.id}|${date}`)) continue;
      result.push({ recurrence: r, date, amountCents: r.amountCents, certainty: r.certainty as "scheduled" | "estimated" });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Materializa uma ocorrência em lançamento (ex.: "paguei a conta de luz"). O índice único
 * (recurrence_id, occurrence_date) impede gerar a mesma ocorrência duas vezes.
 */
export async function materializeOccurrence(
  ctx: ServiceContext,
  recurrenceId: string,
  occurrenceDate: ISODate,
  overrides: { amountCents?: number; date?: ISODate; status?: "realized" | "scheduled" } = {},
): Promise<string> {
  const r = await getRecurrence(ctx, recurrenceId);
  parse(isoDate, occurrenceDate);
  const valid = expandOccurrences(
    { startDate: r.startDate, frequency: r.frequency as Frequency, interval: r.interval, dayOfMonth: r.dayOfMonth, endDate: r.endDate, count: r.count },
    occurrenceDate,
    occurrenceDate,
  );
  if (valid.length === 0) throw new ValidationError("Esta data não é uma ocorrência da recorrência");
  const date = overrides.date ?? occurrenceDate;
  const status = overrides.status ?? (date <= ctx.today ? "realized" : "scheduled");
  if (status === "realized" && date > ctx.today) throw new ValidationError("Um lançamento realizado não pode ter data futura");
  const amount = overrides.amountCents ?? r.amountCents;
  parse(centsPositive, amount);
  return ctx.db.transaction(async (tx) => {
    let invoiceId: string | null = null;
    if (r.cardId) {
      const [card] = await tx.select().from(s.creditCards).where(eq(s.creditCards.id, r.cardId)).limit(1);
      if (!card) throw new NotFoundError("Cartão não encontrado");
      invoiceId = await ensureInvoice(tx, ctx.userId, card.id, invoiceForPurchase(date, cycleOf(card)));
    }
    try {
      const [row] = await tx
        .insert(s.transactions)
        .values({
          userId: ctx.userId,
          kind: r.kind,
          status,
          amountCents: amount,
          date,
          description: r.description,
          categoryId: r.categoryId,
          accountId: r.accountId,
          toAccountId: r.toAccountId,
          cardId: r.cardId,
          invoiceId,
          recurrenceId: r.id,
          occurrenceDate,
          incomeType: r.incomeType,
          expenseNature: r.expenseNature,
          essential: r.kind === "expense" ? r.essential : null,
        })
        .returning({ id: s.transactions.id });
      await tx.insert(s.transactionHistory).values({ transactionId: row!.id, userId: ctx.userId, action: "create", actorUserId: ctx.userId, changes: {} });
      return row!.id;
    } catch (e) {
      if (isUniqueViolation(e, "transactions_recurrence_occurrence_unique")) {
        throw new ConflictError("Esta ocorrência já foi registrada");
      }
      throw e;
    }
  });
}

export interface IncomeSuggestion {
  kind: "fixed" | "mixed" | "variable";
  salary: { amountCents: number; day: number | null } | null;
  variable: { amountCents: number; day: number | null } | null;
}

/** Próxima data com o dia do mês pedido, a partir de hoje (ajusta meses curtos). */
export function nextDayOfMonth(today: ISODate, day: number): ISODate {
  const { year, month } = parts(today);
  const candidate = dateWithClampedDay(year, month, day);
  return candidate >= today ? candidate : dateWithClampedDay(year, month + 1, day);
}

/**
 * Renda declarada no briefing que ainda não virou recorrência: salário (confirmado) e
 * parte variável (estimada). Some quando já existe alguma recorrência de renda ativa.
 */
export async function incomeSuggestion(ctx: ServiceContext): Promise<IncomeSuggestion | null> {
  const [active] = await ctx.db
    .select({ id: s.recurrences.id })
    .from(s.recurrences)
    .where(and(eq(s.recurrences.userId, ctx.userId), eq(s.recurrences.kind, "income"), eq(s.recurrences.active, true)))
    .limit(1);
  if (active) return null;
  const { answers } = await getBriefing(ctx);
  const f = answers.financial ?? {};
  const kind = f.incomeType ?? answers.personal?.incomeType ?? null;
  if (!kind) return null;
  const salaryCents = kind === "mixed" ? f.fixedIncomeCents : kind === "fixed" ? f.monthlyNetIncomeCents : null;
  const salary = salaryCents ? { amountCents: salaryCents, day: f.fixedIncomeDay ?? null } : null;
  const variable = kind !== "fixed" && f.commissionAvgCents ? { amountCents: f.commissionAvgCents, day: f.commissionDay ?? null } : null;
  return salary || variable ? { kind, salary, variable } : null;
}

/** Cria as recorrências sugeridas na conta escolhida; a parte variável entra como estimativa. */
export async function createIncomeRecurrences(ctx: ServiceContext, accountId: string): Promise<number> {
  const suggestion = await incomeSuggestion(ctx);
  if (!suggestion) throw new ValidationError("Não há renda do briefing para cadastrar (ou ela já está nas recorrências)");
  const categories = await ctx.db
    .select({ id: s.categories.id, name: s.categories.name })
    .from(s.categories)
    .where(and(eq(s.categories.userId, ctx.userId), eq(s.categories.kind, "income")));
  const category = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
  let created = 0;
  if (suggestion.salary) {
    const day = suggestion.salary.day ?? 5;
    await createRecurrence(ctx, {
      kind: "income",
      certainty: "scheduled",
      amountCents: suggestion.salary.amountCents,
      description: "Salário",
      categoryId: category("Salário"),
      accountId,
      frequency: "monthly",
      dayOfMonth: day,
      startDate: nextDayOfMonth(ctx.today, day),
      incomeType: "salary",
    });
    created++;
  }
  if (suggestion.variable) {
    const day = suggestion.variable.day ?? suggestion.salary?.day ?? 20;
    const commission = suggestion.kind === "mixed";
    await createRecurrence(ctx, {
      kind: "income",
      certainty: "estimated",
      amountCents: suggestion.variable.amountCents,
      description: commission ? "Comissão (média estimada)" : "Renda variável (média estimada)",
      categoryId: category(commission ? "Comissões" : "Renda variável"),
      accountId,
      frequency: "monthly",
      dayOfMonth: day,
      startDate: nextDayOfMonth(ctx.today, day),
      incomeType: commission ? "commission" : "variable",
    });
    created++;
  }
  return created;
}
