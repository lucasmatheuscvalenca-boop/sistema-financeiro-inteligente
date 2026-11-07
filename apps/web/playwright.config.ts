/**
 * E2E no navegador.
 *  - Padrão (local/sessão de desenvolvimento): PostgreSQL local + emulador do protocolo do Supabase Auth.
 *  - E2E_SUPABASE=1 (CI "supabase-real"): Supabase verdadeiro iniciado pelo CLI; SUPABASE_URL,
 *    SUPABASE_PUBLISHABLE_KEY e SUPABASE_DB_URL vêm do ambiente.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const realSupabase = process.env.E2E_SUPABASE === "1";

const EMULATOR_PORT = 54399;
const ADMIN_DB = process.env.E2E_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/myoffice_e2e_test";
const appDb = new URL(ADMIN_DB);
appDb.username = "myoffice_app";
appDb.password = process.env.E2E_APP_ROLE_PASSWORD ?? "myoffice_app_test_only";

const appEnv: Record<string, string> = realSupabase
  ? {
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_DB_URL: process.env.SUPABASE_DB_URL ?? "",
    }
  : {
      SUPABASE_URL: `http://127.0.0.1:${EMULATOR_PORT}`,
      SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key-not-a-secret",
      SUPABASE_DB_URL: appDb.toString(),
    };

const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "off",
    locale: "pt-BR",
    launchOptions: chromium,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: chromium }, testIgnore: /mobile\.spec\.ts/ },
    { name: "celular", use: { ...devices["Pixel 7"], launchOptions: chromium }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    ...(realSupabase
      ? []
      : [
          {
            command: "tsx e2e/support/prepare-db.ts && tsx e2e/support/auth-emulator.ts",
            url: `http://127.0.0.1:${EMULATOR_PORT}/auth/v1/health`,
            reuseExistingServer: false,
            timeout: 60_000,
            env: { E2E_ADMIN_DATABASE_URL: ADMIN_DB, AUTH_EMULATOR_PORT: String(EMULATOR_PORT) },
            stdout: "pipe" as const,
          },
        ]),
    {
      command: `pnpm exec next start -p ${PORT} -H 127.0.0.1`,
      url: `${BASE_URL}/entrar`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...appEnv, NODE_ENV: "production" },
    },
  ],
});
