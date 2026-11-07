import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, inject } from "vitest";
import { connect, pgErrorCode, type Db, type VerifiedClaims } from "../src";

export function openClients() {
  const urls = inject("db");
  const admin = postgres(urls.adminUrl, { max: 2, onnotice: () => {} });
  const app: Db = connect(urls.appUrl, { max: 4 });
  return { urls, admin, app };
}

/** Cria um usuário como o Supabase Auth faria (insert em auth.users → gatilho de provisionamento). */
export async function createUser(admin: postgres.Sql, displayName: string): Promise<VerifiedClaims> {
  const id = randomUUID();
  const email = `${displayName.toLowerCase().replace(/\W+/g, "")}-${id.slice(0, 8)}@teste.myoffice`;
  await admin`insert into auth.users (id, email, raw_user_meta_data)
              values (${id}, ${email}, ${admin.json({ display_name: displayName })})`;
  return { sub: id, role: "authenticated", email };
}

export async function expectPgError(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `esperava erro ${code}, mas a operação foi aceita`).toBeDefined();
  expect(pgErrorCode(caught)).toBe(code);
}
