/**
 * Roda antes de toda página (runtime Node.js, padrão do Next 16):
 *  1. renova a sessão do Supabase e grava os cookies atualizados (padrão oficial getAll/setAll + getClaims);
 *  2. redireciona quem não tem sessão para /entrar (e quem tem sessão para fora das telas de entrada);
 *  3. aplica uma Content-Security-Policy com nonce único por requisição.
 * A autorização de verdade acontece no servidor (requireAuth) e no banco (RLS); isto é a primeira barreira.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/entrar", "/cadastro", "/auth/"];
const AUTH_PAGES = ["/entrar", "/cadastro"];

function buildCsp(nonce: string, supabaseUrl: string | undefined): string {
  const isDev = process.env.NODE_ENV === "development";
  let supabase = "";
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      supabase = ` ${u.origin} ${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    } catch {
      supabase = "";
    }
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Estilos inline (atributos style) são de baixo risco e usados pelo React/Phaser.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabase}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let cacheHeaders: Record<string, string> = {};
  let signedIn = false;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const cookie of cookiesToSet) {
            // Atualiza a requisição para que as páginas já vejam a sessão renovada…
            request.cookies.set(cookie.name, cookie.value);
            // …e a resposta, para o navegador guardar.
            pendingCookies.push(cookie);
          }
          cacheHeaders = headers ?? {};
        },
      },
    });
    // Não coloque código entre a criação do cliente e getClaims(): é aqui que a sessão é renovada.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
  let response: NextResponse;

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    response = NextResponse.redirect(url);
  } else if (signedIn && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    response = NextResponse.redirect(url);
  } else {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = buildCsp(nonce, supabaseUrl);
    // Copiado DEPOIS de getClaims(): inclui os cookies renovados.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
  }

  for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
