"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/server/auth/current";
import { syncStaleConnections } from "@/server/services/connections";
import { updatePreferences } from "@/server/services/preferences";

/**
 * Salva o tema na conta (vale em outros aparelhos). A troca de cores e o cookie já foram feitos
 * no navegador; por isso não mexe em cookie nem revalida nada, para não redesenhar a tela.
 */
export async function setThemeAction(theme: string): Promise<void> {
  if (!["system", "light", "dark"].includes(theme)) return;
  const app = await getAppContext();
  await updatePreferences(app.ctx, { theme: theme as "system" | "light" | "dark" });
}

/** Ao abrir o app: traz o que o fornecedor já tem para conexões paradas há mais de 6 horas. */
export async function autoSyncAction(): Promise<{ synced: number; imported: number }> {
  try {
    const app = await getAppContext();
    const r = await syncStaleConnections(app.ctx);
    if (r.imported > 0) revalidatePath("/", "layout");
    return r;
  } catch {
    return { synced: 0, imported: 0 };
  }
}
