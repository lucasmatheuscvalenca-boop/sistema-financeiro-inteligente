/** pnpm db:migrate — aplica as migrations no banco de SUPABASE_DB_MIGRATION_URL (ou SUPABASE_DB_URL). */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrate } from "./migrate";

const url = process.env.SUPABASE_DB_MIGRATION_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Defina SUPABASE_DB_MIGRATION_URL (conexão direta, usuário postgres) para aplicar as migrations.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../../../supabase/migrations");
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const done = await migrate(sql, dir, (m) => console.log(m));
  console.log(done.length ? `${done.length} migration(s) aplicada(s).` : "Banco já está atualizado.");
} catch (error) {
  console.error("Falha ao aplicar migrations:", error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
