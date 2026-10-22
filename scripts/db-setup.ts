import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/**
 * Cria o banco (se não existir) e aplica as migrações.
 * Uso: pnpm db:setup            → banco de DATABASE_URL
 *      pnpm db:setup --test     → também o banco de TEST_DATABASE_URL
 * O usuário do Postgres precisa existir e ter permissão CREATEDB.
 */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error(`Nome de banco inválido: ${dbName}`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [dbName]);
    if (!rowCount) {
      await client.query(`create database "${dbName}"`);
      console.log(`Banco ${dbName} criado.`);
    } else {
      console.log(`Banco ${dbName} já existe.`);
    }
  } finally {
    await client.end();
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await migrate(drizzle(db), { migrationsFolder: "drizzle" });
    console.log(`Migrações aplicadas em ${dbName}.`);
  } finally {
    await db.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL (veja .env.example)");
  await ensureDatabase(url);
  if (process.argv.includes("--test")) {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error("Defina TEST_DATABASE_URL (veja .env.example)");
    await ensureDatabase(testUrl);
  }
}

main().catch((err) => {
  console.error("Falha na preparação do banco:", err instanceof Error ? err.message : err);
  process.exit(1);
});
