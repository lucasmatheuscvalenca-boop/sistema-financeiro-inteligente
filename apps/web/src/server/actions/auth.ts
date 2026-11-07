"use server";

import { isEmailAllowed, signInSchema, signUpSchema, firstIssue } from "@myoffice/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { safeNext } from "@/lib/safe-next";
import { env } from "../env";
import { createSupabaseServerClient } from "../supabase";

const NOT_ALLOWED = "Este e-mail não tem acesso a este escritório.";

function translateAuthError(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com este e-mail. Entre com sua senha.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 10 caracteres, misturando letras, números e símbolos.";
    case "signup_disabled":
      return "O cadastro de novas contas está desativado neste escritório.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";
    default:
      console.error("[myoffice] erro de autenticação", error.code, error.status, error.message);
      return "Não foi possível autenticar agora. Tente novamente.";
  }
}

async function siteOrigin(): Promise<string> {
  const configured = env().siteUrl;
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!isEmailAllowed(parsed.data.email, env().allowedEmails)) return { ok: false, message: NOT_ALLOWED };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: translateAuthError(error) };

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!isEmailAllowed(parsed.data.email, env().allowedEmails)) return { ok: false, message: NOT_ALLOWED };

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=/boas-vindas`,
    },
  });
  if (error) return { ok: false, message: translateAuthError(error) };

  // Projetos com confirmação de e-mail ligada não devolvem sessão no cadastro.
  if (!data.session) {
    return {
      ok: true,
      message: "Conta criada. Enviamos um link de confirmação para o seu e-mail — abra-o para entrar.",
    };
  }
  redirect("/boas-vindas");
}
