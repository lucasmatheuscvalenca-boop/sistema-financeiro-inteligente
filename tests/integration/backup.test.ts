import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { checkRestore, restoreIntoEmptyDatabase } from "@/server/backup/database";
import { openBackup, parseBackup } from "@/server/backup/format";
import { memoryBackupStorage } from "@/server/backup/storage";
import { closeDb, getDb, schema, type Database } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createAccount } from "@/server/services/accounts";
import { runBackup } from "@/server/services/backup";
import { listCategories } from "@/server/services/categories";
import { setTransactionTags, splitTransaction } from "@/server/services/entry-tools";
import { createTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

const restoreUrl = (() => {
  const u = new URL(process.env.TEST_DATABASE_URL!);
  u.pathname = `${u.pathname}_restore`;
  return u.toString();
})();
const restoreDbName = new URL(restoreUrl).pathname.slice(1);

async function admin(query: string) {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try {
    await c.query(query);
  } finally {
    await c.end();
  }
}

afterAll(async () => {
  await closeDb();
  await admin(`DROP DATABASE IF EXISTS "${restoreDbName}"`);
});

async function seed() {
  const u = await createUser("Copia Seguranca");
  const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 250_000, initialBalanceDate: "2026-10-01" });
  const cats = await listCategories(u, { kind: "expense" });
  const [compra] = await createTransaction(u, { kind: "expense", amountCents: 28_000, date: "2026-10-10", description: "Supermercado", accountId: cc.id });
  await setTransactionTags(u, compra!.id, "casa nova, mercado");
  await splitTransaction(u, compra!.id, { parts: [{ amountCents: 20_000, categoryId: cats.find((c) => c.name === "Mercado")!.id }, { amountCents: 8_000, categoryId: cats.find((c) => c.name === "Moradia")!.id }] });
  return { u, compraId: compra!.id };
}

describe("cópia de segurança diária", () => {
  it("gera, cifra, guarda e testa a restauração uma vez por mês", async () => {
    const { u } = await seed();
    const storage = memoryBackupStorage();
    const now = new Date("2026-11-07T09:00:00Z");
    const r = await runBackup(getDb(), { storage, now });
    expect(r.problems).toEqual([]);
    expect(r.created).toBe("backups/2026-11-07T09-00-00Z.mbbk");
    expect(r.check).toMatchObject({ ok: true, problems: [] });
    expect(r.rows).toBeGreaterThan(10);

    const payload = parseBackup(openBackup(storage.files.get(r.created!)!.body));
    expect(payload.tables.sessions).toBeUndefined();
    expect(payload.tables.users!.rows.some((x) => x.id === u.userId)).toBe(true);
    const tagged = payload.tables.transactions!.rows.filter((x) => x.user_id === u.userId && Array.isArray(x.tags) && (x.tags as string[]).includes("casa nova"));
    expect(tagged).toHaveLength(2);
    // Nada sobrou do teste de restauração.
    const leftover = await getDb().execute<{ n: string | null }>(sql`select to_regnamespace('mb_restore_check')::text as n`);
    expect(leftover.rows[0]!.n).toBeNull();

    // No dia seguinte: cópia nova, sem repetir o teste do mês.
    const next = await runBackup(getDb(), { storage, now: new Date("2026-11-08T09:00:00Z") });
    expect(next.check).toBeNull();
    expect(storage.files.size).toBe(2);
    const audits = await getDb().select().from(s.auditLog).where(and(eq(s.auditLog.action, "backup.restore_checked"), eq(s.auditLog.entityType, "ok")));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("o teste de restauração acusa cópia adulterada", async () => {
    const storage = memoryBackupStorage();
    await runBackup(getDb(), { storage, now: new Date("2026-11-09T09:00:00Z") });
    const json = openBackup([...storage.files.values()][0]!.body);
    const doc = JSON.parse(json);
    doc.tables.users.rows.pop();
    const bad = await checkRestore(getDb(), JSON.stringify(doc));
    expect(bad.ok).toBe(false);
    expect(bad.problems.join(" ")).toMatch(/users/);
    const wrongType = JSON.parse(json);
    wrongType.tables.users.rows[0].created_at = "não é data";
    const broken = await checkRestore(getDb(), JSON.stringify(wrongType));
    expect(broken.ok).toBe(false);
  });

  it("sem armazenamento: na produção vira aviso ao dono do app", async () => {
    const before = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      const r = await runBackup(getDb(), { storage: null });
      expect(r.skipped).toBe("not_configured");
      expect(r.problems[0]).toMatch(/desligada/);
    } finally {
      if (before === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = before;
    }
    expect((await runBackup(getDb(), { storage: null })).problems).toEqual([]);
  });

  it("restaura num banco novo, igual ao original, e recusa banco com dados", async () => {
    const { compraId } = await seed();
    const storage = memoryBackupStorage();
    const r = await runBackup(getDb(), { storage, now: new Date("2026-11-10T09:00:00Z") });
    const json = openBackup(storage.files.get(r.created!)!.body);
    const payload = parseBackup(json);

    await admin(`DROP DATABASE IF EXISTS "${restoreDbName}"`);
    await admin(`CREATE DATABASE "${restoreDbName}"`);
    const pool = new Pool({ connectionString: restoreUrl });
    const target = drizzle(pool, { schema, casing: "snake_case" }) as unknown as Database;
    try {
      await migrate(target, { migrationsFolder: "drizzle" });
      const result = await restoreIntoEmptyDatabase(target, json);
      expect(result.skipped).toEqual([]);
      expect(result.rows).toBe(Object.values(payload.tables).reduce((t, x) => t + x.count, 0));
      for (const [name, t] of Object.entries(payload.tables)) {
        const n = await target.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(name)}`);
        expect([name, n.rows[0]!.n]).toEqual([name, t.count]);
      }
      // Lista, referência à própria tabela e valores exatos voltam iguais.
      const parts = await target.select().from(s.transactions).where(eq(s.transactions.splitFromId, compraId));
      expect(parts).toHaveLength(1);
      expect(parts[0]!.tags).toEqual(["casa nova", "mercado"]);
      const [original] = await getDb().select().from(s.transactions).where(eq(s.transactions.id, compraId));
      const [copy] = await target.select().from(s.transactions).where(eq(s.transactions.id, compraId));
      expect(copy).toEqual(original);
      await expect(restoreIntoEmptyDatabase(target, json)).rejects.toThrow(/já tem dados/);
    } finally {
      await pool.end();
    }
  });
});
