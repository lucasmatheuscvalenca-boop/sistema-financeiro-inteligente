import { afterAll, describe, expect, it } from "vitest";
import { getConversationMessages, deleteConversation } from "@/server/ai/assistant";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { transactionsCsv } from "@/server/services/reports";
import { getTransaction, listTransactions, transactionFiltersFrom } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("ids inválidos vindos do endereço", () => {
  it("filtros com id inválido são ignorados em vez de derrubar a página", async () => {
    const u = await createUser("Filtro Invalido");
    const cc = await createAccount(u, { name: "Conta", type: "checking" });
    const f = transactionFiltersFrom({ conta: "abc", cartao: "1 OR 1=1", categoria: "nao-e-uuid", tipo: "qualquer", status: "x", origem: "y" }, "2026-10");
    expect(f).toMatchObject({ month: "2026-10", accountId: undefined, cardId: undefined, categoryId: undefined, kind: undefined, status: undefined, source: undefined });
    await expect(listTransactions(u, f)).resolves.toEqual([]);
    // Os válidos continuam valendo.
    expect(transactionFiltersFrom({ conta: cc.id, categoria: "sem", tipo: "expense" }, "2026-10")).toMatchObject({ accountId: cc.id, categoryId: "none", kind: "expense" });
  });

  it("lançamento ou conversa com id inválido: não encontrado, não erro do banco", async () => {
    const u = await createUser("Id Invalido");
    await expect(getTransaction(u, "abc")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getConversationMessages(u, "abc")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteConversation(u, "' or 1=1 --")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("exportação de lançamentos em CSV", () => {
  it("exporta todos os lançamentos do mês, além de 1.000, e neutraliza fórmulas", async () => {
    const u = await createUser("CSV Grande");
    const cc = await createAccount(u, { name: "Conta", type: "checking" });
    const rows = Array.from({ length: 1205 }, (_, i) => ({
      userId: u.userId,
      kind: "expense",
      status: "realized",
      amountCents: 100 + i,
      date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      description: i === 0 ? "=HYPERLINK(\"http://golpe\",\"clique\")" : `Compra ${i}`,
      accountId: cc.id,
      source: "import",
    }));
    await getDb().insert(s.transactions).values(rows);
    const csv = await transactionsCsv(u, "2026-10");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1 + 1205);
    // Nenhum lançamento repetido nem perdido entre as páginas.
    expect(new Set(lines.slice(1).map((l) => l.split(";")[1])).size).toBe(1205);
    expect(lines.some((l) => l.includes("'=HYPERLINK"))).toBe(true);
    expect(lines.some((l) => /;=HYPERLINK/.test(l) || /;"=HYPERLINK/.test(l))).toBe(false);
    expect(lines.find((l) => l.includes(";Compra 1;"))).toMatch(/;-1,01$/);
  });
});
