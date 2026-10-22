import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("duas contas com mascotes diferentes e dados isolados", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await signUp(a, "Ana", uniqueEmail("ana"));
  await quickOnboarding(a, "lince", "Lince");
  await signUp(b, "Bruno", uniqueEmail("bruno"));
  await quickOnboarding(b, "raposa", "Raposa");

  // A cria dados próprios.
  await createAccount(a, "Conta Secreta da Ana", "10.000,00");
  await a.goto("/metas/nova");
  await a.fill("input[name=name]", "Viagem da Ana");
  await a.fill("input[name=target]", "8.000,00");
  await a.getByRole("button", { name: "Criar meta" }).click();
  await a.waitForURL(/\/metas\/[0-9a-f-]{36}/);
  const goalUrl = new URL(a.url()).pathname;

  // B não vê nada de A, nem acessando o endereço direto.
  await b.goto("/contas");
  await expect(b.getByText("Conta Secreta da Ana")).toHaveCount(0);
  await b.goto("/metas");
  await expect(b.getByText("Viagem da Ana")).toHaveCount(0);
  const resp = await b.goto(goalUrl);
  expect(resp?.status()).toBe(404);
  await expect(b.getByText("Viagem da Ana")).toHaveCount(0);

  // Cada um mantém o próprio mascote.
  await a.goto("/configuracoes/mascote");
  await expect(a.getByRole("heading", { name: /Lince\s*·\s*O Estrategista/ })).toBeVisible();
  await b.goto("/configuracoes/mascote");
  await expect(b.getByRole("heading", { name: /Raposa\s*·\s*A Estrategista/ })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
