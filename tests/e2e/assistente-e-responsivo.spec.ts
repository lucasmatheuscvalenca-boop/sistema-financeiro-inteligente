import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("assistente responde em modo local com números do motor de cálculo", async ({ page }) => {
  await signUp(page, "Clara", uniqueEmail("clara"));
  await quickOnboarding(page, "coruja", "Coruja");
  await createAccount(page, "Conta do dia a dia", "1.500,00");
  await page.goto("/assistente");
  await expect(page.getByText(/Modo local/).first()).toBeVisible();
  await page.getByPlaceholder(/Posso gastar R\$ 600/).fill("Quanto ainda posso gastar hoje?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Quanto ainda posso gastar hoje?")).toBeVisible();
  await expect(page.getByText(/Valor máximo para gastar hoje/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/R\$\s1\.500,00/).first()).toBeVisible();
  await page.waitForURL(/\?c=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  // A conversa fica salva.
  await page.reload();
  await expect(page.getByText("Quanto ainda posso gastar hoje?").first()).toBeVisible();
  await expect(page.getByText(/Valor máximo para gastar hoje/).first()).toBeVisible();
});

test("layout móvel: navegação inferior e sem rolagem horizontal", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signUp(page, "Davi", uniqueEmail("davi"));
  await quickOnboarding(page, "guardiao", "Guardião");
  for (const path of ["/painel", "/posso-gastar", "/metas", "/movimentacoes", "/configuracoes"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Atalhos" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(1);
  }
  await context.close();
});

test("tema escuro pode ser escolhido e persiste entre páginas", async ({ page }) => {
  await signUp(page, "Eva", uniqueEmail("eva"));
  await quickOnboarding(page, "polvo", "Polvo");
  // Ciclo: sistema → claro → escuro.
  await page.getByRole("button", { name: /Tema do sistema\. Alternar tema/ }).first().click();
  await expect(page.getByRole("button", { name: /Tema claro\. Alternar tema/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Tema claro\. Alternar tema/ }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/metas");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("layout de computador: nenhuma página com rolagem horizontal", async ({ page }) => {
  await signUp(page, "Fabio", uniqueEmail("fabio"));
  await quickOnboarding(page, "raposa", "Raposa");
  await createAccount(page, "Conta do Fabio", "2.000,00");
  const routes = ["/painel", "/posso-gastar?valor=300,00", "/assistente", "/movimentacoes", "/contas", "/orcamento", "/recorrencias", "/fluxo-de-caixa", "/importar", "/metas", "/reserva", "/patrimonio", "/aposentadoria", "/alertas", "/revisao", "/conquistas", "/conexoes", "/compartilhamento", "/configuracoes", "/configuracoes/mascote", "/configuracoes/briefing", "/configuracoes/memoria", "/configuracoes/categorias", "/configuracoes/privacidade"];
  for (const path of routes) {
    const resp = await page.goto(path);
    expect(resp?.status(), path).toBe(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(1);
  }
});
