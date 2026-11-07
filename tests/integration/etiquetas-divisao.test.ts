import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { createAccount, listAccountsWithBalances } from "@/server/services/accounts";
import { createCard, listInvoices } from "@/server/services/cards";
import { listCategories } from "@/server/services/categories";
import { listTags, normalizeTags, recordSpendDecision, setTransactionTags, spendDecisionHistory, splitTransaction } from "@/server/services/entry-tools";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("etiquetas, divisão de lançamento e decisões", () => {
  it("etiquetas: normaliza, filtra em todos os meses e soma por etiqueta", async () => {
    const u = await createUser("Etiquetas");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 500_000, initialBalanceDate: "2026-09-01" });
    const [a] = await createTransaction(u, { kind: "expense", amountCents: 30_000, date: "2026-09-20", description: "Passagem", accountId: cc.id });
    const [b] = await createTransaction(u, { kind: "expense", amountCents: 12_000, date: "2026-10-05", description: "Hotel", accountId: cc.id });
    expect(normalizeTags("#Viagem Natal, presentes, viagem natal")).toEqual(["viagem natal", "presentes"]);
    await setTransactionTags(u, a!.id, "Viagem Natal");
    await setTransactionTags(u, b!.id, "viagem natal, hotel");
    const filtered = await listTransactions(u, { tag: "viagem natal" });
    expect(filtered.map((t) => t.description).sort()).toEqual(["Hotel", "Passagem"]);
    const tags = await listTags(u);
    expect(tags.find((t) => t.tag === "viagem natal")).toEqual({ tag: "viagem natal", expenseCents: 42_000, count: 2 });
  });

  it("divide uma compra no cartão em categorias sem mudar a fatura nem o saldo", async () => {
    const u = await createUser("Divide Cartao");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2026-10-01" });
    const card = await createCard(u, { name: "Visa", limitCents: 500_000, closingDay: 25, dueDay: 5 });
    const cats = await listCategories(u, { kind: "expense" });
    const mercado = cats.find((c) => c.name === "Mercado")!;
    const casa = cats.find((c) => c.name === "Moradia")!;
    const [compra] = await createTransaction(u, { kind: "expense", amountCents: 28_000, date: "2026-10-10", description: "Supermercado", cardId: card.id });
    await setTransactionTags(u, compra!.id, "casa nova");
    const before = (await listInvoices(u, card.id)).find((i) => i.id === compra!.invoiceId)!.totalCents;
    await expect(splitTransaction(u, compra!.id, { parts: [{ amountCents: 20_000, categoryId: mercado.id }, { amountCents: 7_000, categoryId: casa.id }] })).rejects.toBeInstanceOf(ValidationError);
    const ids = await splitTransaction(u, compra!.id, { parts: [{ amountCents: 20_000, categoryId: mercado.id }, { amountCents: 8_000, categoryId: casa.id }] });
    expect(ids).toHaveLength(2);
    const after = (await listInvoices(u, card.id)).find((i) => i.id === compra!.invoiceId)!.totalCents;
    expect(after).toBe(before);
    const rows = await listTransactions(u, { month: "2026-10" });
    const parts = rows.filter((r) => r.description === "Supermercado");
    expect(parts.map((p) => [p.amountCents, p.categoryId]).sort()).toEqual([[20_000, mercado.id], [8_000, casa.id]].sort());
    expect(parts.find((p) => p.id !== compra!.id)!.splitFromId).toBe(compra!.id);
    expect(parts.every((p) => p.tags.includes("casa nova"))).toBe(true);
    expect((await listAccountsWithBalances(u)).find((a) => a.id === cc.id)!.balanceCents).toBe(100_000);
  });

  it("não divide parcelas nem transferências; categoria precisa ser do mesmo tipo", async () => {
    const u = await createUser("Divide Limites");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2026-10-01" });
    const pp = await createAccount(u, { name: "Poupança", type: "savings" });
    const [t] = await createTransaction(u, { kind: "transfer", amountCents: 1_000, date: "2026-10-10", description: "Guardar", accountId: cc.id, toAccountId: pp.id });
    await expect(splitTransaction(u, t!.id, { parts: [{ amountCents: 500 }, { amountCents: 500 }] })).rejects.toBeInstanceOf(ValidationError);
    const salario = (await listCategories(u, { kind: "income" }))[0]!;
    const [e] = await createTransaction(u, { kind: "expense", amountCents: 1_000, date: "2026-10-10", description: "Farmácia", accountId: cc.id });
    await expect(splitTransaction(u, e!.id, { parts: [{ amountCents: 500, categoryId: salario.id }, { amountCents: 500 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("histórico do Posso gastar soma o que a pessoa desistiu de comprar no ano", async () => {
    const u = await createUser("Decisoes");
    await recordSpendDecision(u, { amountCents: 60_000, description: "Tênis", level: "red", maxSafeCents: 20_000, decision: "gave_up" });
    await recordSpendDecision(u, { amountCents: 8_000, description: "Jantar", level: "green", maxSafeCents: 50_000, decision: "bought" });
    const h = await spendDecisionHistory(u);
    expect(h.gaveUpCents).toBe(60_000);
    expect(h.gaveUpCount).toBe(1);
    expect(h.recent.map((r) => r.description)).toEqual(["Jantar", "Tênis"]);
  });
});

describe("gastos anotados sem internet", () => {
  it("registra a fila uma vez só, com categoria, e descarta valores ilegíveis", async () => {
    const { registerOfflineEntries } = await import("@/server/services/quick-entry");
    const u = await createUser("Offline Fila");
    const fila = [
      { id: "11111111-1111-4111-8111-111111111111", amount: "12,50", description: "Padaria", date: "2026-10-20" },
      { id: "22222222-2222-4222-8222-222222222222", amount: "abc", description: "Ilegível", date: "2026-10-20" },
    ];
    // Sem conta: nada é gravado e o gasto válido continua na fila.
    expect(await registerOfflineEntries(u, fila)).toEqual([]);
    await createAccount(u, { name: "Conta", type: "checking" });
    expect((await registerOfflineEntries(u, fila)).sort()).toEqual(fila.map((f) => f.id).sort());
    // Reenvio (a rede caiu antes da resposta) não duplica.
    expect(await registerOfflineEntries(u, fila)).toContain(fila[0]!.id);
    const txs = await listTransactions(u, {});
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ description: "Padaria", amountCents: 1_250, date: "2026-10-20" });
  });
});
