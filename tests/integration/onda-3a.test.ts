import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createAccount } from "@/server/services/accounts";
import { createCard } from "@/server/services/cards";
import { listCategories } from "@/server/services/categories";
import { getInstallmentCenter } from "@/server/services/installments";
import { createRecurrence } from "@/server/services/recurrences";
import { getYearInReview } from "@/server/services/retrospective";
import { getTaxHelp } from "@/server/services/tax";
import { createTransaction } from "@/server/services/transactions";
import { getAnnualExpenses } from "@/server/services/yearly";
import { at, createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("onda 3A: telas novas com dados reais do banco", () => {
  it("central de parcelas soma as próximas faturas e mostra quando o parcelamento termina", async () => {
    const u = await createUser("Parcelas");
    const card = await createCard(u, { name: "Visa", limitCents: 500_000, closingDay: 25, dueDay: 5 });
    await createTransaction(u, { kind: "expense", amountCents: 120_000, date: "2026-10-20", description: "Notebook", cardId: card.id, installments: 3 });
    await createTransaction(u, { kind: "expense", amountCents: 5_000, date: "2026-10-21", description: "Padaria", cardId: card.id });
    const c = await getInstallmentCenter(u);
    expect(c.cards[0]!.best.day).toBe(25);
    expect(c.groups).toHaveLength(1);
    expect(c.groups[0]!.description).toBe("Notebook");
    expect(c.groups[0]!.remainingCents).toBe(120_000);
    expect(c.groups[0]!.lastReference).toBe("2027-01");
    // Fatura que vence em novembro: parcela 1 + padaria.
    expect(c.months[0]).toEqual({ reference: "2026-11", installmentsCents: 40_000, otherCents: 5_000 });
    expect(c.months.map((m) => m.installmentsCents)).toEqual([40_000, 40_000, 40_000]);
  });

  it("despesa anual cadastrada vira quanto separar por mês até o vencimento", async () => {
    const u = await createUser("Anuais");
    const cc = await createAccount(u, { name: "Conta", type: "checking" });
    await createRecurrence(u, { kind: "expense", certainty: "estimated", amountCents: 240_000, description: "IPVA", accountId: cc.id, frequency: "yearly", dayOfMonth: 15, startDate: "2027-03-15" });
    const a = await getAnnualExpenses(u);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ name: "IPVA", nextDate: "2027-03-15", months: 5, monthlyCents: 48_000, origin: "registrada" });
    expect(a.monthlyCents).toBe(48_000);
  });

  it("IR: saldo em 31/12 de cada ano, rendimentos por fonte e gastos de saúde", async () => {
    const u = at(await createUser("Imposto"), "2026-02-10");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2024-12-01" });
    const cats = await listCategories(u, { kind: "expense" });
    const saude = cats.find((c) => c.name === "Consultas")!;
    await createTransaction(u, { kind: "income", amountCents: 500_000, date: "2025-06-05", description: "EMPRESA X SALARIO", accountId: cc.id });
    await createTransaction(u, { kind: "expense", amountCents: 30_000, date: "2025-07-01", description: "Dr. Fulano", accountId: cc.id, categoryId: saude.id });
    await createTransaction(u, { kind: "expense", amountCents: 50_000, date: "2026-01-15", description: "Mercado", accountId: cc.id });
    const t = await getTaxHelp(u, 2025);
    expect(t.accounts[0]).toMatchObject({ name: "Conta", previousCents: 100_000, currentCents: 570_000 });
    expect(t.income.totalCents).toBe(500_000);
    expect(t.health.totalCents).toBe(30_000);
    expect(t.health.lines[0]!.category).toBe("Consultas");
  });

  it("retrospectiva lê o ano e os aportes do banco", async () => {
    const u = at(await createUser("Retro"), "2026-12-20");
    const cc = await createAccount(u, { name: "Conta", type: "checking" });
    await createTransaction(u, { kind: "income", amountCents: 300_000, date: "2026-03-05", description: "Salário", accountId: cc.id });
    await createTransaction(u, { kind: "expense", amountCents: 100_000, date: "2026-03-10", description: "Mercado", accountId: cc.id });
    const r = await getYearInReview(u, 2026);
    expect(r.savedCents).toBe(200_000);
    expect(r.bestMonth?.month).toBe("2026-03");
    expect(r.contributedCents).toBe(0);
  });
});
