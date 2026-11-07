"use server";

import { createCategorySchema, firstIssue, renameCategorySchema, uuidSchema } from "@myoffice/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireAuth } from "../auth";
import { archiveCategory, createCategory, renameCategory } from "../dal/categories";
import { friendlyDbError } from "../errors";

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = createCategorySchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  try {
    await createCategory(auth, parsed.data);
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath(`/w/${parsed.data.workspaceId}`);
  return { ok: true, message: `Categoria “${parsed.data.name}” criada.` };
}

export async function renameCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = renameCategorySchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  try {
    const changed = await renameCategory(auth, parsed.data);
    if (!changed) return { ok: false, message: "Você não tem permissão para alterar esta categoria." };
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath(`/w/${parsed.data.workspaceId}`);
  return { ok: true, message: "Categoria renomeada." };
}

const archiveSchema = z.object({ workspaceId: uuidSchema, categoryId: uuidSchema });

export async function archiveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = archiveSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  try {
    const changed = await archiveCategory(auth, parsed.data);
    if (!changed) return { ok: false, message: "Você não tem permissão para arquivar esta categoria." };
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath(`/w/${parsed.data.workspaceId}`);
  return { ok: true, message: "Categoria arquivada." };
}
