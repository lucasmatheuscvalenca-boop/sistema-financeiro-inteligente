"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { clearSessionCookie, requestMeta, SESSION_COOKIE, setSessionCookie } from "@/server/auth/current";
import { createSession, revokeSessionByToken } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { authenticate, registerUser } from "@/server/services/users";

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/painel";
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  try {
    const user = await authenticate(getDb(), { email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") }, meta);
    const session = await createSession(getDb(), user.id, meta);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    throw e;
  }
  redirect(safeNext(fd.get("para")));
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  if (fd.get("consent") !== "on") {
    return { ok: false, error: "É preciso aceitar os termos e a política de privacidade.", fieldErrors: { consent: "Obrigatório" }, at: Date.now() };
  }
  try {
    const user = await registerUser(getDb(), { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") }, meta);
    const session = await createSession(getDb(), user.id, meta);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    throw e;
  }
  redirect("/onboarding");
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(getDb(), token);
  await clearSessionCookie();
  redirect("/entrar");
}
