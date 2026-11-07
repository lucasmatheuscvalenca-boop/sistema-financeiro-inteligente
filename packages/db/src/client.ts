/**
 * Acesso ao banco SEMPRE dentro de um contexto de segurança:
 *   - asUser:  transação com as claims do JWT verificado e `set local role authenticated` → RLS do usuário;
 *   - asAgent: igual, mais `myoffice.agent_id` → RLS restrita ao universo do agente e às concessões explícitas.
 * Não existe método para consultar fora de contexto. Com o papel de conexão recomendado (myoffice_app, sem
 * privilégios próprios), mesmo um uso indevido do driver falharia em vez de ignorar a RLS.
 */
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Claims mínimas de um JWT já verificado pelo Supabase Auth. */
export interface VerifiedClaims {
  sub: string;
  role: "authenticated";
  email?: string;
  aud?: string | string[];
  session_id?: string;
  aal?: string;
  is_anonymous?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copia só os campos conhecidos (nada de claims arbitrárias vindas de fora). */
export function sanitizeClaims(claims: VerifiedClaims): VerifiedClaims {
  if (!claims || typeof claims.sub !== "string" || !UUID_RE.test(claims.sub)) {
    throw new Error("Claims inválidas: sub ausente ou não é um uuid.");
  }
  if (claims.role !== "authenticated") {
    throw new Error("Claims inválidas: apenas o papel 'authenticated' acessa dados.");
  }
  const out: VerifiedClaims = { sub: claims.sub, role: "authenticated" };
  if (typeof claims.email === "string") out.email = claims.email;
  if (typeof claims.aud === "string" || Array.isArray(claims.aud)) out.aud = claims.aud;
  if (typeof claims.session_id === "string") out.session_id = claims.session_id;
  if (typeof claims.aal === "string") out.aal = claims.aal;
  if (typeof claims.is_anonymous === "boolean") out.is_anonymous = claims.is_anonymous;
  return out;
}

export interface Db {
  asUser<T>(claims: VerifiedClaims, fn: (tx: Tx) => Promise<T>): Promise<T>;
  asAgent<T>(claims: VerifiedClaims, agentId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** Conexões no pool. Em funções serverless, mantenha baixo (o pooler do Supabase multiplexa). */
  max?: number;
}

export function connect(url: string, options: ConnectOptions = {}): Db {
  const client = postgres(url, {
    // Obrigatório com o pooler de transação do Supabase (porta 6543).
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db: Database = drizzle(client, { schema });

  async function run<T>(claims: VerifiedClaims, agentId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const safe = sanitizeClaims(claims);
    if (agentId !== null && !UUID_RE.test(agentId)) throw new Error("agentId inválido.");
    return db.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('request.jwt.claims', ${JSON.stringify(safe)}, true),
        set_config('request.jwt.claim.sub', ${safe.sub}, true),
        set_config('myoffice.agent_id', ${agentId ?? ""}, true)`);
      await tx.execute(sql`set local role authenticated`);
      return fn(tx);
    });
  }

  return {
    asUser: (claims, fn) => run(claims, null, fn),
    asAgent: (claims, agentId, fn) => run(claims, agentId, fn),
    close: () => client.end({ timeout: 5 }),
  };
}

/** Código SQLSTATE de um erro do Postgres, mesmo quando embrulhado pelo Drizzle. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Mensagem do Postgres (ex.: o texto do RAISE), mesmo quando embrulhada pelo Drizzle. */
export function pgErrorMessage(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current && "message" in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return String((current as { message: unknown }).message);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
