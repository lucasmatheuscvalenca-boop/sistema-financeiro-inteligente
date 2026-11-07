import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import type { EmailMessage, Mailer } from "@/server/email/mailer";
import type { BankDataProvider } from "@/server/integrations/provider";
import { ProviderError } from "@/server/integrations/provider";
import { registerProvider } from "@/server/integrations/registry";
import { connectProvider } from "@/server/services/connections";
import { purgeStaleData, runDailyRoutine } from "@/server/services/daily-routine";
import { createUser } from "./helpers";

const users: string[] = [];
const env = { ADMIN_EMAIL: process.env.ADMIN_EMAIL, SMTP_USER: process.env.SMTP_USER };

afterEach(() => {
  process.env.ADMIN_EMAIL = env.ADMIN_EMAIL;
  process.env.SMTP_USER = env.SMTP_USER;
});
afterAll(async () => {
  // As conexões deste teste não podem sobrar para a rotina diária de outros arquivos.
  if (users.length) await getDb().delete(s.users).where(inArray(s.users.id, users));
  await closeDb();
});

const DAY = 86_400_000;

describe("rotina diária", () => {
  it("limpa sessões vencidas, tentativas antigas, histórico de sincronização velho e códigos de senha usados", async () => {
    const db = getDb();
    const u = await createUser("Rotina Limpeza");
    users.push(u.userId);
    const live = await createSession(db, u.userId);
    const dead = await createSession(db, u.userId);
    await db.update(s.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.sessions.id, dead.sessionId));
    await db.insert(s.authRateLimits).values([
      { key: `teste-velho:${u.userId}`, attempts: 3, windowStart: new Date(Date.now() - 2 * DAY) },
      { key: `teste-novo:${u.userId}`, attempts: 1, windowStart: new Date() },
    ]);
    const [conn] = await db.insert(s.bankConnections).values({ userId: u.userId, provider: "demo", institutionName: "Demo", isDemo: true, status: "active" }).returning();
    await db.insert(s.bankSyncRuns).values([
      { connectionId: conn!.id, userId: u.userId, status: "success", startedAt: new Date(Date.now() - 91 * DAY) },
      { connectionId: conn!.id, userId: u.userId, status: "success", startedAt: new Date(Date.now() - 10 * DAY) },
    ]);
    await db.insert(s.passwordResets).values([
      { userId: u.userId, codeHash: "usado-ha-2-dias", expiresAt: new Date(Date.now() - 2 * DAY), usedAt: new Date(Date.now() - 2 * DAY) },
      { userId: u.userId, codeHash: "vencido-ha-2-dias", expiresAt: new Date(Date.now() - 2 * DAY) },
      { userId: u.userId, codeHash: "valendo", expiresAt: new Date(Date.now() + 10 * 60_000) },
    ]);

    const r = await purgeStaleData(db);
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    expect(r.rateLimits).toBeGreaterThanOrEqual(1);
    expect(r.syncRuns).toBeGreaterThanOrEqual(1);
    expect(r.passwordResets).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(s.sessions).where(eq(s.sessions.userId, u.userId))).map((x) => x.id)).toEqual([live.sessionId]);
    expect((await db.select().from(s.authRateLimits).where(inArray(s.authRateLimits.key, [`teste-velho:${u.userId}`, `teste-novo:${u.userId}`]))).map((x) => x.key)).toEqual([`teste-novo:${u.userId}`]);
    expect(await db.select().from(s.bankSyncRuns).where(eq(s.bankSyncRuns.connectionId, conn!.id))).toHaveLength(1);
    expect((await db.select().from(s.passwordResets).where(eq(s.passwordResets.userId, u.userId))).map((x) => x.codeHash)).toEqual(["valendo"]);
  });

  it("conexão que termina com erro gera um e-mail curto para o dono, sem valores; falha no envio não derruba a rotina", async () => {
    const state = { fail: false };
    const provider: BankDataProvider = {
      id: "banco-rotina",
      label: "Banco da rotina",
      isDemo: false,
      isConfigured: () => true,
      connect: async () => ({ externalRef: "item-rotina", institutionName: "Banco Rotina", consent: { scopes: [], purpose: "teste", expiresAt: null, providerConsentId: null } }),
      fetchAccounts: async () => {
        if (state.fail) throw new ProviderError("Fornecedor indisponível (503)", "unavailable");
        return [{ externalId: "c1", name: "Conta", type: "checking", balanceCents: 123456 }];
      },
      fetchTransactions: async () => [{ externalId: "t1", accountExternalId: "c1", date: "2026-10-10", description: "MERCADO", amountCents: -98765 }],
      revoke: async () => {},
    };
    registerProvider(provider);
    const u = await createUser("Rotina Aviso");
    users.push(u.userId);
    await connectProvider(u, "banco-rotina", { consentAccepted: true });

    const sent: EmailMessage[] = [];
    const mailer: Mailer = { id: "teste", send: async (m) => void sent.push(m) };
    process.env.ADMIN_EMAIL = "dono@exemplo.com";

    // Banco funcionando: nenhum aviso sobre ele. (Outros testes podem ter deixado conexões no banco
    // de teste; por isso a conferência é sobre esta conexão.)
    await runDailyRoutine(getDb(), { mailer });
    expect(sent.some((m) => m.text.includes("Banco Rotina"))).toBe(false);

    state.fail = true;
    sent.length = 0;
    const r = await runDailyRoutine(getDb(), { mailer });
    expect(r).toMatchObject({ healthy: false, notified: true });
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(r.cleanup).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("dono@exemplo.com");
    expect(sent[0]!.text).toContain("Banco Rotina: Fornecedor indisponível (503)");
    expect(`${sent[0]!.subject}${sent[0]!.text}${sent[0]!.html}`).not.toMatch(/R\$|1\.234|987,65|1234,56/);

    // Sem ADMIN_EMAIL, vai para o endereço de envio (SMTP_USER).
    delete process.env.ADMIN_EMAIL;
    process.env.SMTP_USER = "envio@exemplo.com";
    await runDailyRoutine(getDb(), { mailer });
    expect(sent.at(-1)!.to).toBe("envio@exemplo.com");

    // Carteiro fora do ar: a rotina termina mesmo assim.
    const broken: Mailer = { id: "quebrado", send: async () => Promise.reject(new Error("smtp fora do ar")) };
    await expect(runDailyRoutine(getDb(), { mailer: broken })).resolves.toMatchObject({ healthy: false, notified: false });
  });
});
