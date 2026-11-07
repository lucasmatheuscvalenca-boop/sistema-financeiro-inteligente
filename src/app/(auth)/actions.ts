"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ActionState } from "@/lib/action-state";
import { safeNext } from "@/lib/safe-next";
import { clearSessionCookie, cookieSecure, requestMeta, SESSION_COOKIE, setSessionCookie } from "@/server/auth/current";
import { createSession, revokeSessionByToken } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { requestPasswordReset, resetPasswordWithCode } from "@/server/services/password-reset";
import { authenticate, registerUser } from "@/server/services/users";
import { RESET_EMAIL_COOKIE } from "./reset-cookie";

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

/** Esqueci minha senha, passo 1: envia o código por e-mail (a resposta não revela se a conta existe). */
export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  let email: string;
  try {
    ({ email } = await requestPasswordReset(getDb(), { email: String(fd.get("email") ?? "") }, meta, (task) => after(task)));
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    throw e;
  }
  // Guarda o e-mail num cookie curto (e não na URL) para preencher o passo 2.
  (await cookies()).set(RESET_EMAIL_COOKIE, email, { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", maxAge: 30 * 60 });
  redirect("/redefinir-senha");
}

/** Esqueci minha senha, passo 2: confere o código, salva a nova senha e já entra na conta. */
export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) {
    return { ok: false, error: "As duas senhas não são iguais.", fieldErrors: { confirm: "Repita a mesma senha" }, at: Date.now() };
  }
  try {
    const user = await resetPasswordWithCode(getDb(), { email: String(fd.get("email") ?? ""), code: String(fd.get("code") ?? ""), password }, meta);
    const session = await createSession(getDb(), user.id, meta);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    throw e;
  }
  (await cookies()).delete(RESET_EMAIL_COOKIE);
  redirect("/painel");
}
