import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { closeDb, getDb } from "../src/server/db/client";
import { restoreIntoEmptyDatabase } from "../src/server/backup/database";
import { openBackup, parseBackup } from "../src/server/backup/format";
import { getBackupStorage } from "../src/server/backup/storage";

/**
 * Restaura uma cópia de segurança do Meu Banqueiro (veja docs/15-backup-e-restauracao.md).
 *
 *   pnpm backup:restaurar --ultimo --conferir            só baixa, abre e mostra as tabelas
 *   pnpm backup:restaurar --ultimo --salvar copia.mbbk   baixa e guarda o arquivo cifrado
 *   pnpm backup:restaurar --arquivo copia.mbbk           grava num banco NOVO e vazio
 *
 * Precisa de APP_ENCRYPTION_KEY (a mesma da produção); --ultimo precisa de BLOB_READ_WRITE_TOKEN;
 * gravar precisa de DATABASE_URL apontando para um banco novo com `pnpm db:migrate` já rodado.
 * Nunca grava num banco que já tenha pessoas cadastradas.
 */
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dryRun = args.includes("--conferir");
  const saveTo = arg("--salvar");

  let file: Buffer;
  let source: string;
  if (args.includes("--ultimo")) {
    const storage = getBackupStorage();
    if (!storage) throw new Error("Defina BLOB_READ_WRITE_TOKEN para baixar do armazenamento.");
    const newest = (await storage.list()).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
    if (!newest) throw new Error("Nenhuma cópia no armazenamento.");
    const body = await storage.get(newest.pathname);
    if (!body) throw new Error("A cópia não pôde ser baixada.");
    file = body;
    source = newest.pathname;
  } else if (arg("--arquivo")) {
    source = arg("--arquivo")!;
    file = readFileSync(source);
  } else {
    throw new Error("Use --ultimo ou --arquivo <caminho>. Veja o comentário no início do script.");
  }
  if (saveTo) {
    writeFileSync(saveTo, file);
    console.log(`Arquivo cifrado salvo em ${saveTo}.`);
  }

  const json = openBackup(file);
  const payload = parseBackup(json);
  const rows = Object.values(payload.tables).reduce((t, x) => t + x.count, 0);
  console.log(`Cópia ${source}: feita em ${payload.createdAt}, ${Object.keys(payload.tables).length} tabelas, ${rows} linhas, ${payload.migrations} migrações.`);
  if (dryRun || (saveTo && !args.includes("--arquivo"))) {
    for (const [name, t] of Object.entries(payload.tables)) if (t.count) console.log(`  ${name}: ${t.count}`);
    return;
  }

  const result = await restoreIntoEmptyDatabase(getDb(), json);
  console.log(`Restaurado: ${result.tables} tabelas, ${result.rows} linhas.`);
  if (result.skipped.length) console.log(`Tabelas da cópia que não existem neste banco (ignoradas): ${result.skipped.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
