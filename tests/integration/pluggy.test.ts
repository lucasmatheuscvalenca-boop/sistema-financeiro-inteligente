import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { registerProvider } from "@/server/integrations/registry";
import { PluggyProvider } from "@/server/integrations/providers/pluggy";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { connectProvider, listConnections, syncConnection } from "@/server/services/connections";
import { listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

/** API da Pluggy simulada no formato da documentação pública (auth, items, accounts, transactions). */
function fakePluggy() {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth") return json({ apiKey: "chave-de-teste" });
    if ((init?.headers as Record<string, string>)?.["X-API-KEY"] !== "chave-de-teste") return json({ message: "unauthorized" }, 401);
    if (url.pathname === "/items/item-meu-pluggy") return json({ id: "item-meu-pluggy", connector: { name: "MeuPluggy" }, status: "UPDATED", consentExpiresAt: "2027-10-01T00:00:00.000Z" });
    if (url.pathname === "/accounts")
      return json({
        results: [
          { id: "acc-corrente", name: "Conta Corrente Banco X", type: "BANK", subtype: "CHECKING_ACCOUNT", balance: 2500.4 },
          { id: "acc-cartao", name: "Cartão Banco X", type: "CREDIT", subtype: "CREDIT_CARD", balance: 320, creditData: { creditLimit: 5000, balanceCloseDate: "2026-10-25", balanceDueDate: "2026-11-05" } },
        ],
      });
    if (url.pathname === "/transactions" && url.searchParams.get("accountId") === "acc-corrente")
      return json({
        totalPages: 1,
        results: [
          { id: "tx-1", date: "2026-10-05T00:00:00.000Z", description: "Salário empresa", amount: 4000, type: "CREDIT" },
          { id: "tx-2", date: "2026-10-12T00:00:00.000Z", description: "Supermercado", amount: -180.35, type: "DEBIT" },
        ],
      });
    if (url.pathname === "/transactions") return json({ totalPages: 1, results: [{ id: "tx-3", date: "2026-10-14T00:00:00.000Z", description: "Farmácia", amount: 42.9, type: "DEBIT" }] });
    return json({ message: "not found" }, 404);
  }) as typeof fetch;
  return { http, calls };
}

describe("Open Finance pela Pluggy (Meu Pluggy)", () => {
  it("conecta pelo Item ID, importa contas, cartão e movimentações e não duplica na sincronização seguinte", async () => {
    const api = fakePluggy();
    registerProvider(new PluggyProvider("client-id", "client-secret", api.http));
    const u = await createUser("Meu Pluggy");

    await expect(connectProvider(u, "pluggy", { itemId: "item-meu-pluggy", consentAccepted: false })).rejects.toThrow(/autorizar/);
    const { connectionId, sync } = await connectProvider(u, "pluggy", { itemId: "item-meu-pluggy", consentAccepted: true });
    expect(sync).toMatchObject({ ok: true, imported: 3, duplicates: 0 });
    expect(api.calls[0]).toBe("POST /auth");
    expect(api.calls).toContain("GET /items/item-meu-pluggy");

    const txs = await listTransactions(u, {});
    const byDesc = (d: string) => txs.find((t) => t.description === d);
    expect(byDesc("Salário empresa")).toMatchObject({ kind: "income", amountCents: 4000_00 });
    expect(byDesc("Supermercado")).toMatchObject({ kind: "expense", amountCents: 180_35 });
    expect(byDesc("Farmácia")?.cardId).toBeTruthy();

    const accounts = await listAccountsWithBalances(u);
    expect(accounts.some((a) => a.name === "Conta Corrente Banco X")).toBe(true);

    const again = await syncConnection(u, connectionId);
    expect(again).toMatchObject({ ok: true, imported: 0, duplicates: 3 });
    const [conn] = await listConnections(u);
    expect(conn).toMatchObject({ provider: "pluggy", isDemo: false, status: "active" });
  });
});
