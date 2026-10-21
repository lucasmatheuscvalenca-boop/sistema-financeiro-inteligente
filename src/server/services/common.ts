import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { isISODate } from "@/domain/dates";
import type { DbExecutor } from "../db/client";
import { NotFoundError, zodToValidation } from "../errors";

export const isoDate = z.string().refine(isISODate, "Data inválida (use AAAA-MM-DD)");
export const centsPositive = z.number().int("Valor inválido").positive("O valor precisa ser maior que zero").max(100_000_000_000, "Valor muito alto");
export const centsAny = z.number().int("Valor inválido").min(-100_000_000_000).max(100_000_000_000);
export const uuidSchema = z.uuid("Identificador inválido");
export const optionalUuid = z.uuid().nullish();

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw zodToValidation(r.error);
  return r.data;
}

type OwnedTable = PgTable & { id: PgColumn; userId: PgColumn };

/**
 * Garante que todos os ids informados pertencem ao usuário. Para não revelar a
 * existência de dados de terceiros, "não existe" e "não é seu" geram o mesmo erro.
 */
export async function assertOwned(db: DbExecutor, table: OwnedTable, userId: string, ids: Array<string | null | undefined>, label = "Registro"): Promise<void> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(inArray(table.id, unique), eq(table.userId, userId)) as SQL);
  if (rows.length !== unique.length) throw new NotFoundError(`${label} não encontrado`);
}

/** Diferença campo a campo para o histórico de alterações. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: readonly string[]): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[f] = { from: a, to: b };
  }
  return changes;
}

/** Detecta violação de unicidade do PostgreSQL (o Drizzle embrulha o erro original em `cause`). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let e: unknown = error;
  for (let i = 0; i < 3 && e; i++) {
    const pg = e as { code?: string; constraint?: string; cause?: unknown };
    if (pg.code === "23505") return constraint ? pg.constraint === constraint : true;
    e = pg.cause;
  }
  return false;
}
