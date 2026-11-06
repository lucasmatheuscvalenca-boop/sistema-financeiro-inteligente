import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PASSWORD, quickOnboarding, signUp, uniqueEmail } from "./helpers";

const OUTBOX = resolve("test-results/emails");

/** Espera o e-mail do código chegar na pasta de saída (o envio roda depois da resposta). */
async function codeFor(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const files = await readdir(OUTBOX).catch(() => [] as string[]);
    for (const f of files.sort().reverse()) {
      const msg = JSON.parse(await readFile(join(OUTBOX, f), "utf8")) as { to: string; text: string };
      const code = msg.to === email ? msg.text.match(/Seu código: (\d{6})/)?.[1] : undefined;
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nenhum e-mail para ${email}`);
}

test("esqueci minha senha: código por e-mail, nova senha e entrada direta", async ({ page }) => {
  const email = uniqueEmail("esqueceu");
  await signUp(page, "Esqueceu", email);
  await quickOnboarding(page);
  await page.getByRole("button", { name: "Sair" }).first().click();
  await page.waitForURL(/\/entrar/);

  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await page.waitForURL(/\/esqueci-senha/);
  await page.fill("input[name=email]", email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.waitForURL(/\/redefinir-senha/);
  await expect(page.getByText(email)).toBeVisible();

  const code = await codeFor(email);
  await page.fill("input[name=code]", code);
  await page.fill("input[name=password]", "nova-senha-456");
  await page.fill("input[name=confirm]", "outra-coisa-789");
  await page.getByRole("button", { name: "Salvar nova senha e entrar" }).click();
  await expect(page.getByText("As duas senhas não são iguais.")).toBeVisible();

  await page.fill("input[name=code]", code);
  await page.fill("input[name=password]", "nova-senha-456");
  await page.fill("input[name=confirm]", "nova-senha-456");
  await page.getByRole("button", { name: "Salvar nova senha e entrar" }).click();
  await page.waitForURL(/\/painel/);

  // A senha antiga não entra mais; a nova, sim.
  await page.getByRole("button", { name: "Sair" }).first().click();
  await page.waitForURL(/\/entrar/);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "nova-senha-456");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/painel/);
});
