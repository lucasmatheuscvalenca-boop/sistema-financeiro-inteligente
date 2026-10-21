import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db/client";

async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrações aplicadas.");
  await closeDb();
}

main().catch((err) => {
  console.error("Falha ao aplicar migrações:", err instanceof Error ? err.message : err);
  process.exit(1);
});
