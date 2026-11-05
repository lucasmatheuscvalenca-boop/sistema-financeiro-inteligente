import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createAccount } from "@/server/services/accounts";
import { createCard } from "@/server/services/cards";
import { listCategories } from "@/server/services/categories";
import { categorizeUncategorized } from "@/server/services/categorize";
import { getHome } from "@/server/services/home";
import { commitImport } from "@/server/services/imports";
import { createRecurrence } from "@/server/services/recurrences";
import { getSpending } from "@/server/services/spending";
import { createTransaction, listTransactions, updateTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const byName = async (u: Awaited<ReturnType<typeof createUser>>, name: string) => (await listCategories(u, { includeArchived: true })).find((c) => c.name === name)!;

describe("gastos automáticos", () => {
  it("extrato importado chega categorizado, sem a pessoa escolher nada", async () => {
    const u = await createUser("Gastos Auto");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 500000, initialBalanceDate: "2026-10-01" });
    const csv = "Data;Descrição;Valor\n03/10/2026;UBER *TRIP HELP.UBER.COM;-23,90\n05/10/2026;IFD*IFOOD CLUB;-64,80\n06/10/2026;SUPERMERCADO EXTRA 1234;-497,50\n08/10/2026;NETFLIX.COM;-55,90\n10/10/2026;SALARIO EMPRESA XYZ;8.500,00\n12/10/2026;PIX ENVIADO MARIA S;-300,00\n";
    await commitImport(u, { fileName: "c.csv", content: csv, accountId: cc.id }, []);
    const txs = await listTransactions(u, {});
    const cat = (d: string) => txs.find((t) => t.description === d)!;
    expect(cat("UBER *TRIP HELP.UBER.COM").categoryId).toBe((await byName(u, "Aplicativos")).id);
    expect(cat("IFD*IFOOD CLUB").categoryId).toBe((await byName(u, "Restaurantes e delivery")).id);
    expect(cat("SUPERMERCADO EXTRA 1234").categoryId).toBe((await byName(u, "Mercado")).id);
    expect(cat("NETFLIX.COM").categoryId).toBe((await byName(u, "Assinaturas")).id);
    expect(cat("SALARIO EMPRESA XYZ").categoryId).toBe((await byName(u, "Salário")).id);
    expect(cat("NETFLIX.COM").categoryAuto).toBe(true);
    expect(cat("PIX ENVIADO MARIA S").categoryId).toBeNull();

    const sp = await getSpending(u, "2026-10");
    expect(sp.totalCents).toBe(2390 + 6480 + 49750 + 5590 + 30000);
    expect(sp.categories[0]).toMatchObject({ name: "Mercado", cents: 49750 });
    expect(sp.categories.find((c) => c.name === "Transporte")?.children).toEqual([expect.objectContaining({ name: "Aplicativos", cents: 2390 })]);
    expect(sp.categories.find((c) => c.name === "Sem categoria")?.cents).toBe(30000);
    expect(sp.uncategorizedCount).toBe(1);
    expect(sp.merchants[0]).toMatchObject({ name: "Supermercado Extra", cents: 49750 });
  });

  it("corrigir uma categoria ensina o app; lançamentos antigos sem categoria são preenchidos uma vez por dia", async () => {
    const u = await createUser("Aprende Categoria");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100000, initialBalanceDate: "2026-09-01" });
    const presentes = await byName(u, "Presentes e doações");
    // Lançamento antigo, sem categoria (como os importados antes da categorização existir).
    const [old] = await createTransaction(u, { kind: "expense", amountCents: 4590, date: "2026-09-10", description: "PADARIA CENTRAL", accountId: cc.id });
    const [pix] = await createTransaction(u, { kind: "expense", amountCents: 30000, date: "2026-09-12", description: "PIX ENVIADO MARIA S", accountId: cc.id });
    expect(old!.categoryId).toBeNull();
    const r = await categorizeUncategorized(u, { force: true });
    expect(r.filled).toBe(1);
    const padaria = (await listTransactions(u, {})).find((t) => t.id === old!.id)!;
    expect(padaria.categoryId).toBe((await byName(u, "Restaurantes e delivery")).id);
    expect(padaria.categoryAuto).toBe(true);

    // A pessoa diz que o Pix para a Maria é presente: a próxima linha parecida já vem assim.
    await updateTransaction(u, pix!.id, { categoryId: presentes.id });
    expect((await listTransactions(u, {})).find((t) => t.id === pix!.id)!.categoryAuto).toBe(false);
    const csv = "Data;Descrição;Valor\n03/10/2026;PIX ENVIADO MARIA S;-150,00\n";
    await commitImport(u, { fileName: "c.csv", content: csv, accountId: cc.id }, []);
    const novo = (await listTransactions(u, { month: "2026-10" }))[0]!;
    expect(novo.categoryId).toBe(presentes.id);
    expect(novo.categoryAuto).toBe(true);
    // Sem forçar, não roda de novo no mesmo dia.
    expect((await categorizeUncategorized(u)).checked).toBe(0);
  });

  it("assinaturas aparecem em Gastos quando a cobrança se repete", async () => {
    const u = await createUser("Assinaturas");
    const card = await createCard(u, { name: "Nubank", limitCents: 500000, closingDay: 25, dueDay: 5 });
    for (const d of ["2026-08-14", "2026-09-14", "2026-10-14"]) await createTransaction(u, { kind: "expense", amountCents: 5590, date: d, description: "NETFLIX.COM", cardId: card.id });
    await createTransaction(u, { kind: "expense", amountCents: 12000, date: "2026-10-03", description: "MERCADO", cardId: card.id });
    const sp = await getSpending(u, "2026-10");
    expect(sp.subscriptions.map((x) => [x.name, x.amountCents, x.day])).toEqual([["Netflix", 5590, 14]]);
    expect(sp.averageCents).toBe(5590);
  });
});

