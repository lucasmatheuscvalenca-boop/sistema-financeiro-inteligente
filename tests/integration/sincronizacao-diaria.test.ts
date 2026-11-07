import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { registerProvider } from "@/server/integrations/registry";
import { PluggyProvider } from "@/server/integrations/providers/pluggy";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { connectProvider, hasRealConnections, listConnections, reactivateConnection, revokeConnection, syncAllConnections, syncStaleConnections } from "@/server/services/connections";
import { listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

/** API da Pluggy simulada: um item com uma conta e duas movimentações, já com a categoria do banco. */
function fakePluggy(state: { fail: boolean; owner?: string }) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const http = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth") return json({ apiKey: "k" });
    if (state.fail) return json({ message: "down" }, 503);
    if (url.pathname === "/connect_token") return json({ accessToken: "ct-123" });
    if (url.pathname.startsWith("/items/")) return json({ id: "item-1", clientUserId: state.owner, connector: { id: 1, name: "Banco Teste" }, status: "UPDATED", consentExpiresAt: "2027-01-01T00:00:00.000Z" });
    if (url.pathname === "/accounts") return json({ results: [{ id: "acc-1", name: "Conta Teste", type: "BANK", subtype: "CHECKING_ACCOUNT", balance: 1000 }] });
    if (url.pathname === "/v2/transactions")
      return json({
        results: [
          { id: "t1", date: "2026-10-10T00:00:00.000Z", description: "COMPRA XYZ", amount: -50, category: "Groceries" },
          { id: "t2", date: "2026-10-12T00:00:00.000Z", description: "PAGTO", amount: 2000, category: "Salary" },
        ],
      });
    return json({ message: "not found" }, 404);
  }) as typeof fetch;
  return http;
}

describe("Open Finance no app", () => {
  it("a categoria do banco preenche a categoria do Meu Banqueiro, e a rotina diária sincroniza todas as conexões", async () => {
    const state: { fail: boolean; owner?: string } = { fail: false };
    const provider = new PluggyProvider("id", "secret", fakePluggy(state));
    provider.pollIntervalMs = 0;
    registerProvider(provider);
    expect(await provider.createConnectToken({ clientUserId: "u" })).toBe("ct-123");

    const u = await createUser("Cron Sync");
    state.owner = u.userId;
    const { connectionId } = await connectProvider(u, "pluggy", { itemId: "item-1", consentAccepted: true });
    const txs = await listTransactions(u, {});
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.categoryId && t.categoryAuto)).toBe(true);

    const r = await syncAllConnections(getDb());
    expect(r.connections).toBeGreaterThanOrEqual(1);
    expect(r.failed).toBe(0);
    expect(await listTransactions(u, {})).toHaveLength(2);

    // Banco fora do ar: a rotina registra a falha e segue; renovar a autorização reativa a conexão.
    state.fail = true;
    const r2 = await syncAllConnections(getDb());
    expect(r2.failed).toBeGreaterThanOrEqual(1);
    let [conn] = await listConnections(u);
    expect(conn!.status).toBe("error");
    state.fail = false;
    await reactivateConnection(u, connectionId);
    [conn] = await listConnections(u);
    expect(conn!.status).toBe("active");

    // Ao abrir o app: só conexões paradas há mais de 6 h (e sem tentativa nos últimos 30 min) são sincronizadas.
    expect(await hasRealConnections(u)).toBe(true);
    expect(await syncStaleConnections(u)).toEqual({ synced: 0, imported: 0 });
    await getDb().update(s.bankConnections).set({ lastSyncAt: new Date(Date.now() - 7 * 3_600_000) }).where(eq(s.bankConnections.id, connectionId));
    await getDb().update(s.bankSyncRuns).set({ startedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(s.bankSyncRuns.connectionId, connectionId));
    expect(await syncStaleConnections(u)).toEqual({ synced: 1, imported: 0 });

    // Sincronização interrompida no meio (função encerrada): passados 10 minutos em "syncing", a
    // rotina trata como erro e tenta de novo, em vez de deixar a conexão de fora para sempre.
    await getDb().update(s.bankConnections).set({ status: "syncing", updatedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(s.bankConnections.id, connectionId));
    const r4 = await syncAllConnections(getDb());
    expect(r4.connections).toBe(r.connections);
    [conn] = await listConnections(u);
    expect(conn!.status).toBe("active");
    // Uma que acabou de começar continua esperando.
    await getDb().update(s.bankConnections).set({ status: "syncing" }).where(eq(s.bankConnections.id, connectionId));
    expect((await syncAllConnections(getDb())).connections).toBe(r.connections - 1);
    await getDb().update(s.bankConnections).set({ status: "active" }).where(eq(s.bankConnections.id, connectionId));

    // Desconectar tira a conexão da rotina diária.
    await revokeConnection(u, connectionId);
    const r3 = await syncAllConnections(getDb());
    expect(r3.connections).toBe(r.connections - 1);
  });
});
