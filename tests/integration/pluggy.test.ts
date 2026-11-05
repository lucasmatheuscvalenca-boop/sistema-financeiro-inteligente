import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { ProviderError } from "@/server/integrations/provider";
import { deleteCredentials, getStoredCredentials, registerProvider, resolveProvider, saveCredentials } from "@/server/integrations/registry";
import { institutionFromAccounts, PluggyProvider } from "@/server/integrations/providers/pluggy";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { connectProvider, listConnections, syncConnection } from "@/server/services/connections";
import { listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

/**
 * API da Pluggy simulada como ela se comporta no plano pessoal (Meu Pluggy), segundo quem usa com
 * dados reais: item do conector 200, contas com código COMPE, transações só em /v2 paginadas por
 * `next`, compra de cartão com valor positivo.
 */
function fakePluggy(opts: { secret?: string } = {}) {
  const calls: string[] = [];
  const secret = opts.secret ?? "client-secret";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { clientSecret?: string };
      return body.clientSecret === secret ? json({ apiKey: "chave-de-teste" }) : json({ message: "unauthorized" }, 401);
    }
    if ((init?.headers as Record<string, string>)?.["X-API-KEY"] !== "chave-de-teste") return json({ message: "unauthorized" }, 401);
    if (url.pathname === "/connect_token") return json({ accessToken: "token-widget" });
    if (url.pathname === "/items/item-meu-pluggy") return json({ id: "item-meu-pluggy", connector: { id: 200, name: "MeuPluggy" }, status: "UPDATED", consentExpiresAt: "2027-10-01T00:00:00.000Z" });
    if (url.pathname === "/items") return json({ code: 403, message: "LIST_ITEMS_FEATURE_NOT_ENABLED" }, 403);
    if (url.pathname === "/accounts")
      return json({
        results: [
          { id: "acc-corrente", name: "Conta Corrente", marketingName: "Nubank", type: "BANK", subtype: "CHECKING_ACCOUNT", balance: 2500.4, bankData: { transferNumber: "260/0001/12345-6" } },
          { id: "acc-cartao", name: "Cartão", marketingName: "Nubank", type: "CREDIT", subtype: "CREDIT_CARD", balance: 320, creditData: { creditLimit: 5000, balanceCloseDate: "2026-10-25", balanceDueDate: "2026-11-05" } },
        ],
      });
    if (url.pathname === "/transactions") return json({ message: "Gone" }, 410);
    if (url.pathname === "/v2/transactions") {
      for (const forbidden of ["page", "pageSize", "from", "to", "limit"]) if (url.searchParams.has(forbidden)) return json({ message: `property ${forbidden} should not exist` }, 400);
      if (!url.searchParams.get("dateFrom")) return json({ message: "dateFrom required" }, 400);
      if (url.searchParams.get("accountId") === "acc-corrente") {
        if (!url.searchParams.get("cursor"))
          return json({ results: [{ id: "tx-1", date: "2026-10-05T00:00:00.000Z", description: "Salário empresa", amount: 4000, category: "Salary" }], next: "cursor=p2" });
        return json({ results: [{ id: "tx-2", date: "2026-10-12T00:00:00.000Z", description: "Supermercado", amount: -180.35, category: "Groceries" }] });
      }
      // Cartão: compra positiva, pagamento negativo.
      return json({
        results: [
          { id: "tx-3", date: "2026-10-14T00:00:00.000Z", description: "Farmácia", amount: 42.9, category: "Health" },
          { id: "tx-4", date: "2026-10-16T00:00:00.000Z", description: "Pagamento recebido", amount: -300 },
        ],
      });
    }
    return json({ message: "not found" }, 404);
  }) as typeof fetch;
  return { http, calls };
}

