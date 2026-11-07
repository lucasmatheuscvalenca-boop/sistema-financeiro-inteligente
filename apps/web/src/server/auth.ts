import "server-only";
import { isEmailAllowed } from "@myoffice/core";
import type { VerifiedClaims } from "@myoffice/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "./env";
import { createSupabaseServerClient } from "./supabase";

export interface AuthContext {
  userId: string;
  email: string | null;
  /** Claims do JWT verificado — repassadas ao banco para a RLS. */
  claims: VerifiedClaims;
}

/**
 * Usuário autenticado da requisição, ou null. Usa getClaims(), que verifica a assinatura do JWT
 * (nunca getSession(), cujo conteúdo vem do cookie sem verificação).
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const c = data.claims as Record<string, unknown>;
  if (c.role !== "authenticated" || typeof c.sub !== "string") return null;
  const email = typeof c.email === "string" ? c.email : null;
  const claims: VerifiedClaims = { sub: c.sub, role: "authenticated" };
  if (email) claims.email = email;
  if (typeof c.session_id === "string") claims.session_id = c.session_id;
  if (typeof c.aud === "string" || Array.isArray(c.aud)) claims.aud = c.aud as string | string[];
  if (typeof c.aal === "string") claims.aal = c.aal;
  return { userId: c.sub, email, claims };
});

/** Exige sessão válida e e-mail permitido; caso contrário redireciona. Use em toda página e ação protegida. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/entrar");
  if (!isEmailAllowed(auth.email, env().allowedEmails)) redirect("/auth/sair?motivo=nao-autorizado");
  return auth;
}
