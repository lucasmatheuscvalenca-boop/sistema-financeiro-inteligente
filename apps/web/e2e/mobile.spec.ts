import { expect, test } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";

test("celular: menu em gaveta, troca de universo e sem rolagem horizontal", async ({ page }) => {
  await signUp(page, "Celular", uniqueEmail("celular"));
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer).toBeVisible();
  await drawer.getByTestId("universe-switcher").click();
  await drawer.getByRole("option", { name: "Pessoal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pessoal" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});
