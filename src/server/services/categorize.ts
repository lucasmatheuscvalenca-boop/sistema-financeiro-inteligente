import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { categoryFromBank, merchantKey, suggestCategory, type CategorySuggestion, type TxKindForRules } from "@/domain/categorize";
import type { DbExecutor } from "../db/client";
import * as s from "../db/schema";
import type { ServiceContext } from "./context";

type CategoryLite = { id: string; name: string; kind: string; parentId: string | null; archivedAt: Date | null };

function plainName(n: string): string {
  return n.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

/**
 * Traduz "Transporte › Aplicativos" para o id da categoria da pessoa, pelo nome. Quem renomeou
 * ou arquivou a categoria padrão não recebe sugestão para ela (nunca inventamos categoria).
 */
export function resolveSuggestion(categories: readonly CategoryLite[], suggestion: CategorySuggestion | null, kind: TxKindForRules): string | null {
  if (!suggestion) return null;
  const live = categories.filter((c) => !c.archivedAt && c.kind === kind);
  const parent = live.find((c) => !c.parentId && plainName(c.name) === plainName(suggestion.category));
  if (!parent) return null;
  if (suggestion.sub) {
    const child = live.find((c) => c.parentId === parent.id && plainName(c.name) === plainName(suggestion.sub!));
    if (child) return child.id;
  }
  return parent.id;
}

export type RuleMap = Map<string, string>;

export async function loadRules(db: DbExecutor, userId: string): Promise<RuleMap> {
  const rows = await db.select({ merchantKey: s.categoryRules.merchantKey, kind: s.categoryRules.kind, categoryId: s.categoryRules.categoryId }).from(s.categoryRules).where(eq(s.categoryRules.userId, userId));
  return new Map(rows.map((r) => [`${r.kind}|${r.merchantKey}`, r.categoryId]));
}

export async function loadCategoryIndex(db: DbExecutor, userId: string): Promise<CategoryLite[]> {
  return db.select({ id: s.categories.id, name: s.categories.name, kind: s.categories.kind, parentId: s.categories.parentId, archivedAt: s.categories.archivedAt }).from(s.categories).where(eq(s.categories.userId, userId));
}

export interface Categorizer {
  /** Id da categoria, ou nulo quando nada reconhece a descrição. */
  suggest(description: string, kind: TxKindForRules, bankCategory?: string | null): string | null;
}

/** Uma instância por operação (importação, sincronização): carrega regras e categorias uma vez. */
export async function makeCategorizer(db: DbExecutor, userId: string): Promise<Categorizer> {
  const [rules, categories] = await Promise.all([loadRules(db, userId), loadCategoryIndex(db, userId)]);
  const alive = new Set(categories.filter((c) => !c.archivedAt).map((c) => c.id));
  return {
    suggest(description, kind, bankCategory) {
      const key = merchantKey(description);
      const learned = key ? rules.get(`${kind}|${key}`) : undefined;
      if (learned && alive.has(learned)) return learned;
      return resolveSuggestion(categories, categoryFromBank(bankCategory) ?? suggestCategory(description, kind), kind);
    },
  };
}

/**
 * Guarda "esse estabelecimento é esta categoria" quando a pessoa escolhe ou corrige. Uma regra
 * por estabelecimento e tipo; a escolha mais recente vence.
 */
export async function learnCategory(db: DbExecutor, userId: string, description: string, kind: string, categoryId: string | null): Promise<void> {
  if (!categoryId || (kind !== "income" && kind !== "expense")) return;
  const key = merchantKey(description);
  if (!key) return;
  await db
    .insert(s.categoryRules)
    .values({ userId, merchantKey: key, kind, categoryId })
    .onConflictDoUpdate({ target: [s.categoryRules.userId, s.categoryRules.merchantKey, s.categoryRules.kind], set: { categoryId, hits: sql`${s.categoryRules.hits} + 1`, updatedAt: new Date() } });
}

/**
 * Preenche a categoria dos lançamentos que não têm nenhuma (receitas e despesas). Nunca mexe
 * numa categoria já escolhida. Roda no máximo uma vez por dia por pessoa, ou quando pedido.
 */
export async function categorizeUncategorized(ctx: ServiceContext, opts: { force?: boolean; limit?: number } = {}): Promise<{ filled: number; checked: number }> {
  const [prefs] = await ctx.db.select({ at: s.userPreferences.autoCategorizedAt }).from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId));
  if (!opts.force && prefs?.at && Date.now() - prefs.at.getTime() < 24 * 3600 * 1000) return { filled: 0, checked: 0 };
  const rows = await ctx.db
    .select({ id: s.transactions.id, description: s.transactions.description, kind: s.transactions.kind })
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), isNull(s.transactions.categoryId), inArray(s.transactions.kind, ["income", "expense"])))
    .limit(opts.limit ?? 5000);
  const categorizer = await makeCategorizer(ctx.db, ctx.userId);
  const byCategory = new Map<string, string[]>();
  for (const r of rows) {
    const id = categorizer.suggest(r.description, r.kind as TxKindForRules);
    if (id) byCategory.set(id, [...(byCategory.get(id) ?? []), r.id]);
  }
  let filled = 0;
  for (const [categoryId, ids] of byCategory) {
    await ctx.db
      .update(s.transactions)
      .set({ categoryId, categoryAuto: true })
      .where(and(eq(s.transactions.userId, ctx.userId), inArray(s.transactions.id, ids), isNull(s.transactions.categoryId)));
    filled += ids.length;
  }
  await ctx.db.update(s.userPreferences).set({ autoCategorizedAt: new Date() }).where(eq(s.userPreferences.userId, ctx.userId));
  return { filled, checked: rows.length };
}
