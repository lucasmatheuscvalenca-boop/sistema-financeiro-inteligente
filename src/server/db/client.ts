import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // Reutiliza o pool entre recarregamentos do servidor de desenvolvimento.
  var __rumoPool: Pool | undefined;
  var __rumoDb: Database | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
  return new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
}

export function getDb(): Database {
  if (!globalThis.__rumoDb) {
    globalThis.__rumoPool = createPool();
    globalThis.__rumoDb = drizzle(globalThis.__rumoPool, { schema, casing: "snake_case" });
  }
  return globalThis.__rumoDb;
}

/** Fecha o pool (usado por scripts e testes). */
export async function closeDb(): Promise<void> {
  await globalThis.__rumoPool?.end();
  globalThis.__rumoPool = undefined;
  globalThis.__rumoDb = undefined;
}

export { schema };

/** Banco ou transação em andamento (mesma API de consulta). */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
