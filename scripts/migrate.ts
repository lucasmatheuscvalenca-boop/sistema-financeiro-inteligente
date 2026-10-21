import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/**
 * Aplica as migrações pendentes. Na Vercel roda antes do build (ver vercel.json).
 * Usa a conexão direta (sem pooler) quando existir, como recomendado para DDL.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) {
      console.warn("[migrações] Nenhum banco conectado ao projeto ainda (DATABASE_URL ausente). Build seguirá sem migrar.");
      return;
    }
    throw new Error("Defina DATABASE_URL (veja .env.example)");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("Migrações aplicadas.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Falha ao aplicar migrações:", err instanceof Error ? err.message : err);
  process.exit(1);
});
