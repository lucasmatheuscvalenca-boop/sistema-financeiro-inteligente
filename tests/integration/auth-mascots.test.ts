import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createSession, listSessions, validateSessionToken } from "@/server/auth/sessions";
import { ConflictError, UnauthorizedError, ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { makeContext } from "@/server/services/context";
import { createGoal, listGoals } from "@/server/services/goals";
import { completeOnboarding, getPreferences, mascotHistory, selectMascot } from "@/server/services/preferences";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { authenticate, changePassword, deleteAccount, exportUserData, registerUser } from "@/server/services/users";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("autenticação e sessões", () => {
  it("cadastra, autentica e valida sessão", async () => {
    const db = getDb();
    const u = await createUser("Lucas");
    const auth = await authenticate(db, { email: u.email.toUpperCase(), password: u.password });
    expect(auth.id).toBe(u.userId);
    const session = await createSession(db, auth.id, { userAgent: "teste" });
    const valid = await validateSessionToken(db, session.token);
    expect(valid?.user.id).toBe(u.userId);
    expect(await validateSessionToken(db, "token-invalido-que-nao-existe-123")).toBeNull();
    // o banco guarda só o hash do token
    const [row] = await db.select().from(s.sessions).where(eq(s.sessions.id, session.sessionId));
    expect(row!.id).not.toBe(session.token);
  });

  it("cria categorias padrão e preferências sem mascote pré-selecionado", async () => {
    const u = await createUser("Nova Pessoa");
    const prefs = await getPreferences(u);
    expect(prefs.mascotId).toBeNull();
    const cats = await getDb().select().from(s.categories).where(eq(s.categories.userId, u.userId));
    expect(cats.length).toBeGreaterThan(20);
  });

  it("rejeita senha errada, e-mail duplicado e senha fraca", async () => {
    const db = getDb();
    const u = await createUser("Duplicado");
    await expect(authenticate(db, { email: u.email, password: "errada-123456" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(registerUser(db, { name: "Outro", email: u.email, password: "outra-senha-123" })).rejects.toBeInstanceOf(ConflictError);
    await expect(registerUser(db, { name: "Fraca", email: "fraca@exemplo.com", password: "123" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("limita tentativas de login", async () => {
    const db = getDb();
    const u = await createUser("Bloqueio");
    for (let i = 0; i < 10; i++) {
      await expect(authenticate(db, { email: u.email, password: `errada-${i}-xyz` })).rejects.toBeInstanceOf(UnauthorizedError);
    }
    await expect(authenticate(db, { email: u.email, password: u.password })).rejects.toThrow(/Muitas tentativas/);
  });

  it("trocar a senha encerra as outras sessões", async () => {
    const db = getDb();
    const u = await createUser("Troca Senha");
    const s1 = await createSession(db, u.userId);
    await createSession(db, u.userId);
    await changePassword(u, { current: u.password, next: "nova-senha-456" }, s1.sessionId);
    const sessions = await listSessions(db, u.userId);
    expect(sessions.map((x) => x.id)).toEqual([s1.sessionId]);
    await expect(authenticate(db, { email: u.email, password: "nova-senha-456" })).resolves.toBeTruthy();
  });

  it("exporta e exclui todos os dados da conta", async () => {
    const db = getDb();
    const u = await createUser("Excluir");
    const acc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 1000 });
    await createTransaction(u, { kind: "expense", amountCents: 500, date: "2026-10-20", description: "Café", accountId: acc.id });
    const exported = await exportUserData(u);
    expect((exported.transactions as unknown[]).length).toBe(1);
    await expect(deleteAccount(u, "senha-errada")).rejects.toBeInstanceOf(ValidationError);
    await deleteAccount(u, u.password);
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from transactions where user_id = ${u.userId}`)).rows as [{ n: number }];
    expect(n).toBe(0);
    expect((await db.select().from(s.users).where(eq(s.users.id, u.userId))).length).toBe(0);
  });
});

describe("mascotes", () => {
  it("persiste a confirmação do Banqueiro entre sessões e dispositivos", async () => {
    const u = await createUser("Escolha");
    await selectMascot(u, "banqueiro");
    // Novo contexto = outra sessão/dispositivo: a preferência vem do banco.
    const other = makeContext(getDb(), u.userId);
    expect((await getPreferences(other)).mascotId).toBe("banqueiro");
  });

  it("a confirmação é por conta: uma conta nova continua sem consultor confirmado", async () => {
    const lucas = await createUser("Lucas");
    const namorada = await createUser("Namorada");
    await selectMascot(lucas, "banqueiro");
    expect((await getPreferences(lucas)).mascotId).toBe("banqueiro");
    expect((await getPreferences(namorada)).mascotId).toBeNull();
  });

  it("ids legados gravados no banco aparecem como O Banqueiro", async () => {
    const u = await createUser("Legado");
    await getDb().update(s.userPreferences).set({ mascotId: "coruja", mascotSelectedAt: new Date() }).where(eq(s.userPreferences.userId, u.userId));
    expect((await getPreferences(u)).mascotId).toBe("banqueiro");
  });

  it("rejeita identificadores inválidos no serviço e no banco", async () => {
    const u = await createUser("Invalido");
    await expect(selectMascot(u, "dragao")).rejects.toBeInstanceOf(ValidationError);
    await expect(selectMascot(u, "lince")).rejects.toBeInstanceOf(ValidationError);
    await expect(selectMascot(u, "")).rejects.toBeInstanceOf(ValidationError);
    await expect(selectMascot(u, null)).rejects.toBeInstanceOf(ValidationError);
    // Mesmo contornando o serviço, a chave estrangeira impede valores fora do catálogo.
    await expect(getDb().update(s.userPreferences).set({ mascotId: "dragao" }).where(eq(s.userPreferences.userId, u.userId))).rejects.toThrow();
    await expect(getDb().insert(s.mascots).values({ id: "dragao", name: "Dragão", title: "X", catchphrase: "Y", sortOrder: 7 })).rejects.toThrow();
    const [{ n }] = (await getDb().execute(sql`select count(*)::int as n from mascots`)).rows as [{ n: number }];
    expect(n).toBe(7);
  });

  it("confirmar de novo não apaga dados e fica no histórico", async () => {
    const u = await createUser("Troca");
    await selectMascot(u, "banqueiro");
    const acc = await createAccount(u, { name: "Conta", type: "checking" });
    await createTransaction(u, { kind: "income", amountCents: 100000, date: "2026-10-05", description: "Salário", accountId: acc.id });
    await createGoal(u, { name: "Viagem", targetCents: 500000, targetDate: "2027-03-15" });
    await selectMascot(u, "banqueiro");
    expect((await getPreferences(u)).mascotId).toBe("banqueiro");
    expect(await listTransactions(u)).toHaveLength(1);
    expect(await listGoals(u)).toHaveLength(1);
    expect((await mascotHistory(u)).map((h) => h.mascotId)).toEqual(["banqueiro", "banqueiro"]);
  });

  it("não conclui o onboarding sem a confirmação explícita do consultor", async () => {
    const u = await createUser("Sem Mascote");
    await expect(completeOnboarding(u)).rejects.toBeInstanceOf(ValidationError);
    await selectMascot(u, "banqueiro");
    await completeOnboarding(u);
    expect((await getPreferences(u)).onboardingCompletedAt).not.toBeNull();
  });
});
