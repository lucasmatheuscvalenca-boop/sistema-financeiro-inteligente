/** Recria o banco do E2E (nome com "test"), aplica a camada de compatibilidade, as migrations e o papel do app. */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrate } from "@myoffice/db/migrate";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.E2E_SERVER_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const name = process.env.E2E_DATABASE_NAME ?? "myoffice_e2e_test";
const appPassword = process.env.E2E_APP_ROLE_PASSWORD ?? "myoffice_app_test_only";
if (!name.includes("test")) throw new Error("O banco do E2E precisa ter 'test' no nome.");

const server = postgres(root, { max: 1, onnotice: () => {} });
await server.unsafe(`drop database if exists ${name} with (force)`);
await server.unsafe(`create database ${name}`);
await server.end();

const url = new URL(root);
url.pathname = `/${name}`;
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
await sql.unsafe(await readFile(resolve(here, "../../../../packages/db/test/supabase-compat.sql"), "utf8"));
await migrate(sql, resolve(here, "../../../../supabase/migrations"));
await sql.unsafe(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'myoffice_app') then
      create role myoffice_app with login noinherit;
    end if;
  end $$;
  alter role myoffice_app with login noinherit password '${appPassword}';
  grant authenticated to myoffice_app;
`);
await sql.end();
console.log(`[e2e] banco ${name} pronto`);
