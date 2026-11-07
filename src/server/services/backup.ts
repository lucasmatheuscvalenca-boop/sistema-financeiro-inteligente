import { and, desc, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { checkRestore, dumpDatabase, type RestoreCheck } from "../backup/database";
import { backupPathname, backupsToDelete, openBackup, sealBackup } from "../backup/format";
import { getBackupStorage, type BackupStorage } from "../backup/storage";
import { audit } from "../security/audit";

const DAY_MS = 86_400_000;
/** O teste de restauração roda quando o último bem-sucedido tem mais de 28 dias (uma vez por mês). */
const CHECK_EVERY_MS = 28 * DAY_MS;

export interface BackupRunResult {
  /** Arquivo gravado nesta rodada (sem data/hora não há cópia nova). */
  created: string | null;
  sizeBytes: number;
  tables: number;
  rows: number;
  deleted: number;
  /** Teste de restauração desta rodada (só uma vez por mês). */
  check: RestoreCheck | null;
  skipped?: "not_configured";
  /** Avisos para o dono do app (sem valores nem dados de ninguém). */
  problems: string[];
}

/**
 * Cópia de segurança diária: gera, cifra e guarda; apaga as antigas (ficam 30 diárias e uma por
 * mês dos últimos 12 meses); e uma vez por mês baixa a cópia de volta e a restaura num schema
 * provisório para provar que ela funciona. Qualquer falha vira aviso por e-mail ao dono do app.
 */
export async function runBackup(db: Database, opts: { now?: Date; storage?: BackupStorage | null } = {}): Promise<BackupRunResult> {
  const now = opts.now ?? new Date();
  const storage = opts.storage === undefined ? getBackupStorage() : opts.storage;
  const result: BackupRunResult = { created: null, sizeBytes: 0, tables: 0, rows: 0, deleted: 0, check: null, problems: [] };
  if (!storage) {
    // Na produção, sem armazenamento ligado não existe cópia: isso precisa chegar ao dono do app.
    if (process.env.VERCEL_ENV === "production") result.problems.push("Cópia de segurança desligada: o armazenamento (Vercel Blob) não está ligado ao projeto.");
    return { ...result, skipped: "not_configured" };
  }

  try {
    const dump = await dumpDatabase(db, now);
    const file = sealBackup(dump.json);
    const pathname = backupPathname(now);
    await storage.put(pathname, file);
    Object.assign(result, { created: pathname, sizeBytes: file.length, tables: dump.tables, rows: dump.rows });
    await audit(db, { userId: null, action: "backup.created", entityType: "backup", entityId: pathname, metadata: { tables: dump.tables, rows: dump.rows, sizeBytes: file.length } });
  } catch (e) {
    console.error("[backup] falha ao gerar a cópia", { error: e instanceof Error ? e.message.slice(0, 200) : "desconhecido" });
    result.problems.push("A cópia de segurança de hoje não foi gravada (veja os registros da Vercel).");
  }

  let stored: Awaited<ReturnType<BackupStorage["list"]>> = [];
  try {
    stored = await storage.list();
    const old = backupsToDelete(stored);
    await storage.del(old);
    result.deleted = old.length;
    stored = stored.filter((b) => !old.includes(b.pathname));
  } catch (e) {
    console.error("[backup] falha ao listar ou apagar cópias antigas", { error: e instanceof Error ? e.message.slice(0, 200) : "desconhecido" });
    result.problems.push("Não consegui conferir as cópias antigas no armazenamento.");
  }

  if (await restoreCheckDue(db, now)) {
    result.check = await monthlyRestoreCheck(db, storage, stored, result.created, now);
    if (!result.check.ok) result.problems.push(...result.check.problems.map((p) => `Teste de restauração: ${p}`));
  }
  return result;
}

async function restoreCheckDue(db: Database, now: Date): Promise<boolean> {
  const [last] = await db
    .select({ at: s.auditLog.createdAt })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.action, "backup.restore_checked"), eq(s.auditLog.entityType, "ok"), gt(s.auditLog.createdAt, new Date(now.getTime() - CHECK_EVERY_MS))))
    .orderBy(desc(s.auditLog.createdAt))
    .limit(1);
  return !last;
}

/** Baixa a cópia mais nova do armazenamento (a de hoje, se gravou), abre e restaura num schema provisório. */
async function monthlyRestoreCheck(db: Database, storage: BackupStorage, stored: Array<{ pathname: string; uploadedAt: Date }>, created: string | null, now: Date): Promise<RestoreCheck> {
  const newest = created ?? [...stored].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0]?.pathname ?? null;
  let check: RestoreCheck;
  if (!newest) {
    check = { ok: false, tables: 0, rows: 0, problems: ["Nenhuma cópia encontrada no armazenamento."] };
  } else {
    try {
      const file = await storage.get(newest);
      if (!file) throw new Error("A cópia não foi encontrada para download.");
      check = await checkRestore(db, openBackup(file));
      const age = now.getTime() - (stored.find((b) => b.pathname === newest)?.uploadedAt.getTime() ?? now.getTime());
      if (age > 2 * DAY_MS) check = { ...check, ok: false, problems: [...check.problems, "A cópia mais nova tem mais de 2 dias."] };
    } catch (e) {
      check = { ok: false, tables: 0, rows: 0, problems: [e instanceof Error ? e.message.slice(0, 200) : "A cópia não pôde ser aberta."] };
    }
  }
  await audit(db, {
    userId: null,
    action: "backup.restore_checked",
    entityType: check.ok ? "ok" : "failed",
    entityId: newest ?? undefined,
    metadata: { tables: check.tables, rows: check.rows, problems: check.problems.length },
  });
  return check;
}