describe("início mínimo", () => {
  it("pode gastar até o próximo salário, gastos do mês, próximos 7 dias úteis e uma dica", async () => {
    const u = await createUser("Inicio Minimo"); // hoje: 2026-10-21 (quarta)
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 300000, initialBalanceDate: "2026-10-01" });
    await createRecurrence(u, { kind: "income", amountCents: 500000, description: "Salário", frequency: "monthly", startDate: "2026-01-05", accountId: cc.id });
    await createRecurrence(u, { kind: "expense", amountCents: 150000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-28", accountId: cc.id });
    await createRecurrence(u, { kind: "expense", amountCents: 12000, description: "Internet", frequency: "monthly", startDate: "2026-01-25", accountId: cc.id });
    await createTransaction(u, { kind: "expense", amountCents: 8000, date: "2026-10-15", description: "DROGASIL", accountId: cc.id });
    const home = await getHome(u);
    expect(home.canSpend).not.toBeNull();
    // Próximo salário: 05/11. Até lá saem aluguel (28/10) e internet (25/10): 3.000 − 1.620 − margem.
    expect(home.canSpend!.untilDate).toBe("2026-11-05");
    expect(home.canSpend!.untilLabel).toMatch(/dia 5/);
    expect(home.canSpend!.cents).toBeGreaterThan(0);
    expect(home.canSpend!.cents).toBeLessThanOrEqual(300000 - 150000 - 12000);
    // 7 dias úteis a partir de quarta 21/10 = sexta 30/10: internet (25) e aluguel (28) entram.
    expect(home.upcomingUntil).toBe("2026-10-30");
    expect(home.upcoming.map((x) => x.label)).toEqual(["Internet", "Aluguel"]);
    expect(home.spending.totalCents).toBe(8000);
    expect(home.spending.categories[0]!.name).toBe("Saúde");
    expect(home.tip.message.length).toBeGreaterThan(10);
    expect(home.uncategorized).toBe(0);
  });
});
