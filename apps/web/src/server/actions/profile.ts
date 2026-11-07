"use server";

import { displayNameSchema, firstIssue } from "@myoffice/core";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAuth } from "../auth";
import { updateDisplayName } from "../dal/profile";
import { friendlyDbError } from "../errors";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await updateDisplayName(auth, parsed.data);
  } catch (error) {
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Nome atualizado." };
}
