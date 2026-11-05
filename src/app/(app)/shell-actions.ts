"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAppContext, THEME_COOKIE } from "@/server/auth/current";
import { syncStaleConnections } from "@/server/services/connections";
import { updatePreferences } from "@/server/services/preferences";

export async function setThemeAction(fd: FormData): Promise<void> {
  const theme = String(fd.get("theme"));
  if (!["system", "light", "dark"].includes(theme)) return;
  const app = await getAppContext();
  await updatePreferences(app.ctx, { theme: theme as "system" | "light" | "dark" });
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: 365 * 86_400, sameSite: "lax" });
  revalidatePath("/", "layout");
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
