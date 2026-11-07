import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

const CSV = "Data;Descrição;Valor\n01/10/2026;Padaria Central;-23,50\n02/10/2026;Pix recebido de cliente;150,00\n";

async function previewCsv(page: import("@playwright/test").Page) {
  await page.goto("/importar");
  // Escolher o arquivo já lê e confere: nada de botão de prévia.
  await page.setInputFiles("input[type=file]", { name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf-8") });
  await expect(page.getByText("Entradas no arquivo")).toBeVisible();
}

test("importação de extrato CSV: pré-visualização, confirmação e duplicidade na segunda vez", async ({ page }) => {
  await signUp(page, "Gabi", uniqueEmail("gabi"));
  await quickOnboarding(page);
  await createAccount(page, "Conta Extrato", "1.000,00");

  await previewCsv(page);
  // Padaria vira "Restaurantes e delivery" e o Pix de cliente vira "Renda variável": nada pede atenção.
  await expect(page.getByText("Todas as linhas foram reconhecidas e categorizadas.")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e gravar" }).click();
  await expect(page.getByText("Extrato conferido e gravado").first()).toBeVisible();

  await page.goto("/movimentacoes?mes=2026-10");
  await expect(page.getByText("Padaria Central").first()).toBeVisible();
  await expect(page.getByText("Pix recebido de cliente").first()).toBeVisible();

  // O mesmo arquivo de novo: as linhas aparecem como duplicadas e não são importadas por padrão.
  await previewCsv(page);
  await expect(page.getByText(/duplicad/i).first()).toBeVisible();

  // Desfazer a importação tira os lançamentos que ela criou.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Desfazer" }).first().click();
  await expect(page.getByText("Desfeita", { exact: true }).first()).toBeVisible();
  await page.goto("/movimentacoes?mes=2026-10");
  await expect(page.getByText("Padaria Central")).toHaveCount(0);
});

test("extrato com mais de 1 MB (o limite é 2 MB) chega à conferência", async ({ page }) => {
  await signUp(page, "Duda", uniqueEmail("duda"));
  await quickOnboarding(page);
  await createAccount(page, "Conta Extrato Grande", "0,00");
  // Ações do servidor aceitam 1 MB por padrão; o app promete 2 MB (bodySizeLimit em next.config.ts).
  const lines = Array.from({ length: 3600 }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}/10/2026;COMPRA ${i} ${"LOJA ".repeat(60)};-1,00`);
  const csv = `Data;Descrição;Valor\n${lines.join("\n")}\n`;
  const buffer = Buffer.from(csv, "utf-8");
  expect(buffer.length).toBeGreaterThan(1_100_000);
  expect(buffer.length).toBeLessThan(2_000_000);
  await page.goto("/importar");
  await page.setInputFiles("input[type=file]", { name: "extrato-grande.csv", mimeType: "text/csv", buffer });
  await expect(page.getByText("Entradas no arquivo")).toBeVisible({ timeout: 90_000 });
});
