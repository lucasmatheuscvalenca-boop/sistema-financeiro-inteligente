import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import type { ServiceContext } from "./context";
import { optionalUuid, parse } from "./common";

export type CategoryRow = typeof s.categories.$inferSelect;

export async function listCategories(ctx: ServiceContext, opts: { kind?: "income" | "expense"; includeArchived?: boolean } = {}): Promise<CategoryRow[]> {
  const conds = [eq(s.categories.userId, ctx.userId)];
  if (opts.kind) conds.push(eq(s.categories.kind, opts.kind));
  if (!opts.includeArchived) conds.push(isNull(s.categories.archivedAt));
  return ctx.db
    .select()
    .from(s.categories)
    .where(and(...conds))
    .orderBy(asc(s.categories.sortOrder), asc(s.categories.name));
}

/** Nome exibido com a categoria-mãe: "Moradia › Aluguel". */
export function categoryLabel(cat: CategoryRow, all: readonly CategoryRow[]): string {
  if (!cat.parentId) return cat.name;
  const parent = all.find((c) => c.id === cat.parentId);
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Nome muito longo"),
  kind: z.enum(["income", "expense"]),
  parentId: optionalUuid,
  essential: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function getCategory(ctx: ServiceContext, id: string): Promise<CategoryRow> {
  const [row] = await ctx.db
    .select()
    .from(s.categories)
    .where(and(eq(s.categories.id, id), eq(s.categories.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Categoria não encontrada");
  return row;
}

export async function createCategory(ctx: ServiceContext, input: z.input<typeof categorySchema>): Promise<CategoryRow> {
  const data = parse(categorySchema, input);
  if (data.parentId) {
    const parent = await getCategory(ctx, data.parentId);
    if (parent.kind !== data.kind) throw new ValidationError("A subcategoria precisa ser do mesmo tipo da categoria-mãe");
    if (parent.parentId) throw new ValidationError("Use no máximo dois níveis (categoria e subcategoria)");
  }
  const [row] = await ctx.db
    .insert(s.categories)
    .values({ userId: ctx.userId, name: data.name, kind: data.kind, parentId: data.parentId ?? null, essential: data.essential ?? false, color: data.color ?? null, sortOrder: 999 })
    .returning();
  return row!;
}

export async function updateCategory(ctx: ServiceContext, id: string, input: { name?: string; essential?: boolean; color?: string }): Promise<void> {
  await getCategory(ctx, id);
  const data = parse(categorySchema.pick({ name: true, essential: true, color: true }).partial(), input);
  await ctx.db
    .update(s.categories)
    .set(data)
    .where(and(eq(s.categories.id, id), eq(s.categories.userId, ctx.userId)));
}

export async function archiveCategory(ctx: ServiceContext, id: string): Promise<void> {
  await getCategory(ctx, id);
  await ctx.db
    .update(s.categories)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.categories.id, id), eq(s.categories.userId, ctx.userId)));
}
