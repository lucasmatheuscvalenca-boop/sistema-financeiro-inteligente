import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { derivedKey } from "../security/crypto";

/**
 * Formato da cópia de segurança (arquivo .mbbk):
 *   "MBBK" + versão (1 byte) | iv (12) | tag (16) | dados
 * Os dados são o JSON do banco compactado com gzip e cifrado com AES-256-GCM. O cabeçalho entra
 * como dado autenticado: qualquer byte trocado no arquivo faz a abertura falhar.
 */

const MAGIC = Buffer.from([0x4d, 0x42, 0x42, 0x4b, 0x01]); // "MBBK" v1
const HEADER = MAGIC.length + 12 + 16;

export const BACKUP_FORMAT = "meubanqueiro-backup";

export class BackupOpenError extends Error {}

/** Chave das cópias: derivada da APP_ENCRYPTION_KEY (sem ela, as cópias não abrem). */
export function backupKey(): Buffer {
  return derivedKey("backup-v1");
}

export function sealBackup(json: string, key: Buffer = backupKey()): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, "utf8"), { level: 9 })), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), data]);
}

export function openBackup(file: Buffer, key: Buffer = backupKey()): string {
  if (file.length < HEADER || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupOpenError("O arquivo não é uma cópia de segurança do Meu Banqueiro.");
  const decipher = createDecipheriv("aes-256-gcm", key, file.subarray(MAGIC.length, MAGIC.length + 12));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(file.subarray(MAGIC.length + 12, HEADER));
  let zipped: Buffer;
  try {
    zipped = Buffer.concat([decipher.update(file.subarray(HEADER)), decipher.final()]);
  } catch {
    throw new BackupOpenError("A cópia não abriu: a chave é outra ou o arquivo foi alterado.");
  }
  return gunzipSync(zipped).toString("utf8");
}

export interface BackupTable {
  /** Linhas contadas no momento da cópia (conferidas com as que vieram no arquivo). */
  count: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  /** Quantas migrações o banco tinha: restaurar num banco com o mesmo número evita surpresas. */
  migrations: number;
  tables: Record<string, BackupTable>;
}

/** Lê o JSON e confere a estrutura e, em cada tabela, se o número de linhas bate com o contado. */
export function parseBackup(json: string): BackupPayload {
  const data = JSON.parse(json) as Partial<BackupPayload>;
  if (data.format !== BACKUP_FORMAT || data.version !== 1 || !data.tables || typeof data.tables !== "object") throw new BackupOpenError("Formato de cópia desconhecido.");
  for (const [name, t] of Object.entries(data.tables)) {
    if (!Array.isArray(t.rows) || !Array.isArray(t.columns) || t.rows.length !== t.count) throw new BackupOpenError(`A tabela ${name} veio incompleta na cópia.`);
  }
  return data as BackupPayload;
}

export interface StoredBackup {
  pathname: string;
  uploadedAt: Date;
  size: number;
}

/**
 * Quais cópias apagar: ficam as `keepDaily` mais recentes e, dos últimos `keepMonths` meses com
 * cópia, a primeira de cada mês (para dar para voltar bem atrás se um problema demorar a aparecer).
 */
export function backupsToDelete(items: readonly StoredBackup[], keepDaily = 30, keepMonths = 12): string[] {
  const sorted = [...items].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const keep = new Set(sorted.slice(0, keepDaily).map((b) => b.pathname));
  const firstOfMonth = new Map<string, StoredBackup>();
  for (const b of sorted) firstOfMonth.set(b.uploadedAt.toISOString().slice(0, 7), b); // do mais novo ao mais velho: fica o mais velho do mês
  for (const month of [...firstOfMonth.keys()].sort().reverse().slice(0, keepMonths)) keep.add(firstOfMonth.get(month)!.pathname);
  return sorted.filter((b) => !keep.has(b.pathname)).map((b) => b.pathname);
}

/** Nome do arquivo: backups/2026-11-07T09-00-12Z.mbbk (ordena pela data). */
export function backupPathname(now: Date): string {
  return `backups/${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}.mbbk`;
}
