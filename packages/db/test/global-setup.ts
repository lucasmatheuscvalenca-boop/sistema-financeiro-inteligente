/**
 * Prepara o banco dos testes de isolamento.
 *  - MYOFFICE_TEST_TARGET=local (padrão): recria `myoffice_test` no PostgreSQL de TEST_ADMIN_DATABASE_URL,
 *    aplica a camada de compatibilidade do Supabase e as migrations.
 *  - MYOFFICE_TEST_TARGET=supabase (CI): usa TEST_DATABASE_URL de um Supabase real (migrations já aplicadas
 *    pelo `supabase start`).
 * Nos dois casos garante o papel de conexão sem privilégios `myoffice_app`, usado pelos testes como em produção.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { TestProject } from "vitest/node";
import { migrate } from "../src/migrate";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, "../../../supabase/migrations");
const APP_ROLE_PASSWORD = "myoffice_app_test_only";

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

function withUser(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

async function ensureAppRole(sql: postgres.Sql) {
  await sql.unsafe(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'myoffice_app') then
        create role myoffice_app with login noinherit;
      end if;
    end
    $$;
    alter role myoffice_app with login noinherit password '${APP_ROLE_PASSWORD}';
    grant authenticated to myoffice_app;
  `);
}

export default async function setup(project: TestProject) {
  const target = process.env.MYOFFICE_TEST_TARGET ?? "local";
  let adminUrl: string;

  if (target === "supabase") {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("MYOFFICE_TEST_TARGET=supabase exige TEST_DATABASE_URL.");
    adminUrl = url;
  } else {
    const root = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
    const name = process.env.TEST_DATABASE_NAME ?? "myoffice_test";
    if (!name.includes("test")) throw new Error("O banco de teste precisa ter 'test' no nome (ele é recriado).");
    const server = postgres(root, { max: 1, onnotice: () => {} });
    await server.unsafe(`drop database if exists ${name} with (force)`);
    await server.unsafe(`create database ${name}`);
    await server.end();
    adminUrl = withDatabase(root, name);

    const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await sql.unsafe(await readFile(resolve(here, "supabase-compat.sql"), "utf8"));
    await migrate(sql, MIGRATIONS);
    await sql.end();
  }

  if (target === "supabase") {
    // 1) Valida a instrução de supabase/hardening/app-role.sql com o usuário "postgres" (o do SQL Editor).
    const asPostgres = postgres(adminUrl, { max: 1, onnotice: () => {} });
    try {
      await ensureAppRole(asPostgres);
      console.log("[db-tests] OK: o usuário postgres consegue criar myoffice_app e conceder authenticated.");
    } catch (error) {
      console.warn("[db-tests] ATENÇÃO: o usuário postgres NÃO conseguiu preparar myoffice_app:", (error as Error).message);
    } finally {
      await asPostgres.end();
    }
    // 2) Dados de teste (auth.users) com o superusuário do Supabase local, se disponível.
    const superUrl = withUser(adminUrl, "supabase_admin", new URL(adminUrl).password);
    const asSuper = postgres(superUrl, { max: 1, onnotice: () => {} });
    try {
      await ensureAppRole(asSuper);
      adminUrl = superUrl;
      console.log("[db-tests] usando supabase_admin para os dados de teste.");
    } catch (error) {
      console.warn("[db-tests] supabase_admin indisponível; seguindo com postgres:", (error as Error).message);
    } finally {
      await asSuper.end();
    }
  } else {
    const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await ensureAppRole(sql);
    await sql.end();
  }

  project.provide("db", { target, adminUrl, appUrl: withUser(adminUrl, "myoffice_app", APP_ROLE_PASSWORD) });
}

declare module "vitest" {
  export interface ProvidedContext {
    db: { target: string; adminUrl: string; appUrl: string };
  }
}
