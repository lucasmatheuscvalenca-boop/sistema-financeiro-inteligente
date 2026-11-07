import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("sem internet: guarda a tela, avisa e registra depois o gasto anotado", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, "Lia Offline", uniqueEmail("offline"));
  await quickOnboarding(page);
  await createAccount(page, "Conta", "1.000,00");

  // Primeira visita registra o service worker; a segunda já passa por ele e a tela fica guardada.
  await page.goto("/gastos");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(async () => (await Promise.all((await caches.keys()).filter((k) => k.startsWith("mb-paginas-")).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat()))
    .toContain("/gastos");
  // A página de anotar sem internet já fica guardada desde a instalação.
  expect(await page.evaluate(async () => !!(await caches.match("/offline")))).toBe(true);

  // Sem conexão: aviso no topo e o gasto anotado fica na fila do aparelho.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Sem internet: você está vendo a última versão salva.")).toBeVisible();
  await page.getByRole("link", { name: "Anotar um gasto" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sem internet" })).toBeVisible();
  await page.getByLabel("Valor (R$)").fill("18,90");
  await page.getByLabel("O que foi").fill("Padaria sem sinal");
  await page.getByRole("button", { name: "Anotar" }).click();
  await expect(page.getByText("Esperando a conexão")).toBeVisible();

  // A conexão volta: o gasto é registrado sozinho, uma vez só.
  await context.setOffline(false);
  await page.goto("/movimentacoes");
  await expect(page.getByText(/gasto anotado sem internet foi registrado/).first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("link", { name: "Padaria sem sinal" })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("mb_fila_offline"))).toBe("[]");
  await context.close();
});
