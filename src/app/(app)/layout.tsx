import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { and, count, eq } from "drizzle-orm";
import { AppShell } from "@/components/app/app-shell";
import { requireOnboarded, THEME_COOKIE } from "@/server/auth/current";
import * as s from "@/server/db/schema";
import { logoutAction } from "../(auth)/actions";
import { setThemeAction } from "./shell-actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const app = await requireOnboarded();
  const [row] = await app.ctx.db
    .select({ n: count() })
    .from(s.alerts)
    .where(and(eq(s.alerts.userId, app.user.id), eq(s.alerts.status, "active")));
  const theme = (await cookies()).get(THEME_COOKIE)?.value ?? app.prefs.theme;
  return (
    <AppShell userName={app.user.name} mascotId={app.mascotId} alertCount={row?.n ?? 0} theme={theme} logoutAction={logoutAction} setThemeAction={setThemeAction}>
      {children}
    </AppShell>
  );
}
