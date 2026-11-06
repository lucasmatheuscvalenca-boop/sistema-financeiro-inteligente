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
