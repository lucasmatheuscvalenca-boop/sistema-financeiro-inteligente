import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const PASSWORD = "senha-de-teste-123";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@teste.myoffice.dev`;
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/cadastro");
  await page.getByLabel("Como quer ser chamado").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/boas-vindas$/);
}

export async function categoryNames(page: Page) {
  return page.getByTestId("category-name").allInnerTexts();
}

export function workspaceIdFromUrl(url: string) {
  const m = /\/w\/([0-9a-f-]{36})/.exec(url);
  if (!m) throw new Error(`URL sem workspace: ${url}`);
  return m[1]!;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
