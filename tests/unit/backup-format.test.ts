import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BackupOpenError, backupPathname, backupsToDelete, openBackup, parseBackup, sealBackup } from "@/server/backup/format";

const key = randomBytes(32);
const json = JSON.stringify({ format: "meubanqueiro-backup", version: 1, createdAt: "2026-11-07T09:00:00.000Z", migrations: 13, tables: { users: { count: 1, columns: ["id"], rows: [{ id: "a" }] } } });

describe("arquivo da cópia de segurança", () => {
  it("cifra, compacta e volta igual", () => {
    const file = sealBackup(json, key);
    expect(file.subarray(0, 4).toString("latin1")).toBe("MBBK");
    expect(file.includes(Buffer.from("users"))).toBe(false);
    expect(openBackup(file, key)).toBe(json);
    expect(parseBackup(openBackup(file, key)).tables.users!.count).toBe(1);
  });

  it("recusa chave errada, arquivo alterado e arquivo de outro tipo", () => {
    const file = sealBackup(json, key);
    expect(() => openBackup(file, randomBytes(32))).toThrow(BackupOpenError);
    const tampered = Buffer.from(file);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => openBackup(tampered, key)).toThrow(BackupOpenError);
    const header = Buffer.from(file);
    header[4] = 2;
    expect(() => openBackup(header, key)).toThrow(BackupOpenError);
    expect(() => openBackup(Buffer.from("PK\u0003\u0004 qualquer coisa com tamanho suficiente"), key)).toThrow(BackupOpenError);
  });

  it("confere o número de linhas de cada tabela", () => {
    const broken = JSON.stringify({ ...JSON.parse(json), tables: { users: { count: 2, columns: ["id"], rows: [{ id: "a" }] } } });
    expect(() => parseBackup(broken)).toThrow(/users/);
    expect(() => parseBackup(JSON.stringify({ format: "outro", version: 1, tables: {} }))).toThrow(BackupOpenError);
  });

  it("nome do arquivo ordena pela data", () => {
    expect(backupPathname(new Date("2026-11-07T09:00:12.345Z"))).toBe("backups/2026-11-07T09-00-12Z.mbbk");
  });

  it("guarda 30 diárias e a primeira de cada um dos últimos 12 meses", () => {
    const start = Date.parse("2025-06-01T09:00:00Z");
    const all = Array.from({ length: 520 }, (_, i) => {
      const d = new Date(start + i * 86_400_000);
      return { pathname: backupPathname(d), uploadedAt: d, size: 1 };
    });
    const gone = new Set(backupsToDelete(all));
    const kept = all.filter((b) => !gone.has(b.pathname)).map((b) => b.pathname.slice(8, 18));
    const newest = all.slice(-30).map((b) => b.pathname.slice(8, 18));
    expect(kept.filter((d) => !newest.includes(d))).toEqual(["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(kept).toHaveLength(30 + 11); // o mês mais novo já está entre as 30 diárias
    expect(backupsToDelete(all.slice(0, 10))).toEqual([]);
  });
});
