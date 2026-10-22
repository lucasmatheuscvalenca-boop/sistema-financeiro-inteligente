"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAppContext, THEME_COOKIE } from "@/server/auth/current";
import { updatePreferences } from "@/server/services/preferences";

export async function setThemeAction(fd: FormData): Promise<void> {
  const theme = String(fd.get("theme"));
  if (!["system", "light", "dark"].includes(theme)) return;
  const app = await getAppContext();
  await updatePreferences(app.ctx, { theme: theme as "system" | "light" | "dark" });
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: 365 * 86_400, sameSite: "lax" });
  revalidatePath("/", "layout");
}
