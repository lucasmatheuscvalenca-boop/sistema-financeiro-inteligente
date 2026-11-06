import { expect, test } from "@playwright/test";
import { createAccount, PASSWORD, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("Recomeçar do zero apaga os dados, mantém o login e volta ao primeiro acesso", async ({ page }) => {
  const email = uniqueEmail("recomecar");
  await signUp(page, "Lucas Recomeço", email);
  await quickOnboarding(page);
  await createAccount(page, "Conta corrente", "1.000,00");

  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { name: "Recomeçar do zero" })).toBeVisible();
  await page.fill("input[name=password]", PASSWORD);
  await page.fill("input[name=confirmText]", "RECOMEÇAR");
  await page.getByRole("button", { name: "Apagar tudo e recomeçar" }).click();
  await page.waitForURL(/\/onboarding/);

  // Continua logado e refaz o onboarding do zero; a conta antiga sumiu.
  await quickOnboarding(page);
  await page.goto("/contas");
  await expect(page.getByText("Nenhuma conta cadastrada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conta corrente" })).toHaveCount(0);
});
