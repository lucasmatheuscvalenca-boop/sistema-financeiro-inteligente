import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { NotFoundError } from "../errors";
import { audit } from "../security/audit";
import type { ServiceContext } from "./context";
import { parse } from "./common";

export type MemoryRow = typeof s.memoryItems.$inferSelect;
export const MEMORY_KINDS = ["preference", "goal", "decision", "pattern", "fact"] as const;
export const MEMORY_KIND_LABEL: Record<(typeof MEMORY_KINDS)[number], string> = {
  preference: "Preferência",
  goal: "Objetivo",
  decision: "Decisão",
  pattern: "Padrão",
  fact: "Informação",
};

const itemSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  content: z.string().trim().min(2, "Escreva algo").max(500, "Use até 500 caracteres"),
});

async function history(ctx: ServiceContext, memoryItemId: string, action: string, before: MemoryRow | null, after: MemoryRow | null) {
  const pick = (r: MemoryRow | null) => (r ? { kind: r.kind, content: r.content, source: r.source, status: r.status } : null);
  await ctx.db.insert(s.memoryItemHistory).values({ memoryItemId, userId: ctx.userId, action, before: pick(before), after: pick(after) });
}

export async function listMemory(ctx: ServiceContext): Promise<MemoryRow[]> {
  return ctx.db
    .select()
    .from(s.memoryItems)
    .where(eq(s.memoryItems.userId, ctx.userId))
    .orderBy(desc(s.memoryItems.updatedAt));
}

/** Informação declarada pelo próprio usuário (ativa imediatamente). */
export async function addDeclaredMemory(ctx: ServiceContext, input: z.input<typeof itemSchema>): Promise<MemoryRow> {
  const data = parse(itemSchema, input);
  const [row] = await ctx.db
    .insert(s.memoryItems)
    .values({ ...data, userId: ctx.userId, source: "declared", status: "active", confirmedAt: new Date() })
    .returning();
  await history(ctx, row!.id, "create", null, row!);
  return row!;
}

/** Inferência do sistema: fica pendente até o usuário confirmar. Evita duplicar o mesmo conteúdo. */
export async function proposeInferredMemory(ctx: ServiceContext, input: z.input<typeof itemSchema>): Promise<MemoryRow | null> {
  const data = parse(itemSchema, input);
  const [dup] = await ctx.db
    .select({ id: s.memoryItems.id })
    .from(s.memoryItems)
    .where(and(eq(s.memoryItems.userId, ctx.userId), eq(s.memoryItems.content, data.content)))
    .limit(1);
  if (dup) return null;
  const [row] = await ctx.db
    .insert(s.memoryItems)
    .values({ ...data, userId: ctx.userId, source: "inferred", status: "pending_confirmation" })
    .returning();
  await history(ctx, row!.id, "propose", null, row!);
  return row!;
}

async function getItem(ctx: ServiceContext, id: string): Promise<MemoryRow> {
  const [row] = await ctx.db
    .select()
    .from(s.memoryItems)
    .where(and(eq(s.memoryItems.id, id), eq(s.memoryItems.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Item de memória não encontrado");
  return row;
}

export async function confirmMemory(ctx: ServiceContext, id: string): Promise<void> {
  const before = await getItem(ctx, id);
  const [after] = await ctx.db.update(s.memoryItems).set({ status: "active", confirmedAt: new Date() }).where(eq(s.memoryItems.id, id)).returning();
  await history(ctx, id, "confirm", before, after!);
}

export async function rejectMemory(ctx: ServiceContext, id: string): Promise<void> {
  const before = await getItem(ctx, id);
  const [after] = await ctx.db.update(s.memoryItems).set({ status: "rejected" }).where(eq(s.memoryItems.id, id)).returning();
  await history(ctx, id, "reject", before, after!);
}

/** Correção feita pelo usuário: o item passa a ser "declarado". */
export async function updateMemory(ctx: ServiceContext, id: string, input: z.input<typeof itemSchema>): Promise<void> {
  const before = await getItem(ctx, id);
  const data = parse(itemSchema, input);
  const [after] = await ctx.db
    .update(s.memoryItems)
    .set({ ...data, source: "declared", status: "active", confirmedAt: new Date() })
    .where(eq(s.memoryItems.id, id))
    .returning();
  await history(ctx, id, "update", before, after!);
}

/** Exclusão definitiva: o conteúdo também sai do histórico; fica só o registro de que houve exclusão. */
export async function deleteMemory(ctx: ServiceContext, id: string): Promise<void> {
  await getItem(ctx, id);
  await ctx.db.delete(s.memoryItems).where(eq(s.memoryItems.id, id));
  await ctx.db.delete(s.memoryItemHistory).where(and(eq(s.memoryItemHistory.memoryItemId, id), eq(s.memoryItemHistory.userId, ctx.userId)));
  await history(ctx, id, "delete", null, null);
}

export async function deleteAllMemory(ctx: ServiceContext): Promise<number> {
  const deleted = await ctx.db.delete(s.memoryItems).where(eq(s.memoryItems.userId, ctx.userId)).returning({ id: s.memoryItems.id });
  await ctx.db.delete(s.memoryItemHistory).where(eq(s.memoryItemHistory.userId, ctx.userId));
  await audit(ctx.db, { userId: ctx.userId, action: "memory.cleared" });
  return deleted.length;
}

export async function activeMemory(ctx: ServiceContext): Promise<MemoryRow[]> {
  return ctx.db
    .select()
    .from(s.memoryItems)
    .where(and(eq(s.memoryItems.userId, ctx.userId), eq(s.memoryItems.status, "active")))
    .orderBy(desc(s.memoryItems.updatedAt))
    .limit(50);
}
