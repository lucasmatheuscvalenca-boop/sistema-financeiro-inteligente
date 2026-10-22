import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "rumo_session";
const PUBLIC_PATHS = new Set(["/", "/entrar", "/criar-conta", "/privacidade", "/termos"]);
const MAX_AGE = 30 * 86_400;

/**
 * Verificação otimista: sem cookie de sessão, páginas privadas redirecionam para o login.
 * A validação real da sessão acontece no servidor em cada página e ação.
 * Também renova a validade do cookie (janela deslizante), espelhando a sessão no banco.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token && !PUBLIC_PATHS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    if (pathname !== "/painel") url.searchParams.set("para", pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (token) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/health|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
