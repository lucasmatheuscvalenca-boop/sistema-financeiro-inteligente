import resetTestDatabase from "../integration/global-setup";

/** Banco de teste limpo, com as migrações reais, antes da suíte E2E. */
export default async function globalSetup() {
  await resetTestDatabase();
}
