import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

/**
 * Prepara o projeto para rodar no computador (Windows, macOS ou Linux):
 * 1. cria o .env a partir do .env.example, com uma chave de cifragem nova;
 * 2. confere a conexão com o banco;
 * 3. aplica as migrações.
 * Uso: pnpm setup:local
 */
async function main() {
  if (!existsSync(".env")) {
    copyFileSync(".env.example", ".env");
    console.log("✔ .env criado a partir do .env.example");
  }
  let env = readFileSync(".env", "utf8");
  if (/^APP_ENCRYPTION_KEY=\s*$/m.test(env)) {
    env = env.replace(/^APP_ENCRYPTION_KEY=\s*$/m, `APP_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
    writeFileSync(".env", env);
    console.log("✔ APP_ENCRYPTION_KEY gerada");
  }
  const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (!url) {
    console.log("\n✖ Falta o DATABASE_URL no arquivo .env.");
    console.log("  Opção 1 (mais simples): use o banco Neon do projeto na Vercel — Storage › banco › aba “.env.local” › copie DATABASE_URL.");
    console.log("  Opção 2: PostgreSQL local, por exemplo com Docker:");
    console.log("    docker run -d --name rumo-db -e POSTGRES_USER=rumo -e POSTGRES_PASSWORD=rumo_dev_password -p 5432:5432 postgres:16");
    console.log("Depois rode de novo: pnpm setup:local");
    process.exitCode = 1;
    return;
  }
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await client.query("select 1");
    console.log("✔ Conexão com o banco OK");
  } catch (e) {
    console.log(`\n✖ Não consegui conectar ao banco: ${e instanceof Error ? e.message : e}`);
    console.log("  Confira o DATABASE_URL no .env (e, se for local, se o PostgreSQL está rodando).");
    process.exitCode = 1;
    return;
  } finally {
    await client.end().catch(() => undefined);
  }
  const r = spawnSync("pnpm", ["db:migrate"], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    process.exitCode = r.status ?? 1;
    return;
  }
  console.log("\nTudo pronto. Rode: pnpm dev   e abra http://localhost:3000");
}

main();
