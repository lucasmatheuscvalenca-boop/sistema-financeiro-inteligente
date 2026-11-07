import { and, isNotNull, lt, or } from "drizzle-orm";
import { purgeExpiredSessions } from "../auth/sessions";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { getMailer, type Mailer } from "../email/mailer";
import { syncAllConnections, type SyncAllResult } from "./connections";

const DAY_MS = 86_400_000;

export interface PurgeResult {
  sessions: number;
  rateLimits: number;
  syncRuns: number;
  passwordResets: number;
}

/**
 * Limpeza do que só cresce: sessões vencidas, controles de tentativa com janela de mais de um dia,
 * histórico de sincronizações com mais de 90 dias e códigos de senha usados ou vencidos há mais
 * de um dia. Nada disso é dado financeiro da pessoa.
 */
export async function purgeStaleData(db: Database, now = new Date()): Promise<PurgeResult> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [sessions, rateLimits, syncRuns, passwordResets] = await Promise.all([
    purgeExpiredSessions(db, now),
    db.delete(s.authRateLimits).where(lt(s.authRateLimits.windowStart, dayAgo)).returning({ key: s.authRateLimits.key }),
    db
      .delete(s.bankSyncRuns)
      .where(lt(s.bankSyncRuns.startedAt, new Date(now.getTime() - 90 * DAY_MS)))
      .returning({ id: s.bankSyncRuns.id }),
    db
      .delete(s.passwordResets)
      .where(or(and(isNotNull(s.passwordResets.usedAt), lt(s.passwordResets.usedAt, dayAgo)), lt(s.passwordResets.expiresAt, dayAgo)))
      .returning({ id: s.passwordResets.id }),
  ]);
  return { sessions, rateLimits: rateLimits.length, syncRuns: syncRuns.length, passwordResets: passwordResets.length };
}

/** Quem recebe os avisos da rotina: ADMIN_EMAIL ou, sem ele, o próprio endereço de envio (SMTP_USER). */
export function ownerEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim() || process.env.SMTP_USER?.trim() || null;
}

/**
 * Avisa o dono do app que algo quebrou na rotina diária. Curto e sem valores financeiros: só o banco,
 * o motivo e o que fazer. Falha no envio fica no registro e nunca derruba a rotina.
 */
export async function notifyOwner(problems: string[], mailer: Mailer | null = getMailer()): Promise<boolean> {
  const to = ownerEmail();
  if (!mailer || !to || problems.length === 0) return false;
  const subject = `Meu Banqueiro: ${problems.length === 1 ? "1 problema" : `${problems.length} problemas`} na rotina diária`;
  const text = ["A rotina diária do Meu Banqueiro terminou com problemas:", "", ...problems.map((p) => `- ${p}`), "", "Veja em Mais › Bancos e cartões. Este aviso não contém valores."].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#0f1f1a"><p>A rotina diária do Meu Banqueiro terminou com problemas:</p><ul>${problems
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("")}</ul><p style="color:#55615c">Veja em Mais › Bancos e cartões. Este aviso não contém valores.</p></body></html>`;
  try {
    await mailer.send({ to, subject, text, html });
    return true;
  } catch (e) {
    console.error("[rotina] falha ao enviar o aviso", { mailer: mailer.id, error: e instanceof Error ? e.name : "desconhecido" });
    return false;
  }
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface DailyRoutineResult extends Partial<Omit<SyncAllResult, "failures">> {
  /** Tudo certo: nenhuma conexão com erro e nenhuma etapa falhou. */
  healthy: boolean;
  cleanup: PurgeResult | null;
  notified: boolean;
}

/**
 * Rotina diária (/api/cron/sync): sincroniza todas as conexões, depois limpa o que só cresce e, se
 * alguma conexão terminou com erro ou a rotina falhou, avisa o dono do app por e-mail.
 */
export async function runDailyRoutine(db: Database, opts: { mailer?: Mailer | null } = {}): Promise<DailyRoutineResult> {
  const problems: string[] = [];
  let sync: SyncAllResult | null = null;
  try {
    sync = await syncAllConnections(db);
    for (const f of sync.failures) problems.push(`${f.institution}: ${f.error}`.slice(0, 300));
  } catch (e) {
    console.error("[rotina] sincronização falhou", { error: e instanceof Error ? e.message.slice(0, 200) : "desconhecido" });
    problems.push("A sincronização dos bancos parou com um erro inesperado (veja os registros da Vercel).");
  }
  let cleanup: PurgeResult | null = null;
  try {
    cleanup = await purgeStaleData(db);
  } catch (e) {
    console.error("[rotina] limpeza falhou", { error: e instanceof Error ? e.message.slice(0, 200) : "desconhecido" });
    problems.push("A limpeza de sessões e registros antigos falhou (veja os registros da Vercel).");
  }
  const notified = await notifyOwner(problems, opts.mailer === undefined ? getMailer() : opts.mailer);
  const { failures, ...counts } = sync ?? { failures: [] };
  void failures;
  return { ...counts, healthy: problems.length === 0, cleanup, notified };
}
