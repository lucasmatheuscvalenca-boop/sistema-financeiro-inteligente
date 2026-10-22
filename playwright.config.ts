import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta. Sobem o app apontando para o banco de TESTE (recriado no
 * global setup) e sem chave de IA (assistente em modo local, resultado determinístico).
 * Por padrão usam o build de produção; E2E_DEV=1 usa o servidor de desenvolvimento.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Defina TEST_DATABASE_URL (veja .env.example)");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.E2E_DEV ? `pnpm exec next dev --port ${PORT}` : `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
    stdout: "pipe",
    env: {
      DATABASE_URL: testDb,
      ANTHROPIC_API_KEY: "",
      PLUGGY_CLIENT_ID: "",
      PLUGGY_CLIENT_SECRET: "",
      COOKIE_SECURE: "false",
      REGISTER_LIMIT_PER_HOUR: "1000",
    },
  },
});
