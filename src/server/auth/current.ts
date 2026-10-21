import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MascotId } from "@/mascots/catalog";
import { getDb } from "../db/client";
import { hashIp } from "../security/crypto";
import { makeContext, type ServiceContext } from "../services/context";
import { getPreferences } from "../services/preferences";
import { SESSION_TTL_DAYS, validateSessionToken } from "./sessions";

export const SESSION_COOKIE = "rumo_session";
export const THEME_COOKIE = "rumo_theme";

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function requestMeta(): Promise<{ userAgent: string | null; ipHash: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  return { userAgent: h.get("user-agent"), ipHash: hashIp(ip) };
}

/** Sessão atual validada no servidor (memoizada por requisição). */
export const getCurrentSession = cache(async () => {
  const jar = await cookies();
  return validateSessionToken(getDb(), jar.get(SESSION_COOKIE)?.value);
});

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");
  return session;
}

export interface AppContext {
  ctx: ServiceContext;
  user: { id: string; email: string; name: string };
  sessionId: string;
  prefs: Awaited<ReturnType<typeof getPreferences>>;
  mascotId: MascotId | null;
}

export const getAppContext = cache(async (): Promise<AppContext> => {
  const session = await requireSession();
  const base = makeContext(getDb(), session.user.id);
  const prefs = await getPreferences(base);
  const ctx = makeContext(getDb(), session.user.id, prefs.timezone);
  return { ctx, user: session.user, sessionId: session.sessionId, prefs, mascotId: prefs.mascotId };
});

/** Para as páginas do app: exige onboarding concluído (mascote escolhido explicitamente). */
export async function requireOnboarded(): Promise<AppContext & { mascotId: MascotId }> {
  const app = await getAppContext();
  if (!app.mascotId || !app.prefs.onboardingCompletedAt) redirect("/onboarding");
  return app as AppContext & { mascotId: MascotId };
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_DAYS * 86_400;
