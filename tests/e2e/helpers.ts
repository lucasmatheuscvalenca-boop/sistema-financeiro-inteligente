import { expect, type Page } from "@playwright/test";

export const PASSWORD = "senha-segura-123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@exemplo.com`;
}

/** Valores em reais aparecem com espaço não separável entre "R$" e o número. */
export function brl(value: string): RegExp {
  return new RegExp(`R\\$\\s${value.replace(/\./g, "\\.")}`);
}

export async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/criar-conta");
  await page.fill("input[name=name]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.check("input[name=consent]");
  await page.getByRole("button", { name: "Criar conta e começar" }).click();
  await page.waitForURL(/\/onboarding/);
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/entrar");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/painel/);
}

/** Confirma O Banqueiro e encerra o briefing para depois (fluxo mais curto). */
export async function quickOnboarding(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Começar/ }).click();
  await page.waitForURL(/etapa=mascot/);
  await page.getByRole("button", { name: /Começar com O Banqueiro/ }).click();
  await page.waitForURL(/etapa=personal/);
  await page.getByRole("button", { name: "Terminar depois" }).click();
  await page.waitForURL(/\/painel/);
}

export async function createAccount(page: Page, name: string, initialBalance: string): Promise<void> {
  await page.goto("/contas");
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=name]").fill(name);
  await dialog.locator("input[name=initialBalance]").fill(initialBalance);
  await dialog.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
}

/** Sai da conta pelo menu do perfil (barra superior do computador). */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Perfil, tema e sair" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(/\/entrar/);
}
