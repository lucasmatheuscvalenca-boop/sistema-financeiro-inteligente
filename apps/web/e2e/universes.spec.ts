import { expect, test } from "@playwright/test";
import { PASSWORD, categoryNames, signIn, signUp, uniqueEmail, workspaceIdFromUrl } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = { name: "Lucas Teste", email: uniqueEmail("dono") };
let businessUrl = "";
let personalUrl = "";

test("rotas protegidas exigem login e senha errada é recusada", async ({ page }) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/entrar\?next=%2Finicio$/);
  await page.getByLabel("E-mail").fill("ninguem@teste.myoffice.dev");
  await page.getByLabel("Senha").fill("qualquer-coisa-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
});

test("cadastro → boas-vindas → primeira empresa (Explosion Digital)", async ({ page }) => {
  await signUp(page, owner.name, owner.email);
  await expect(page.getByRole("heading", { name: "Seu escritório está pronto" })).toBeVisible();
  await expect(page.getByLabel("Nome da empresa")).toHaveValue("Explosion Digital");
  await page.getByRole("button", { name: "Criar empresa" }).click();

  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  businessUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: "Explosion Digital" })).toBeVisible();
  await expect(page.getByTestId("workspace-scope")).toHaveAttribute("data-workspace-kind", "business");
  const names = await categoryNames(page);
  expect(names).toHaveLength(8);
  expect(names).toContain("Comercial");
  expect(names).toContain("Inteligência de negócios");
});

test("alternar universos mantém os dados isolados", async ({ page }) => {
  await signIn(page, owner.email);
  await expect(page.getByTestId("universe-card")).toHaveCount(2);

  // Cria uma categoria só na empresa.
  await page.goto(businessUrl);
  await page.getByLabel("Nova categoria").fill("Clientes VIP");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Categoria “Clientes VIP” criada.");
  await expect(page.getByTestId("category-name").filter({ hasText: "Clientes VIP" })).toBeVisible();

  // Troca para o universo pessoal pelo seletor.
  await page.getByTestId("universe-switcher").click();
  await page.getByRole("option", { name: "Pessoal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pessoal" })).toBeVisible();
  personalUrl = page.url();
  expect(workspaceIdFromUrl(personalUrl)).not.toBe(workspaceIdFromUrl(businessUrl));
  await expect(page.getByTestId("workspace-scope")).toHaveAttribute("data-workspace-kind", "personal");
  const personal = await categoryNames(page);
  expect(personal).toContain("Finanças pessoais");
  expect(personal).not.toContain("Clientes VIP");
  expect(personal).not.toContain("Comercial");

  // Ao trocar dentro de um módulo, mantém o módulo.
  await page.goto(`${personalUrl}/agentes`);
  await page.getByTestId("universe-switcher").click();
  await page.getByRole("option", { name: "Explosion Digital" }).click();
  await expect(page).toHaveURL(`${businessUrl}/agentes`);
  await expect(page.getByTestId("planned-module")).toContainText("Este módulo ainda não foi construído");
  await expect(page.getByTestId("agent-count")).toHaveText("0");
});

test("renomear e arquivar categoria", async ({ page }) => {
  await signIn(page, owner.email);
  await page.goto(businessUrl);
  await page.getByRole("button", { name: "Renomear Clientes VIP" }).click();
  await page.getByLabel("Novo nome da categoria").fill("Clientes estratégicos");
  await page.getByRole("button", { name: "Ok" }).click();
  await expect(page.getByTestId("category-name").filter({ hasText: "Clientes estratégicos" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Arquivar Clientes estratégicos" }).click();
  await expect(page.getByTestId("category-name").filter({ hasText: "Clientes estratégicos" })).toHaveCount(0);
});

test("outra conta não acessa os universos da primeira", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, "Intrusa", uniqueEmail("intrusa"));
  await page.goto("/inicio");
  await expect(page.getByTestId("universe-card")).toHaveCount(1);

  for (const url of [businessUrl, personalUrl, `${businessUrl}/agentes`]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Sala não encontrada" })).toBeVisible();
  }
  await context.close();
});

test("cabeçalhos de segurança e saída", async ({ page }) => {
  const response = await page.goto("/entrar");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-powered-by"]).toBeUndefined();

  await page.getByLabel("E-mail").fill(owner.email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/entrar/);
});
