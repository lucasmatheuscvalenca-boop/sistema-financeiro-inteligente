/** O schema Drizzle precisa espelhar exatamente as tabelas criadas pelas migrations. */
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { schema } from "../src";
import { openClients } from "./helpers";

const { admin, app } = openClients();
afterAll(async () => {
  await app.close();
  await admin.end({ timeout: 5 });
});

describe("deriva schema Drizzle × banco", () => {
  for (const table of Object.values(schema.allTables)) {
    const config = getTableConfig(table);
    it(`${config.name}: mesmas colunas, tipos de nulidade e RLS ativa`, async () => {
      const rows = await admin<{ column_name: string; is_nullable: string }[]>`
        select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = ${config.name}`;
      const db = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
      const drizzle = Object.fromEntries(config.columns.map((c) => [c.name, !c.notNull]));
      expect(drizzle).toEqual(db);

      const [rls] = await admin<{ relrowsecurity: boolean }[]>`
        select relrowsecurity from pg_class where oid = ${`public.${config.name}`}::regclass`;
      expect(rls?.relrowsecurity).toBe(true);
    });
  }
});
