import { expect, test } from "@playwright/test";
import { brl, createAccount, login, signUp, uniqueEmail } from "./helpers";

test("jornada completa: cadastro, mascote, briefing, lançamentos, Posso gastar?, troca de mascote e persistência", async ({ page }) => {
  const email = uniqueEmail("jornada");
  await signUp(page, "Marina", email);

  // Boas-vindas → escolha explícita do mascote (nenhum pré-selecionado, exatamente seis).
  await page.getByRole("button", { name: /Começar/ }).click();
  await page.waitForURL(/etapa=mascot/);
  await expect(page.getByRole("radio")).toHaveCount(6);
  await expect(page.locator("[role=radio][aria-checked=true]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Escolha um personagem" })).toBeVisible();
  await page.getByTestId("mascote-capivara").click();
  await expect(page.getByTestId("mascote-capivara")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Confirmar escolha: Capivara/ }).click();

  // Briefing em três etapas, com resposta parcial.
  await page.waitForURL(/etapa=personal/);
  await expect(page.getByText(/Sou a Capivara/)).toBeVisible();
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
  await page.getByRole("button", { name: "Nova movimentação" }).first().click();
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

  // Troca de mascote sem perda de dados.
  await page.goto("/configuracoes/mascote");
  await page.getByTestId("mascote-polvo").click();
  await page.getByRole("button", { name: /Trocar para este mascote: Polvo/ }).click();
  await page.waitForURL(/trocado=1/);
  await expect(page.getByText("Agora quem acompanha você é Polvo")).toBeVisible();
  await page.goto("/contas");
  await expect(page.getByText("Conta Principal", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(brl("2.750,00")).filter({ visible: true }).first()).toBeVisible();

  // Sair → rota protegida exige login → entrar de novo mantém mascote e dados.
  await page.getByRole("button", { name: "Sair" }).first().click();
  await page.waitForURL(/\/entrar/);
  await page.goto("/painel");
  await page.waitForURL(/\/entrar/);
  await login(page, email);
  await page.goto("/configuracoes/mascote");
  await expect(page.getByRole("heading", { name: /Polvo — O Organizador/ })).toBeVisible();
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
