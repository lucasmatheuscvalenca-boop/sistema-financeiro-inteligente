import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("painel NEXO, meta com evolução e aporte com confirmação do mascote", async ({ page }) => {
  await signUp(page, "Gabi", uniqueEmail("gabi"));
  await quickOnboarding(page, "lince", "Lince");
  await createAccount(page, "Conta da Gabi", "4.000,00");

  // Painel com KPIs reais e plano do dia.
  await page.goto("/painel");
  await expect(page.getByRole("heading", { name: "Seu plano de hoje" })).toBeVisible();
  await expect(page.getByText("Saldo disponível").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Receitas no mês").filter({ visible: true }).first()).toBeVisible();

  // Meta com prazo e aporte planejado.
  await page.goto("/metas/nova");
  await page.fill("input[name=name]", "Viagem para Lisboa");
  await page.fill("input[name=target]", "6.000,00");
  const d = new Date();
  const target = `${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
  await page.fill("input[name=targetDate]", target);
  await page.fill("input[name=plannedMonthly]", "500,00");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await page.waitForURL(/\/metas\/[0-9a-f-]{36}/);

  await expect(page.getByRole("heading", { name: "Viagem para Lisboa" })).toBeVisible();
  await expect(page.getByText("Aporte mensal sugerido")).toBeVisible();
  await expect(page.getByText("Conclusão projetada")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Evolução", selected: true })).toBeVisible();

  // Aporte pelo diálogo: fecha ao salvar, confirma com toast e atualiza o progresso.
  await page.getByRole("button", { name: "Adicionar aporte" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=amount]").fill("1.500,00");
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Aporte de R\$\s1\.500,00 registrado em Viagem para Lisboa/ })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByText("25%", { exact: true }).first()).toBeVisible();

  // Abas acessíveis por teclado.
  await page.getByRole("tab", { name: "Simulações" }).click();
  await expect(page.getByRole("tab", { name: "Simulações", selected: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Detalhes", selected: true })).toBeVisible();
  await expect(page.getByText("Histórico de movimentos")).toBeVisible();
});

test("IA financeira: pergunta vinda do painel é enviada e as ações levam ao lançamento preenchido", async ({ page }) => {
  await signUp(page, "Heitor", uniqueEmail("heitor"));
  await quickOnboarding(page, "coruja", "Coruja");
  await createAccount(page, "Conta do Heitor", "2.000,00");

  await page.goto(`/assistente?enviar=1&pergunta=${encodeURIComponent("Posso gastar R$ 5.000 com uma TV?")}`);
  await page.waitForURL(/\/assistente\?c=/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Simular valor menor" })).toBeVisible();
  const register = page.getByRole("link", { name: /Adicionar mesmo assim/ });
  await expect(register).toBeVisible();

  // Simular valor menor faz uma nova pergunta com o valor seguro calculado.
  await page.getByRole("button", { name: "Simular valor menor" }).click();
  await expect(page.getByText(/^Posso gastar R\$ [\d.]+,\d{2} com TV\?$/)).toBeVisible({ timeout: 30_000 });

  await register.first().click();
  await page.waitForURL(/\/movimentacoes\?nova=1/);
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input[name=amount]")).toHaveValue("5000,00");
  await expect(dialog.locator("input[name=description]")).toHaveValue("TV");
});
