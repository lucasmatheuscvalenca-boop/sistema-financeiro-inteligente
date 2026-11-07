/** Link de confirmação de e-mail no formato recomendado ({{ .SiteURL }}/auth/confirm?token_hash=…&type=email). */
import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { localRedirect } from "@/lib/local-redirect";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseRouteClient } from "@/server/supabase";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "/boas-vindas");

  if (tokenHash && type && TYPES.includes(type)) {
    const response = localRedirect(next);
    const supabase = createSupabaseRouteClient(request, response);
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return response;
  }
  return localRedirect("/entrar?erro=link-invalido");
}
