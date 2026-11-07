import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import { AutoSync } from "@/components/app/auto-sync";
import { requireOnboarded, THEME_COOKIE } from "@/server/auth/current";
import { SIDEBAR_COOKIE, SIDEBAR_RECOLHIDA } from "@/components/app/sidebar-state";
import { listAlerts } from "@/server/services/alerts";
import { hasRealConnections } from "@/server/services/connections";
import { logoutAction } from "../(auth)/actions";
import { autoSyncAction, setThemeAction } from "./shell-actions";

/** Sincronizações pedidas ao abrir o app podem levar alguns segundos por banco. */
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const app = await requireOnboarded();
  const [alerts, connected] = await Promise.all([listAlerts(app.ctx), hasRealConnections(app.ctx)]);
  const jar = await cookies();
  const theme = jar.get(THEME_COOKIE)?.value ?? app.prefs.theme;
  const sidebarCollapsed = jar.get(SIDEBAR_COOKIE)?.value === SIDEBAR_RECOLHIDA;
  return (
    <AppShell
      userName={app.user.name}
      userEmail={app.user.email}
      mascotId={app.mascotId}
      alertCount={alerts.length}
      alerts={alerts.slice(0, 6).map((a) => ({ id: a.id, title: a.title, cause: a.cause, severity: a.severity, href: a.href }))}
      theme={theme}
      logoutAction={logoutAction}
      setThemeAction={setThemeAction}
      sidebarCollapsed={sidebarCollapsed}
    >
      {connected ? <AutoSync action={autoSyncAction} /> : null}
      {children}
    </AppShell>
  );
}
