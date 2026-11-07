/** Encerra a sessão. POST pelo botão "Sair"; GET só quando o servidor recusa a conta (lista de e-mails). */
import type { NextRequest } from "next/server";
import { localRedirect } from "@/lib/local-redirect";
import { createSupabaseRouteClient } from "@/server/supabase";

async function signOut(request: NextRequest, reason?: string) {
  const response = localRedirect(reason ? `/entrar?erro=${encodeURIComponent(reason)}` : "/entrar");
  const supabase = createSupabaseRouteClient(request, response);
  const { error } = await supabase.auth.signOut();
  if (error) console.error("[myoffice] falha ao encerrar sessão no Supabase", error.code, error.message);
  // Garantia local: mesmo se o Auth falhar, nenhum cookie de sessão sobra neste navegador.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && !response.cookies.get(cookie.name)) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("motivo") === "nao-autorizado" ? "nao-autorizado" : undefined;
  return signOut(request, reason);
}
