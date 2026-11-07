import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("lançamento: etiqueta, total por etiqueta e divisão em categorias", async ({ page }) => {
  await signUp(page, "Teo", uniqueEmail("teo"));
  await quickOnboarding(page);
  await createAccount(page, "Conta", "2.000,00");
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=amount]").fill("280,00");
  await dialog.locator("input[name=description]").fill("Supermercado grande");
  await dialog.locator("select[name=accountId]").selectOption({ label: "Conta" });
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await page.getByRole("link", { name: "Supermercado grande" }).first().click();
  await page.waitForURL(/\/movimentacoes\/[0-9a-f-]{36}/);

  await page.getByLabel("Etiquetas").fill("Casa Nova, mudança");
  await page.getByRole("button", { name: "Salvar etiquetas" }).click();
  await expect(page.getByRole("link", { name: "#casa nova" })).toBeVisible();

  await page.getByRole("button", { name: "Dividir em partes" }).click();
  const split = page.locator("dialog[open]");
  await split.getByLabel("Valor da parte 1").fill("200,00");
  await split.getByLabel("Categoria da parte 1").selectOption({ label: "Mercado" });
  await split.getByLabel("Valor da parte 2").fill("70,00");
  await expect(split.getByRole("status")).toHaveText(/Faltam R\$\s10,00/);
  await expect(split.getByRole("button", { name: "Dividir" })).toBeDisabled();
  await split.getByLabel("Valor da parte 2").fill("80,00");
  await split.getByLabel("Categoria da parte 2").selectOption({ label: "Moradia" });
  await split.getByRole("button", { name: "Dividir" }).click();
  await expect(page.getByText("Dividido em 2 partes.").first()).toBeVisible();

  await page.goto("/movimentacoes?etiqueta=casa%20nova");
  await expect(page.getByText(/Etiqueta\s+#casa nova: 2 lançamentos/)).toBeVisible();
  await expect(page.getByText(/R\$\s280,00 em despesas/)).toBeVisible();
});

test("Posso gastar?: decisão anotada vira histórico com o que deixou de gastar", async ({ page }) => {
  await signUp(page, "Iva", uniqueEmail("iva"));
  await quickOnboarding(page);
  await createAccount(page, "Conta", "1.000,00");
  await page.goto("/posso-gastar?valor=450,00&descricao=Fone%20novo");
  await expect(page.getByRole("heading", { name: "Minha decisão" })).toBeVisible();
  await page.getByRole("button", { name: "Desisti" }).click();
  await expect(page.getByText(/Esse dinheiro continua com você/).first()).toBeVisible();
  await page.goto("/posso-gastar");
  await expect(page.getByText(/desistiu de\s+1 compra/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Fone novo" })).toContainText("desisti");
});
