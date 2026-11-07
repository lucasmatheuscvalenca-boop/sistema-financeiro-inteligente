import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { centsPositive, existingId, optionalUuid, parse } from "./common";
import type { ServiceContext } from "./context";
import { essentialFromCategory, getTransaction } from "./transactions";

// ─── Etiquetas ───────────────────────────────────────────────────────────────

/** "Viagem Natal, presentes" → ["viagem natal", "presentes"]: minúsculas, sem repetir, até 5. */
export function normalizeTags(input: string | readonly string[]): string[] {
  const list = typeof input === "string" ? input.split(/[,;\n]/) : input;
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 5);
}

export async function setTransactionTags(ctx: ServiceContext, transactionId: string, input: string): Promise<string[]> {
  existingId(transactionId, "Movimentação não encontrada");
  const tags = normalizeTags(input);
  const rows = await ctx.db
    .update(s.transactions)
    .set({ tags })
    .where(and(eq(s.transactions.id, transactionId), eq(s.transactions.userId, ctx.userId)))
    .returning({ id: s.transactions.id });
  if (!rows.length) throw new NotFoundError("Movimentação não encontrada");
  return tags;
}

/** Etiquetas em uso, com o total de despesas (menos estornos) e quantos lançamentos cada uma tem. */
export async function listTags(ctx: ServiceContext): Promise<Array<{ tag: string; expenseCents: number; count: number }>> {
  const rows = await ctx.db.execute<{ tag: string; expense_cents: string | number; count: string | number }>(sql`
    select tag,
           coalesce(sum(case when ${s.transactions.kind} = 'expense' then ${s.transactions.amountCents}
                             when ${s.transactions.kind} = 'refund' then -${s.transactions.amountCents} else 0 end), 0) as expense_cents,
           count(*) as count
    from ${s.transactions}, unnest(${s.transactions.tags}) as tag
    where ${s.transactions.userId} = ${ctx.userId} and ${s.transactions.status} = 'realized'
    group by tag
    order by max(${s.transactions.date}) desc
    limit 50`);
  return rows.rows.map((r) => ({ tag: r.tag, expenseCents: Number(r.expense_cents), count: Number(r.count) }));
}

// ─── Dividir um lançamento ───────────────────────────────────────────────────

const splitSchema = z.object({
  parts: z
    .array(z.object({ amountCents: centsPositive, categoryId: optionalUuid }))
    .min(2, "Divida em pelo menos duas partes")
    .max(6, "Até seis partes"),
});

/**
 * Divide uma despesa ou receita em partes com categorias diferentes (ex.: mercado com R$ 200 de
 * comida e R$ 80 de limpeza). A primeira parte fica no lançamento original (que continua ligado
 * ao banco ou ao extrato); as outras viram lançamentos novos na mesma conta, data e fatura. A soma
 * das partes é exatamente o valor original: saldos e faturas não mudam.
 */
export async function splitTransaction(ctx: ServiceContext, transactionId: string, input: z.input<typeof splitSchema>): Promise<string[]> {
  const { parts } = parse(splitSchema, input);
  const original = await getTransaction(ctx, transactionId);
  if (original.kind !== "expense" && original.kind !== "income") throw new ValidationError("Só despesas e receitas podem ser divididas.");
  if ((original.installmentCount ?? 1) > 1) throw new ValidationError("Parcelas de uma compra parcelada não podem ser divididas.");
  const total = parts.reduce((t, p) => t + p.amountCents, 0);
  if (total !== original.amountCents) throw new ValidationError("A soma das partes precisa ser igual ao valor do lançamento.", { parts: "A soma das partes precisa ser igual ao valor" });
  const categoryIds = [...new Set(parts.map((p) => p.categoryId).filter((c): c is string => !!c))];
  const categories = categoryIds.length
    ? await ctx.db.select().from(s.categories).where(and(eq(s.categories.userId, ctx.userId), inArray(s.categories.id, categoryIds)))
    : [];
  if (categories.length !== categoryIds.length || categories.some((c) => c.kind !== original.kind)) throw new ValidationError("Categoria inválida para este lançamento.");
  const byId = new Map(categories.map((c) => [c.id, c]));
  return ctx.db.transaction(async (tx) => {
    const [first, ...rest] = parts;
    await tx
      .update(s.transactions)
      .set({ amountCents: first!.amountCents, categoryId: first!.categoryId ?? null, categoryAuto: false, essential: essentialFromCategory(original.kind, first!.categoryId ? byId.get(first!.categoryId) : null), updatedAt: new Date() })
      .where(eq(s.transactions.id, original.id));
    await tx.insert(s.transactionHistory).values({
      transactionId: original.id,
      userId: ctx.userId,
      action: "update",
      changes: { amountCents: { from: original.amountCents, to: first!.amountCents }, split: { from: null, to: parts.length } },
      actorUserId: ctx.userId,
    });
    const created = await tx
      .insert(s.transactions)
      .values(
        rest.map((p) => ({
          userId: ctx.userId,
          kind: original.kind,
          status: original.status,
          amountCents: p.amountCents,
          date: original.date,
          description: original.description,
          notes: original.notes,
          categoryId: p.categoryId ?? null,
          categoryAuto: false,
          accountId: original.accountId,
          cardId: original.cardId,
          invoiceId: original.invoiceId,
          incomeType: original.incomeType,
          expenseNature: original.expenseNature,
          essential: essentialFromCategory(original.kind, p.categoryId ? byId.get(p.categoryId) : null),
          ownership: original.ownership,
          tags: original.tags,
          source: "manual",
          splitFromId: original.id,
        })),
      )
      .returning({ id: s.transactions.id });
    for (const c of created) {
      await tx.insert(s.transactionHistory).values({ transactionId: c.id, userId: ctx.userId, action: "create", changes: { splitFrom: { from: null, to: original.id } }, actorUserId: ctx.userId });
    }
    return [original.id, ...created.map((c) => c.id)];
  });
}

// ─── Decisões do "Posso gastar?" ─────────────────────────────────────────────

const decisionSchema = z.object({
  amountCents: centsPositive,
  description: z.string().trim().min(1).max(140),
  level: z.enum(["green", "yellow", "red", "gray"]),
  maxSafeCents: z.number().int().nullable(),
  decision: z.enum(["bought", "waited", "gave_up"]),
});

export async function recordSpendDecision(ctx: ServiceContext, input: z.input<typeof decisionSchema>): Promise<void> {
  const d = parse(decisionSchema, input);
  await ctx.db.insert(s.spendDecisions).values({ userId: ctx.userId, ...d });
}

export async function spendDecisionHistory(ctx: ServiceContext) {
  const yearStart = new Date(`${ctx.today.slice(0, 4)}-01-01T00:00:00Z`);
  const [recent, year] = await Promise.all([
    ctx.db.select().from(s.spendDecisions).where(eq(s.spendDecisions.userId, ctx.userId)).orderBy(desc(s.spendDecisions.createdAt)).limit(12),
    ctx.db.select({ decision: s.spendDecisions.decision, amountCents: s.spendDecisions.amountCents }).from(s.spendDecisions).where(and(eq(s.spendDecisions.userId, ctx.userId), gte(s.spendDecisions.createdAt, yearStart))),
  ]);
  const gaveUp = year.filter((r) => r.decision === "gave_up");
  return { recent, gaveUpCents: gaveUp.reduce((t, r) => t + r.amountCents, 0), gaveUpCount: gaveUp.length, decisionsThisYear: year.length };
}
