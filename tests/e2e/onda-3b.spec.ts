import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("assistente: 'gastei 80 no mercado' só grava depois de confirmar", async ({ page }) => {
  await signUp(page, "Lia", uniqueEmail("lia"));
  await quickOnboarding(page);
  await createAccount(page, "Conta do dia a dia", "1.000,00");
  await page.goto("/assistente");
  await page.getByPlaceholder(/Posso gastar R\$ 600/).fill("gastei 80 no mercado");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/Despesa de R\$\s80,00: Mercado/).last()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar e gravar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gravado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar e gravar" })).toHaveCount(0);
  await page.goto("/movimentacoes");
  await expect(page.getByRole("listitem").filter({ hasText: /80,00/ }).filter({ hasText: "Conta do dia a dia" })).toContainText("Mercado");
  // Recarregar a conversa não oferece gravar de novo.
  await page.goBack();
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirmar e gravar" })).toHaveCount(0);
});
