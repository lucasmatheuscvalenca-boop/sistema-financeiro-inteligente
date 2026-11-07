import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers (um por requisição).
 * Em Server Components o Next não permite gravar cookies; a renovação da sessão acontece no proxy.ts.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = env();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Chamado a partir de um Server Component: o proxy.ts já renova a sessão.
        }
      },
    },
  });
}

/**
 * Cliente para Route Handlers que devolvem um redirecionamento: lê os cookies da requisição e grava os
 * cookies de sessão diretamente na resposta retornada (sem depender de mesclagem implícita).
 */
export function createSupabaseRouteClient(request: NextRequest, response: NextResponse) {
  const { supabaseUrl, supabaseKey } = env();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });
}
