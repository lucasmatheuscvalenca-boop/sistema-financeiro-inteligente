import { expect, test } from "@playwright/test";
import { brl, createAccount, login, signUp, uniqueEmail } from "./helpers";

test("jornada completa: cadastro, banqueiro, briefing, lançamentos, Posso gastar? e persistência", async ({ page }) => {
  const email = uniqueEmail("jornada");
  await signUp(page, "Marina", email);

  // Boas-vindas → apresentação do Banqueiro (seis expressões para experimentar) → confirmação explícita.
  await page.getByRole("button", { name: /^Começar/ }).click();
  await page.waitForURL(/etapa=mascot/);
  await expect(page.getByRole("heading", { name: "Conheça O Banqueiro" })).toBeVisible();
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Comemoração" }).click();
  await expect(page.locator("[data-mascot=banqueiro][data-state=celebration]").first()).toBeVisible();
  await page.getByRole("button", { name: /Começar com O Banqueiro/ }).click();

  // Briefing em três etapas, com resposta parcial.
  await page.waitForURL(/etapa=personal/);
  await expect(page.getByText(/sou o Banqueiro/)).toBeVisible();
  await page.fill("input[name=birthYear]", "1992");
  await page.selectOption("select[name=employmentStatus]", "clt");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.waitForURL(/etapa=financial/);
  await page.fill("input[name=monthlyNetIncome]", "6.000,00");
  await page.fill("input[name=essentialExpenses]", "3.000,00");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.waitForURL(/etapa=life/);
  await page.fill("textarea[name=shortTermGoals]", "Fazer uma viagem em família");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.waitForURL(/etapa=diagnosis/);
  await expect(page.getByRole("heading", { name: "Seu diagnóstico inicial" })).toBeVisible();
  await page.getByRole("button", { name: /Ir para meu painel/ }).click();
  await page.waitForURL(/\/painel/);

  // Conta + despesa.
  await createAccount(page, "Conta Principal", "3.000,00");
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=amount]").fill("250,00");
  await dialog.locator("input[name=description]").fill("Mercado do mês");
  await dialog.locator("select[name=accountId]").selectOption({ label: "Conta Principal" });
  await dialog.locator("select[name=categoryId]").selectOption({ label: "Mercado" });
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Mercado do mês").first()).toBeVisible();

  // Painel reflete o saldo livre (3.000 − 250).
  await page.goto("/painel");
  await expect(page.getByText(brl("2.750,00")).filter({ visible: true }).first()).toBeVisible();

  // Posso gastar? responde com veredito e explicação.
  await page.goto("/posso-gastar?valor=500,00");
  await expect(page.getByTestId("veredito")).toBeVisible();
  await expect(page.getByText("Valor máximo seguro")).toBeVisible();
  await expect(page.getByText(/Saldo disponível hoje: R\$\s2\.750,00/)).toBeVisible();

  // A página do consultor apresenta O Banqueiro e as seis expressões.
  await page.goto("/configuracoes/mascote");
  await expect(page.getByRole("heading", { name: "O Banqueiro", exact: true })).toBeVisible();
  await expect(page.locator("[data-mascot=banqueiro][data-state=alert]").first()).toBeVisible();
  await page.goto("/contas");
  await expect(page.getByText("Conta Principal", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(brl("2.750,00")).filter({ visible: true }).first()).toBeVisible();

  // Sair → rota protegida exige login → entrar de novo mantém o consultor e os dados.
  await page.getByRole("button", { name: "Sair" }).first().click();
  await page.waitForURL(/\/entrar/);
  await page.goto("/painel");
  await page.waitForURL(/\/entrar/);
  await login(page, email);
  await page.goto("/configuracoes/mascote");
  await expect(page.getByRole("heading", { name: "O Banqueiro", exact: true })).toBeVisible();
  await page.goto("/movimentacoes");
  await expect(page.getByText("Mercado do mês").first()).toBeVisible();
});

test("login com senha errada não entra e não revela se o e-mail existe", async ({ page }) => {
  await page.goto("/entrar");
  await page.fill("input[name=email]", "ninguem@exemplo.com");
  await page.fill("input[name=password]", "senha-incorreta-1");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText(/E-mail ou senha incorretos/i)).toBeVisible();
  await expect(page).toHaveURL(/\/entrar/);
});
