import { del, get, list, put } from "@vercel/blob";
import type { StoredBackup } from "./format";

/**
 * Onde as cópias ficam: um armazenamento Vercel Blob privado (BLOB_READ_WRITE_TOKEN, criado ao
 * ligar o armazenamento ao projeto). Os testes trocam por um armazenamento em memória.
 */
export interface BackupStorage {
  put(pathname: string, body: Buffer): Promise<void>;
  list(): Promise<StoredBackup[]>;
  get(pathname: string): Promise<Buffer | null>;
  del(pathnames: string[]): Promise<void>;
}

const PREFIX = "backups/";

const vercelBlob: BackupStorage = {
  async put(pathname, body) {
    await put(pathname, body, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/octet-stream" });
  },
  async list() {
    const out: StoredBackup[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt), size: b.size })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
  async get(pathname) {
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  },
  async del(pathnames) {
    if (pathnames.length) await del(pathnames);
  },
};

let override: BackupStorage | null | undefined;

/** Testes: troca o armazenamento (null volta ao padrão). */
export function setBackupStorage(storage: BackupStorage | null | undefined): void {
  override = storage;
}

export function getBackupStorage(): BackupStorage | null {
  if (override) return override;
  return process.env.BLOB_READ_WRITE_TOKEN ? vercelBlob : null;
}

/** Armazenamento em memória (testes e conferências locais). */
export function memoryBackupStorage(): BackupStorage & { files: Map<string, { body: Buffer; uploadedAt: Date }> } {
  const files = new Map<string, { body: Buffer; uploadedAt: Date }>();
  return {
    files,
    async put(pathname, body) {
      if (files.has(pathname)) throw new Error("já existe");
      files.set(pathname, { body, uploadedAt: new Date() });
    },
    async list() {
      return [...files].map(([pathname, f]) => ({ pathname, uploadedAt: f.uploadedAt, size: f.body.length }));
    },
    async get(pathname) {
      return files.get(pathname)?.body ?? null;
    },
    async del(pathnames) {
      for (const p of pathnames) files.delete(p);
    },
  };
}
