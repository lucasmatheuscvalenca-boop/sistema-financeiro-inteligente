/** Retorno do fluxo PKCE (link padrão do Supabase com ?code=…). */
import type { NextRequest } from "next/server";
import { localRedirect } from "@/lib/local-redirect";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseRouteClient } from "@/server/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/boas-vindas");
  if (code) {
    const response = localRedirect(next);
    const supabase = createSupabaseRouteClient(request, response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }
  return localRedirect("/entrar?erro=link-invalido");
}
