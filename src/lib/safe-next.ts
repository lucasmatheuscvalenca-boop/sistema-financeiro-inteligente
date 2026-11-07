/**
 * Destino depois do login (?para=). Só aceita um caminho deste site: começa com "/", sem
 * caracteres de controle, e continua na mesma origem quando resolvido como URL (barras invertidas,
 * "//outro.site" e afins saem para outra origem e são recusados). Devolve o caminho normalizado.
 */
export function safeNext(value: unknown, fallback = "/painel"): string {
  if (typeof value !== "string" || value === "" || value.length > 1024) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (!value.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, "http://x");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://x") return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
