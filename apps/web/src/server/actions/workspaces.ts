"use server";

import { createBusinessSchema, firstIssue, updateWorkspaceSchema } from "@myoffice/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireAuth } from "../auth";
import { createBusinessWorkspace, updateWorkspace } from "../dal/workspaces";
import { friendlyDbError } from "../errors";

export async function createBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = createBusinessSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  let id: string;
  try {
    id = await createBusinessWorkspace(auth, parsed.data.name);
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/w/${id}`);
}

export async function updateWorkspaceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = updateWorkspaceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  try {
    const changed = await updateWorkspace(auth, parsed.data);
    if (!changed) return { ok: false, message: "Você não tem permissão para alterar este universo." };
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Universo atualizado." };
}
