import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import type { EmailMessage, Mailer } from "@/server/email/mailer";
import { sendPush, setPushSender, vapidKeys } from "@/server/notifications/push";
import { createAccount } from "@/server/services/accounts";
import { dispatchAlerts, getNotificationSettings, nextSummaryDate, savePushSubscription, sendWeeklySummary, updateNotificationSettings, weekKey } from "@/server/services/notifications";
import { createTransaction } from "@/server/services/transactions";
import { at, createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});
afterEach(() => setPushSender(null));

function fakeMailer() {
  const sent: EmailMessage[] = [];
  const mailer: Mailer = { id: "fake", send: async (m) => void sent.push(m) };
  return { mailer, sent };
}

const device = (n: number) => ({ endpoint: `https://push.exemplo.com/assinatura-${n}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

describe("notificações", () => {
  it("chaves VAPID são geradas uma vez e guardadas cifradas", async () => {
    const a = await vapidKeys(getDb());
    const b = await vapidKeys(getDb());
    expect(a.publicKey).toBe(b.publicKey);
    const [row] = await getDb().select().from(s.appSecrets).where(eq(s.appSecrets.key, "vapid"));
    expect(row!.valueEncrypted).not.toContain(a.privateKey);
  });

  it("envia para os aparelhos e remove o que o serviço de push diz que sumiu", async () => {
    const u = await createUser("Push Aparelhos");
    await savePushSubscription(u, device(1), "Teste");
    await savePushSubscription(u, device(2), "Teste");
    const seen: string[] = [];
    setPushSender(async (sub, payload) => {
      seen.push(payload);
      if (sub.endpoint.includes("assinatura-2")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
    });
    const r = await sendPush(getDb(), u.userId, { title: "Oi", body: "Teste" });
    expect(r).toEqual({ sent: 1, removed: 1 });
    expect(JSON.parse(seen[0]!)).toMatchObject({ title: "Oi", body: "Teste" });
    expect((await getNotificationSettings(u)).devices).toBe(1);
  });

  it("aviso importante vai por notificação e e-mail uma vez só", async () => {
    const u = await createUser("Aviso Importante");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2026-10-01" });
    await createTransaction(u, { kind: "expense", status: "scheduled", amountCents: 500_000, date: "2026-10-25", description: "Aluguel", accountId: cc.id });
    await savePushSubscription(u, device(3), "Teste");
    const pushes: string[] = [];
    setPushSender(async (_sub, payload) => void pushes.push(JSON.parse(payload).title));
    const { mailer, sent } = fakeMailer();
    const first = await dispatchAlerts(u, { mailer, email: u.email, name: "Ana Teste" });
    expect(first.push).toBeGreaterThanOrEqual(1);
    expect(pushes).toContain("Risco de saldo negativo");
    expect(sent.map((m) => m.subject)).toContain("Aviso: Risco de saldo negativo");
    const again = await dispatchAlerts(u, { mailer, email: u.email, name: "Ana Teste" });
    expect(again).toEqual({ push: 0, email: 0 });
  });

  it("respeita as preferências desligadas", async () => {
    const u = await createUser("Sem Avisos");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2026-10-01" });
    await createTransaction(u, { kind: "expense", status: "scheduled", amountCents: 500_000, date: "2026-10-25", description: "Aluguel", accountId: cc.id });
    await savePushSubscription(u, device(4), "Teste");
    await updateNotificationSettings(u, { notifyPush: false, notifyEmail: false, weeklySummary: false });
    setPushSender(async () => {
      throw new Error("não devia enviar");
    });
    const { mailer, sent } = fakeMailer();
    expect(await dispatchAlerts(u, { mailer, email: u.email, name: "X" })).toEqual({ push: 0, email: 0 });
    expect(await sendWeeklySummary(at(u, "2026-10-26"), { mailer, email: u.email, name: "X" })).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("resumo semanal sai na segunda, uma vez por semana", async () => {
    const base = await createUser("Resumo Semanal");
    const u = { ...at(base, "2026-10-26"), email: base.email }; // segunda-feira
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 300_000, initialBalanceDate: "2026-10-01" });
    await createTransaction(u, { kind: "expense", amountCents: 12_000, date: "2026-10-21", description: "Mercado", accountId: cc.id });
    const { mailer, sent } = fakeMailer();
    expect(await sendWeeklySummary(at(u, "2026-10-27"), { mailer, email: u.email, name: "Bia" })).toBe(false); // terça
    expect(await sendWeeklySummary(u, { mailer, email: u.email, name: "Bia" })).toBe(true);
    expect(await sendWeeklySummary(u, { mailer, email: u.email, name: "Bia" })).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/Sua semana: R\$\s120,00 em gastos \(19\/10 a 25\/10\)/);
  });

  it("datas da semana", () => {
    expect(weekKey("2026-11-07")).toBe("2026-11-02");
    expect(weekKey("2026-11-08")).toBe("2026-11-02");
    expect(weekKey("2026-11-09")).toBe("2026-11-09");
    expect(nextSummaryDate("2026-11-07")).toBe("2026-11-09");
    expect(nextSummaryDate("2026-11-09")).toBe("2026-11-16");
  });
});
