import { NextResponse } from "next/server";

/**
 * Redirecionamento com Location relativo. Em Route Handlers, `request.url` pode trazer um host diferente do que
 * o navegador usou (ex.: localhost × 127.0.0.1 atrás de proxy), o que quebra cookies e a CSP `form-action`.
 * Um caminho relativo é resolvido pelo navegador no próprio host.
 */
export function localRedirect(path: string, status: 302 | 303 | 307 = 303): NextResponse {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("localRedirect aceita apenas caminhos internos.");
  return new NextResponse(null, { status, headers: { Location: path } });
}