describe("Open Finance pela Pluggy (Meu Pluggy, plano gratuito)", () => {
  it("conecta pelo item do widget, descobre o banco pelas contas, lê /v2 com paginação e trata o sinal do cartão", async () => {
    const api = fakePluggy();
    registerProvider(new PluggyProvider("client-id", "client-secret", api.http));
    const u = await createUser("Meu Pluggy");

    await expect(connectProvider(u, "pluggy", { itemId: "item-meu-pluggy", consentAccepted: false })).rejects.toThrow(/autorizar/);
    const { connectionId, sync } = await connectProvider(u, "pluggy", { itemId: "item-meu-pluggy", consentAccepted: true });
    expect(sync).toMatchObject({ ok: true, imported: 3, duplicates: 0 });
    expect(api.calls[0]).toBe("POST /auth");
    expect(api.calls.some((c) => c.startsWith("GET /v2/transactions?accountId=acc-corrente&dateFrom=") && c.includes("cursor=p2"))).toBe(true);
    expect(api.calls.some((c) => c.startsWith("GET /transactions"))).toBe(false);

    const txs = await listTransactions(u, {});
    const byDesc = (d: string) => txs.find((t) => t.description === d);
    expect(byDesc("Salário empresa")).toMatchObject({ kind: "income", amountCents: 4000_00 });
    expect(byDesc("Supermercado")).toMatchObject({ kind: "expense", amountCents: 180_35 });
    expect(byDesc("Farmácia")).toMatchObject({ kind: "expense", amountCents: 42_90 });
    expect(byDesc("Farmácia")?.cardId).toBeTruthy();
    expect(byDesc("Pagamento recebido")).toBeUndefined();
    expect(txs.every((t) => t.kind === "income" || t.categoryId)).toBe(true);

    const accounts = await listAccountsWithBalances(u);
    expect(accounts.some((a) => a.name === "Nubank" && a.institution === "Nubank")).toBe(true);
    const [conn] = await listConnections(u);
    expect(conn).toMatchObject({ provider: "pluggy", isDemo: false, status: "active", institutionName: "Nubank" });

    const again = await syncConnection(u, connectionId);
    expect(again).toMatchObject({ ok: true, imported: 0, duplicates: 3 });
  });

  it("deduz o banco pelo código COMPE ou pelo nome comercial", () => {
    expect(institutionFromAccounts([{ id: "a", name: "x", type: "BANK", balance: 0, bankData: { transferNumber: "077/0001/1-2" } }])).toBe("Inter");
    expect(institutionFromAccounts([{ id: "a", name: "x", marketingName: "Banco Novo", type: "BANK", balance: 0 }])).toBe("Banco Novo");
    expect(institutionFromAccounts([{ id: "a", name: "x", type: "BANK", balance: 0 }])).toBeNull();
  });

  it("chaves por pessoa: confere na Pluggy antes de gravar, ficam cifradas e valem só para a pessoa", async () => {
    const db = getDb();
    const api = fakePluggy({ secret: "segredo-certo" });
    const lucas = await createUser("Chaves Lucas");
    const outra = await createUser("Chaves Outra");

    await expect(saveCredentials(db, lucas.userId, { clientId: "id-do-lucas-1234", clientSecret: "segredo-errado" }, api.http)).rejects.toBeInstanceOf(ProviderError);
    expect(await getStoredCredentials(db, lucas.userId)).toBeNull();

    await saveCredentials(db, lucas.userId, { clientId: "id-do-lucas-1234", clientSecret: "segredo-certo" }, api.http);
    const stored = await getStoredCredentials(db, lucas.userId);
    expect(stored?.clientIdHint).toBe("1234");
    expect(stored?.validatedAt).toBeTruthy();
    const [raw] = (await db.execute(`select client_id_encrypted, client_secret_encrypted from provider_credentials where user_id = '${lucas.userId}'`)).rows as Array<Record<string, string>>;
    expect(raw!.client_id_encrypted).not.toContain("id-do-lucas");
    expect(raw!.client_secret_encrypted).not.toContain("segredo");

    // Sem fornecedor injetado, a resolução usa as chaves da pessoa; a outra pessoa não tem nada.
    registerProvider({ id: "__none__", label: "", isDemo: true, isConfigured: () => false, connect: async () => ({ externalRef: "", institutionName: "", consent: { scopes: [], purpose: "", expiresAt: null, providerConsentId: null } }), fetchAccounts: async () => [], fetchTransactions: async () => [], revoke: async () => {} });
    const mine = await resolveProvider(db, lucas.userId, "pluggy");
    expect(mine?.isConfigured()).toBe(true);
    await deleteCredentials(db, lucas.userId);
    expect(await getStoredCredentials(db, lucas.userId)).toBeNull();
    expect(await getStoredCredentials(db, outra.userId)).toBeNull();
  });
});
