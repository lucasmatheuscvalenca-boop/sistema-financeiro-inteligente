import { expect, test } from "@playwright/test";
import { quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("notificações: tela de preferências salva e explica como ativar no aparelho", async ({ page }) => {
  await signUp(page, "Nina", uniqueEmail("nina"));
  await quickOnboarding(page);
  await page.goto("/alertas");
  await page.getByRole("link", { name: "Receber no celular e por e-mail" }).click();
  await expect(page).toHaveURL(/\/configuracoes\/notificacoes/);
  await expect(page.getByRole("heading", { name: "Neste aparelho" })).toBeVisible();
  // Chromium sem serviço de push ainda mostra o botão (ou a explicação), nunca uma tela de erro.
  await expect(page.getByRole("button", { name: /Ativar notificações neste aparelho/ }).or(page.getByText(/não recebe notificações|bloqueadas/))).toBeVisible();
  const weekly = page.getByLabel(/Resumo da semana por e-mail/);
  await expect(weekly).toBeChecked();
  await weekly.uncheck();
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByText("Preferências salvas.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Resumo da semana por e-mail/)).not.toBeChecked();
  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("showNotification");
});
