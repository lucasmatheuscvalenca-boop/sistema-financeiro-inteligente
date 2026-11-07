import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createCard, listInvoices, updateCard } from "@/server/services/cards";
import { createTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("mudar o fechamento ou o vencimento do cartão", () => {
  it("redistribui as compras das faturas abertas e futuras pelo ciclo novo, sem mexer nas fechadas", async () => {
    // Hoje é 21/10/2026. Cartão fecha dia 25 e vence dia 5.
    const u = await createUser("Ciclo Cartao");
    const card = await createCard(u, { name: "Visa", limitCents: 1_000_000, closingDay: 25, dueDay: 5 });
    await createTransaction(u, { kind: "expense", amountCents: 10000, date: "2026-09-01", description: "Fatura fechada", cardId: card.id });
    await createTransaction(u, { kind: "expense", amountCents: 20000, date: "2026-10-10", description: "Mercado", cardId: card.id });
    await createTransaction(u, { kind: "expense", amountCents: 30000, date: "2026-10-20", description: "Farmácia", cardId: card.id });
    await createTransaction(u, { kind: "expense", amountCents: 90000, date: "2026-10-15", description: "Geladeira", cardId: card.id, installments: 3 });
    const before = await listInvoices(u, card.id);
    expect(before.map((i) => [i.closingDate, i.totalCents])).toEqual([
      ["2026-12-25", 30000],
      ["2026-11-25", 30000],
      ["2026-10-25", 80000],
      ["2026-09-25", 10000],
    ]);

    // Passa a fechar dia 15 e vencer dia 25 (no mesmo mês).
    await updateCard(u, card.id, { closingDay: 15, dueDay: 25 });
    const after = await listInvoices(u, card.id);
    expect(after.map((i) => [i.closingDate, i.dueDate, i.totalCents])).toEqual([
      // Parcelas 2 e 3 seguem a sequência a partir da fatura da compra no ciclo novo.
      ["2027-01-15", "2027-01-25", 30000],
      ["2026-12-15", "2026-12-25", 30000],
      // Compras ainda não cobradas (10/10, 20/10 e a 1ª parcela) ficam na fatura aberta agora.
      ["2026-11-15", "2026-11-25", 80000],
      // A fatura já fechada fica como estava.
      ["2026-09-25", "2026-10-05", 10000],
    ]);
    // Total em aberto continua o mesmo: nada sumiu nem foi contado duas vezes.
    const total = (list: typeof after) => list.reduce((sum, i) => sum + i.totalCents, 0);
    expect(total(after)).toBe(total(before));

    // Só o vencimento muda: as faturas abertas e futuras ganham a nova data.
    await updateCard(u, card.id, { dueDay: 28 });
    const due = await listInvoices(u, card.id);
    expect(due.filter((i) => i.closingDate > "2026-10-21").map((i) => i.dueDate)).toEqual(["2027-01-28", "2026-12-28", "2026-11-28"]);
    expect(due.find((i) => i.closingDate === "2026-09-25")!.dueDate).toBe("2026-10-05");
  });
});
