import { randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { getMailer, type EmailMessage } from "../email/mailer";
import { AppError, ValidationError, zodToValidation } from "../errors";
import { audit } from "../security/audit";
import { hashPassword, sha256 } from "../security/crypto";
import { consumeRateLimit } from "../security/rate-limit";
import { passwordSchema } from "./users";

export const RESET_CODE_TTL_MINUTES = 15;
export const RESET_MAX_ATTEMPTS = 5;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido")).pipe(z.string().max(254));

/** Hash do código com a chave da aplicação: um vazamento só do banco não revela os códigos. */
function codeHash(userId: string, code: string): string {
  return sha256(`${process.env.APP_ENCRYPTION_KEY ?? ""}:redefinir-senha:${userId}:${code}`);
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export class EmailUnavailableError extends AppError {
  constructor() {
    super("A recuperação de senha por e-mail ainda não está ativa neste app.", "unavailable");
  }
}

export function resetEmail(name: string, code: string): Omit<EmailMessage, "to"> {
  const first = name.split(" ")[0] || "Olá";
  const subject = `Seu código do Meu Banqueiro: ${code}`;
  const text = [
    `${first}, recebemos um pedido para redefinir a senha da sua conta no Meu Banqueiro.`,
    "",
    `Seu código: ${code}`,
    "",
    `Ele vale por ${RESET_CODE_TTL_MINUTES} minutos e só pode ser usado uma vez.`,
    "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
  ].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#0f1f1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6dfcf;border-radius:12px">
<tr><td style="background:#0b3a30;border-radius:12px 12px 0 0;padding:20px 28px;color:#ffffff;font-size:20px">Meu Banqueiro</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(first)}, recebemos um pedido para redefinir a senha da sua conta.</p>
<p style="margin:0 0 8px;font-size:14px;color:#55615c">Seu código:</p>
<p style="margin:0 0 20px;font-size:34px;letter-spacing:8px;font-weight:bold;color:#0b3a30">${code}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#55615c">Ele vale por ${RESET_CODE_TTL_MINUTES} minutos e só pode ser usado uma vez.</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#55615c">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Pede o código. A resposta é a mesma exista ou não a conta (não revela quem tem cadastro).
 * O envio do e-mail é entregue a `schedule`, que na action roda depois da resposta (`after`),
 * para o tempo de resposta também não revelar nada.
 */
export async function requestPasswordReset(
  db: Database,
  input: { email: string },
  meta: { ipHash?: string | null } = {},
  schedule: (task: () => Promise<void>) => void | Promise<void> = (task) => task(),
): Promise<{ email: string }> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) throw new ValidationError("Informe um e-mail válido", { email: "Informe um e-mail válido" });
  const email = parsed.data;
  const mailer = getMailer();
  if (!mailer) throw new EmailUnavailableError();
  if (meta.ipHash) await consumeRateLimit(db, `reset-ip:${meta.ipHash}`, 10, 3600);
  await consumeRateLimit(db, `reset-email:${sha256(email)}`, 3, 900);

  const [user] = await db.select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  if (!user) return { email };

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  // Só o código mais recente vale.
  await db.delete(s.passwordResets).where(and(eq(s.passwordResets.userId, user.id), isNull(s.passwordResets.usedAt)));
  await db.insert(s.passwordResets).values({ userId: user.id, codeHash: codeHash(user.id, code), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000) });
  await audit(db, { userId: user.id, action: "auth.password_reset_requested", ipHash: meta.ipHash });

  await schedule(async () => {
    try {
      await mailer.send({ to: user.email, ...resetEmail(user.name, code) });
    } catch (e) {
      console.error("[senha] falha ao enviar o código", { mailer: mailer.id, error: e instanceof Error ? e.name : "desconhecido", code: (e as { code?: unknown })?.code });
    }
  });
  return { email };
}

const resetSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().length(6, "O código tem 6 números")),
  password: passwordSchema,
});

/** Mesma mensagem para código errado, vencido, já usado ou conta inexistente: não revela quem tem cadastro. */
const INVALID = "Código incorreto ou expirado. Confira o último e-mail recebido ou peça um novo código.";

/** Confere o código e troca a senha. Encerra todas as sessões abertas da conta. */
export async function resetPasswordWithCode(
  db: Database,
  input: { email: string; code: string; password: string },
  meta: { ipHash?: string | null } = {},
): Promise<{ id: string; email: string; name: string }> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) throw zodToValidation(parsed.error);
  const { email, code, password } = parsed.data;
  if (meta.ipHash) await consumeRateLimit(db, `reset-verify-ip:${meta.ipHash}`, 30, 900);
  await consumeRateLimit(db, `reset-verify:${sha256(email)}`, 10, 900);

  const [user] = await db.select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  if (!user) throw new ValidationError(INVALID, { code: INVALID });
  const [reset] = await db
    .select()
    .from(s.passwordResets)
    .where(and(eq(s.passwordResets.userId, user.id), isNull(s.passwordResets.usedAt), gt(s.passwordResets.expiresAt, new Date())))
    .orderBy(desc(s.passwordResets.createdAt))
    .limit(1);
  if (!reset || reset.attempts >= RESET_MAX_ATTEMPTS) throw new ValidationError(INVALID, { code: INVALID });

  if (!sameHash(reset.codeHash, codeHash(user.id, code))) {
    await db.update(s.passwordResets).set({ attempts: reset.attempts + 1 }).where(eq(s.passwordResets.id, reset.id));
    throw new ValidationError(INVALID, { code: INVALID });
  }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(s.users).set({ passwordHash, updatedAt: new Date() }).where(eq(s.users.id, user.id));
    await tx.update(s.passwordResets).set({ usedAt: new Date() }).where(eq(s.passwordResets.id, reset.id));
    await tx.delete(s.passwordResets).where(and(eq(s.passwordResets.userId, user.id), isNull(s.passwordResets.usedAt)));
    // Quem estava logado com a senha antiga sai de todos os aparelhos.
    await tx.delete(s.sessions).where(eq(s.sessions.userId, user.id));
  });
  await audit(db, { userId: user.id, action: "auth.password_reset", ipHash: meta.ipHash });
  return user;
}
