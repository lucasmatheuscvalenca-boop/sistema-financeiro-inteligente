/** Aceita só caminhos internos (evita redirecionamento aberto para outro site). */
export function safeNext(value: unknown, fallback = "/inicio"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  return value;
}
