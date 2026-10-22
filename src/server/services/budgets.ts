import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { evaluateBudget, simulateBudgetAdjustments, type BudgetAdjustment, type BudgetEvaluation } from "@/domain/budget";
import { addMonthsToKey, assertMonthKey, endOfMonth, startOfMonth, type MonthKey } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { listCategories, type CategoryRow } from "./categories";
import type { ServiceContext } from "./context";
import { parse, uuidSchema } from "./common";
import { loadTransactions } from "./ledger";

const monthSchema = z.string().refine((m) => {
  try {
    assertMonthKey(m);
    return true;
  } catch {
    return false;
  }
}, "Mês inválido");

/** Gasto por categoria somando subcategorias na categoria-mãe. Também devolve o gasto da própria subcategoria. */
export function rollupSpending(spent: ReadonlyMap<string, Cents>, categories: readonly CategoryRow[]): Map<string, Cents> {
  const parentOf = new Map(categories.filter((c) => c.parentId).map((c) => [c.id, c.parentId!]));
  const result = new Map<string, Cents>();
  for (const [catId, amount] of spent) {
    result.set(catId, (result.get(catId) ?? 0) + amount);
    const parent = parentOf.get(catId);
    if (parent) result.set(parent, (result.get(parent) ?? 0) + amount);
  }
  return result;
}

export async function spendingByCategory(ctx: ServiceContext, month: MonthKey): Promise<{ realized: Map<string, Cents>; scheduled: Map<string, Cents> }> {
  const txs = await loadTransactions(ctx, { from: startOfMonth(month), to: endOfMonth(month) });
  const realized = new Map<string, Cents>();
  const scheduled = new Map<string, Cents>();
  for (const t of txs) {
    if (t.kind !== "expense" && t.kind !== "refund") continue;
    if (t.status === "estimated") continue;
    const target = t.status === "realized" ? realized : scheduled;
    const key = t.categoryId ?? "__sem_categoria__";
    target.set(key, (target.get(key) ?? 0) + (t.kind === "expense" ? t.amountCents : -t.amountCents));
  }
  return { realized, scheduled };
}

export type BudgetRow = typeof s.budgets.$inferSelect;

export async function listBudgets(ctx: ServiceContext, month: MonthKey): Promise<BudgetRow[]> {
  return ctx.db
    .select()
    .from(s.budgets)
    .where(and(eq(s.budgets.userId, ctx.userId), eq(s.budgets.month, month)));
}

export async function getBudgetEvaluation(ctx: ServiceContext, month: MonthKey): Promise<BudgetEvaluation & { budgets: BudgetRow[] }> {
  parse(monthSchema, month);
  const [budgets, categories, spending] = await Promise.all([listBudgets(ctx, month), listCategories(ctx, { includeArchived: true }), spendingByCategory(ctx, month)]);
  const names = new Map(categories.map((c) => [c.id, c.parentId ? `${categories.find((p) => p.id === c.parentId)?.name ?? ""} › ${c.name}` : c.name]));
  const realized = rollupSpending(spending.realized, categories);
  const scheduled = rollupSpending(spending.scheduled, categories);
  // Para "sem orçamento", usa o gasto somente das categorias de nível superior (evita contar duas vezes).
  const topLevelRealized = new Map<string, Cents>();
  for (const [id, v] of realized) {
    const cat = categories.find((c) => c.id === id);
    if (!cat || !cat.parentId) topLevelRealized.set(id, v);
  }
  const evaluation = evaluateBudget({
    month,
    today: ctx.today,
    lines: budgets.map((b) => ({ categoryId: b.categoryId, categoryName: names.get(b.categoryId) ?? "Categoria", limitCents: b.limitCents, alertThresholdPct: b.alertThresholdPct })),
    spentByCategory: realized,
    scheduledByCategory: scheduled,
  });
  const budgetedIds = new Set(budgets.map((b) => b.categoryId));
  let unbudgeted = 0;
  for (const [id, v] of topLevelRealized) {
    const children = categories.filter((c) => c.parentId === id).map((c) => c.id);
    if (budgetedIds.has(id)) continue;
    // subtrai o que já está coberto por orçamentos de subcategorias
    const covered = children.filter((c) => budgetedIds.has(c)).reduce((sum, c) => sum + (realized.get(c) ?? 0), 0);
    unbudgeted += v - covered;
  }
  return { ...evaluation, unbudgetedSpentCents: unbudgeted, budgets };
}

const upsertSchema = z.object({
  categoryId: uuidSchema,
  month: monthSchema,
  limitCents: z.number().int().min(0, "Limite inválido").max(100_000_000_00),
  alertThresholdPct: z.coerce.number().int().min(1).max(100).default(80),
});

export async function upsertBudget(ctx: ServiceContext, input: z.input<typeof upsertSchema>): Promise<void> {
  const data = parse(upsertSchema, input);
  const [cat] = await ctx.db
    .select()
    .from(s.categories)
    .where(and(eq(s.categories.id, data.categoryId), eq(s.categories.userId, ctx.userId)))
    .limit(1);
  if (!cat) throw new NotFoundError("Categoria não encontrada");
  if (cat.kind !== "expense") throw new ValidationError("Orçamentos são definidos para categorias de despesa");
  await ctx.db
    .insert(s.budgets)
    .values({ ...data, userId: ctx.userId })
    .onConflictDoUpdate({
      target: [s.budgets.userId, s.budgets.categoryId, s.budgets.month],
      set: { limitCents: data.limitCents, alertThresholdPct: data.alertThresholdPct },
    });
}

export async function deleteBudget(ctx: ServiceContext, id: string): Promise<void> {
  const deleted = await ctx.db
    .delete(s.budgets)
    .where(and(eq(s.budgets.id, id), eq(s.budgets.userId, ctx.userId)))
    .returning({ id: s.budgets.id });
  if (deleted.length === 0) throw new NotFoundError("Orçamento não encontrado");
}

/** Copia os limites de um mês para outro (sem sobrescrever os já definidos). */
export async function copyBudgets(ctx: ServiceContext, fromMonth: MonthKey, toMonth: MonthKey): Promise<number> {
  parse(monthSchema, fromMonth);
  parse(monthSchema, toMonth);
  const source = await listBudgets(ctx, fromMonth);
  if (source.length === 0) return 0;
  const inserted = await ctx.db
    .insert(s.budgets)
    .values(source.map((b) => ({ userId: ctx.userId, categoryId: b.categoryId, month: toMonth, limitCents: b.limitCents, alertThresholdPct: b.alertThresholdPct })))
    .onConflictDoNothing()
    .returning({ id: s.budgets.id });
  return inserted.length;
}

export async function previousMonthWithBudgets(ctx: ServiceContext, month: MonthKey): Promise<MonthKey | null> {
  for (let i = 1; i <= 12; i++) {
    const m = addMonthsToKey(month, -i);
    if ((await listBudgets(ctx, m)).length > 0) return m;
  }
  return null;
}

export async function simulateBudget(ctx: ServiceContext, month: MonthKey, adjustments: BudgetAdjustment[], plannedIncomeCents: Cents) {
  const evaluation = await getBudgetEvaluation(ctx, month);
  return simulateBudgetAdjustments(evaluation, adjustments, plannedIncomeCents);
}
