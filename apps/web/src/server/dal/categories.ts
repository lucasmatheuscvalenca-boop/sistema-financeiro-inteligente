import "server-only";
import { schema } from "@myoffice/db";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import type { AuthContext } from "../auth";
import { db } from "../db";

const { categories } = schema;

export interface CategoryDTO {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isSeed: boolean;
}

export async function listCategories(auth: AuthContext, workspaceId: string): Promise<CategoryDTO[]> {
  return db().asUser(auth.claims, (tx) =>
    tx
      .select({
        id: categories.id,
        name: categories.name,
        description: categories.description,
        icon: categories.icon,
        isSeed: categories.isSeed,
      })
      .from(categories)
      .where(and(eq(categories.workspaceId, workspaceId), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
  );
}

export async function createCategory(
  auth: AuthContext,
  input: { workspaceId: string; name: string; description: string | null },
): Promise<void> {
  await db().asUser(auth.claims, async (tx) => {
    const [row] = await tx
      .select({ top: max(categories.sortOrder) })
      .from(categories)
      .where(eq(categories.workspaceId, input.workspaceId));
    const next = (row?.top ?? 0) + 1;
    await tx.insert(categories).values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      icon: "folder",
      sortOrder: next,
    });
  });
}

/** Retorna false quando nenhuma linha foi alterada (sem permissão ou inexistente). */
export async function renameCategory(
  auth: AuthContext,
  input: { workspaceId: string; categoryId: string; name: string },
): Promise<boolean> {
  const rows = await db().asUser(auth.claims, (tx) =>
    tx
      .update(categories)
      .set({ name: input.name })
      .where(and(eq(categories.id, input.categoryId), eq(categories.workspaceId, input.workspaceId)))
      .returning({ id: categories.id }),
  );
  return rows.length === 1;
}

export async function archiveCategory(
  auth: AuthContext,
  input: { workspaceId: string; categoryId: string },
): Promise<boolean> {
  const rows = await db().asUser(auth.claims, (tx) =>
    tx
      .update(categories)
      .set({ archivedAt: new Date() })
      .where(
        and(eq(categories.id, input.categoryId), eq(categories.workspaceId, input.workspaceId), isNull(categories.archivedAt)),
      )
      .returning({ id: categories.id }),
  );
  return rows.length === 1;
}
