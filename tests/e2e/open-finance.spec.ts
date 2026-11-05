import { expect, test } from "@playwright/test";
import { quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("Conectar banco sem chaves mostra a ativação gratuita e confere as chaves na Pluggy antes de gravar", async ({ page }) => {
  await signUp(page, "Open Finance", uniqueEmail("openfinance"));
  await quickOnboarding(page, "coruja", "Coruja");
  await page.goto("/conexoes");
  await expect(page.getByRole("heading", { name: "Ative o Open Finance (grátis, uma vez)" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Meu Pluggy/ }).first()).toHaveAttribute("href", "https://meu.pluggy.ai");

  // Chaves curtas nem chegam à Pluggy.
  await page.fill("input[name=clientId]", "abc");
  await page.fill("input[name=clientSecret]", "123");
  await page.getByRole("button", { name: "Ativar Open Finance" }).click();
  await expect(page.getByText("Cole o Client ID e o Client Secret completos.")).toBeVisible();

  // Chaves inválidas: a Pluggy recusa (ou não responde) e nada é gravado.
  await page.fill("input[name=clientId]", "11111111-2222-3333-4444-555555555555");
  await page.fill("input[name=clientSecret]", "segredo-que-nao-existe-123456");
  await page.getByRole("button", { name: "Ativar Open Finance" }).click();
  await expect(page.getByText(/Pluggy não (aceitou|respondeu)/)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ative o Open Finance (grátis, uma vez)" })).toBeVisible();
});
