import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./connection";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // Reutiliza o pool entre recarregamentos do servidor de desenvolvimento.
  var __mbPool: Pool | undefined;
  var __mbDb: Database | undefined;
}

function createPool(): Pool {
  const url = databaseUrl("pooled");
  if (!url) throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
  // Na Vercel cada instância atende poucas requisições ao mesmo tempo: pool pequeno e
  // conexões ociosas liberadas antes da instância ser suspensa.
  const serverless = !!process.env.VERCEL;
  const pool = new Pool({ connectionString: url, max: serverless ? 5 : 10, idleTimeoutMillis: serverless ? 5_000 : 30_000 });
  if (serverless) attachDatabasePool(pool);
  return pool;
}

export function getDb(): Database {
  if (!globalThis.__mbDb) {
    globalThis.__mbPool = createPool();
    globalThis.__mbDb = drizzle(globalThis.__mbPool, { schema, casing: "snake_case" });
  }
  return globalThis.__mbDb;
}

/** Fecha o pool (usado por scripts e testes). */
export async function closeDb(): Promise<void> {
  await globalThis.__mbPool?.end();
  globalThis.__mbPool = undefined;
  globalThis.__mbDb = undefined;
}

export { schema };

/** Banco ou transação em andamento (mesma API de consulta). */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
