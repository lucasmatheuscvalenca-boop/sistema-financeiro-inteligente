/**
 * Aplica supabase/migrations/*.sql em ordem, uma transação por arquivo, registrando na mesma tabela do
 * Supabase CLI (supabase_migrations.schema_migrations). Assim `supabase db push` e este migrador são
 * intercambiáveis: um não reaplica o que o outro aplicou.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";

const FILE_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export interface MigrationFile {
  version: string;
  name: string;
  path: string;
}

export async function listMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  return files.map((f) => {
    const m = FILE_RE.exec(f)!;
    return { version: m[1]!, name: m[2]!, path: join(dir, f) };
  });
}

export async function migrate(
  sql: postgres.Sql,
  dir: string,
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (
    version text not null primary key,
    statements text[],
    name text
  )`;
  const rows = await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`;
  const applied = new Set(rows.map((r) => r.version));
  const done: string[] = [];

  for (const file of await listMigrations(dir)) {
    if (applied.has(file.version)) continue;
    const content = await readFile(file.path, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into supabase_migrations.schema_migrations (version, name, statements)
               values (${file.version}, ${file.name}, ${[content]})`;
    });
    log(`aplicada ${file.version}_${file.name}`);
    done.push(file.version);
  }
  return done;
}
