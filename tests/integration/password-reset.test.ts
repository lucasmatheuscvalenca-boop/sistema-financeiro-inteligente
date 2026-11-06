import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSession, validateSessionToken } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { setMailer, type EmailMessage } from "@/server/email/mailer";
import { RateLimitError, UnauthorizedError, ValidationError } from "@/server/errors";
import { EmailUnavailableError, requestPasswordReset, resetPasswordWithCode } from "@/server/services/password-reset";
import { authenticate } from "@/server/services/users";
import { createUser } from "./helpers";

let sent: EmailMessage[] = [];
beforeEach(() => {
  sent = [];
  setMailer({ id: "teste", send: async (m) => void sent.push(m) });
});
afterEach(() => setMailer(undefined));
afterAll(async () => {
  await closeDb();
});

const codeFrom = (m: EmailMessage) => m.text.match(/Seu código: (\d{6})/)![1]!;

describe("esqueci minha senha", () => {
  it("envia um código, troca a senha com ele e encerra as sessões antigas", async () => {
    const db = getDb();
    const u = await createUser("Esqueceu Senha");
    const old = await createSession(db, u.userId);

    await requestPasswordReset(db, { email: `  ${u.email.toUpperCase()} ` });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(u.email);
    const code = codeFrom(sent[0]!);
    expect(sent[0]!.subject).toContain(code);
    expect(sent[0]!.html).toContain(code);

    // o banco guarda só o hash do código
    const [row] = await db.select().from(s.passwordResets).where(eq(s.passwordResets.userId, u.userId));
    expect(row!.codeHash).not.toContain(code);

    const user = await resetPasswordWithCode(db, { email: u.email, code: `${code.slice(0, 3)} ${code.slice(3)}`, password: "nova-senha-456" });
    expect(user.id).toBe(u.userId);
    await expect(authenticate(db, { email: u.email, password: u.password })).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await authenticate(db, { email: u.email, password: "nova-senha-456" })).id).toBe(u.userId);
    expect(await validateSessionToken(db, old.token)).toBeNull();

    // o código só vale uma vez
    await expect(resetPasswordWithCode(db, { email: u.email, code, password: "outra-senha-789" })).rejects.toThrow(/incorreto ou expirado/);
  });

  it("e-mail sem conta: mesma resposta e nenhum envio", async () => {
    const r = await requestPasswordReset(getDb(), { email: "ninguem.aqui@exemplo.com" });
    expect(r.email).toBe("ninguem.aqui@exemplo.com");
    expect(sent).toHaveLength(0);
    await expect(resetPasswordWithCode(getDb(), { email: "ninguem.aqui@exemplo.com", code: "123456", password: "nova-senha-456" })).rejects.toThrow(/incorreto ou expirado/);
  });

  it("código errado conta tentativas e bloqueia na quinta, sempre com a mesma mensagem", async () => {
    const db = getDb();
    const u = await createUser("Tentativas Senha");
    await requestPasswordReset(db, { email: u.email });
    const code = codeFrom(sent[0]!);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(resetPasswordWithCode(db, { email: u.email, code: wrong, password: "nova-senha-456" })).rejects.toThrow(/incorreto ou expirado/);
    const [row] = await db.select().from(s.passwordResets).where(eq(s.passwordResets.userId, u.userId));
    expect(row!.attempts).toBe(5);
    // depois de 5 erros, nem o código certo vale
    await expect(resetPasswordWithCode(db, { email: u.email, code, password: "nova-senha-456" })).rejects.toThrow(/incorreto ou expirado/);
    expect((await authenticate(db, { email: u.email, password: u.password })).id).toBe(u.userId);
  });

  it("só o código mais recente vale, e o vencido não serve", async () => {
    const db = getDb();
    const u = await createUser("Dois Codigos");
    await requestPasswordReset(db, { email: u.email });
    await requestPasswordReset(db, { email: u.email });
    const [first, second] = sent.map(codeFrom);
    if (first !== second) await expect(resetPasswordWithCode(db, { email: u.email, code: first!, password: "nova-senha-456" })).rejects.toThrow(/incorreto ou expirado/);

    await db.update(s.passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.passwordResets.userId, u.userId));
    await expect(resetPasswordWithCode(db, { email: u.email, code: second!, password: "nova-senha-456" })).rejects.toThrow(/incorreto ou expirado/);
  });

  it("valida a nova senha e limita pedidos seguidos", async () => {
    const db = getDb();
    const u = await createUser("Limite Senha");
    await requestPasswordReset(db, { email: u.email });
    await expect(resetPasswordWithCode(db, { email: u.email, code: codeFrom(sent[0]!), password: "123" })).rejects.toBeInstanceOf(ValidationError);
    await requestPasswordReset(db, { email: u.email });
    await requestPasswordReset(db, { email: u.email });
    await expect(requestPasswordReset(db, { email: u.email })).rejects.toBeInstanceOf(RateLimitError);
    await expect(requestPasswordReset(db, { email: "nao-e-email" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("sem envio de e-mail configurado, avisa que a recuperação está indisponível", async () => {
    setMailer(null);
    const u = await createUser("Sem Email");
    await expect(requestPasswordReset(getDb(), { email: u.email })).rejects.toBeInstanceOf(EmailUnavailableError);
  });
});
