import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createAccount } from "@/server/services/accounts";
import { listCategories } from "@/server/services/categories";
import { commitImport } from "@/server/services/imports";
import { estimateMonthlyBasis } from "@/server/services/planning";
import { createTransaction, listTransactions, updateTransaction } from "@/server/services/transactions";
import { at, createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("despesa essencial vem da categoria", () => {
  it("importação marca como essencial o que cai numa categoria essencial, e a reserva enxerga", async () => {
    const u = await createUser("Essencial Importado");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceDate: "2026-08-01" });
    const csv = "Data;Descrição;Valor\n10/09/2026;SUPERMERCADO BOM PRECO;-300,00\n12/09/2026;CINEMARK SHOPPING;-80,00\n15/09/2026;SALARIO;5.000,00\n";
    await commitImport(u, { fileName: "set.csv", content: csv, accountId: cc.id }, []);
    const txs = await listTransactions(u, {});
    const by = (d: string) => txs.find((t) => t.description === d)!;
    expect(by("SUPERMERCADO BOM PRECO").essential).toBe(true);
    expect(by("CINEMARK SHOPPING").essential).toBe(false);
    expect(by("SALARIO").essential).toBeNull();
    // Antes, a despesa importada ficava sem a marcação e o essencial do mês dava zero.
    expect((await estimateMonthlyBasis(at(u, "2026-10-21"))).essentialCents).toBe(30000);
  });

  it("trocar a categoria troca também a marcação de essencial", async () => {
    const u = await createUser("Essencial Troca");
    const cc = await createAccount(u, { name: "Corrente", type: "checking" });
    const cats = await listCategories(u, { kind: "expense" });
    const mercado = cats.find((c) => c.name === "Mercado")!;
    const lazer = cats.find((c) => c.name === "Lazer")!;
    const [tx] = await createTransaction(u, { kind: "expense", amountCents: 5000, date: "2026-10-10", description: "Compra", accountId: cc.id });
    expect(tx!.essential).toBe(false);
    expect((await updateTransaction(u, tx!.id, { categoryId: mercado.id })).essential).toBe(true);
    expect((await updateTransaction(u, tx!.id, { categoryId: lazer.id })).essential).toBe(false);
    // Marcação feita à mão junto com a troca vale mais que a da categoria.
    expect((await updateTransaction(u, tx!.id, { categoryId: mercado.id, essential: false })).essential).toBe(false);
  });

  it("a migração 0008 corrige os lançamentos que já existem", async () => {
    const u = await createUser("Essencial Migracao");
    const cc = await createAccount(u, { name: "Corrente", type: "checking" });
    const cats = await listCategories(u, { kind: "expense" });
    const mercado = cats.find((c) => c.name === "Mercado")!;
    const lazer = cats.find((c) => c.name === "Lazer")!;
    const db = getDb();
    const base = { userId: u.userId, status: "realized", date: "2026-10-10", accountId: cc.id, source: "connector" };
    const rows = await db
      .insert(s.transactions)
      .values([
        { ...base, kind: "expense", amountCents: 100, description: "vazio essencial", categoryId: mercado.id, essential: null },
        { ...base, kind: "expense", amountCents: 200, description: "vazio lazer", categoryId: lazer.id, essential: null },
        { ...base, kind: "expense", amountCents: 300, description: "antigo falso", categoryId: mercado.id, essential: false, source: "manual" },
        { ...base, kind: "expense", amountCents: 400, description: "marcado a mao", categoryId: lazer.id, essential: true, source: "manual" },
        { ...base, kind: "expense", amountCents: 500, description: "sem categoria", categoryId: null, essential: null },
        { ...base, kind: "income", amountCents: 600, description: "receita", categoryId: null, essential: null },
      ])
      .returning({ id: s.transactions.id, description: s.transactions.description });
    await db.execute(sql.raw(readFileSync("drizzle/0008_essencial_pela_categoria.sql", "utf8")));
    const after = await db.select({ description: s.transactions.description, essential: s.transactions.essential }).from(s.transactions).where(eq(s.transactions.userId, u.userId));
    const value = (d: string) => after.find((r) => r.description === d)?.essential;
    expect(rows).toHaveLength(6);
    expect(value("vazio essencial")).toBe(true);
    expect(value("vazio lazer")).toBe(false);
    expect(value("antigo falso")).toBe(true);
    expect(value("marcado a mao")).toBe(true);
    expect(value("sem categoria")).toBeNull();
    expect(value("receita")).toBeNull();
  });
});
