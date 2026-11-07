import "server-only";
import { connect, type Db } from "@myoffice/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { __myofficeDb?: Db };

/** Pool único por instância (o pooler de transação do Supabase multiplexa as conexões). */
export function db(): Db {
  globalForDb.__myofficeDb ??= connect(env().dbUrl, { max: 3 });
  return globalForDb.__myofficeDb;
}
