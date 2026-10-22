/**
 * Strings de conexão a partir do ambiente. `DATABASE_ENV_PREFIX` permite usar variáveis criadas
 * por uma integração com prefixo (ex.: `NOVO_` → `NOVO_DATABASE_URL`) sem copiar credenciais:
 * trocar de banco é mudar o prefixo e publicar; remover o prefixo volta ao `DATABASE_URL`.
 */
type Env = Record<string, string | undefined>;

export function databaseEnvPrefix(env: Env = process.env): string {
  const prefix = env.DATABASE_ENV_PREFIX ?? "";
  if (!/^[A-Z0-9_]*$/.test(prefix)) throw new Error("DATABASE_ENV_PREFIX inválido (use letras maiúsculas, números e _)");
  return prefix;
}

/** `pooled` para a aplicação; `direct` (sem pooler) para migrações e cópias de dados. */
export function databaseUrl(kind: "pooled" | "direct", env: Env = process.env, prefix = databaseEnvPrefix(env)): string | undefined {
  const pooled = env[`${prefix}DATABASE_URL`] ?? env[`${prefix}POSTGRES_URL`];
  const url = kind === "pooled" ? pooled : (env[`${prefix}DATABASE_URL_UNPOOLED`] ?? env[`${prefix}POSTGRES_URL_NON_POOLING`] ?? pooled);
  return url && explicitSslMode(url);
}

/**
 * O driver `pg` já trata `sslmode=prefer|require|verify-ca` como `verify-full` (certificado e
 * nome do servidor conferidos), mas avisa que isso mudará na próxima versão. Escrever
 * `verify-full` mantém a mesma segurança de hoje e tira o aviso dos logs.
 */
export function explicitSslMode(url: string): string {
  if (/[?&]uselibpqcompat=true(&|$)/.test(url)) return url;
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
