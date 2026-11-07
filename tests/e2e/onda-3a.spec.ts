import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("telas novas abrem no computador e no celular, sem rolagem horizontal", async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await signUp(page, "Telas", uniqueEmail("telas"));
    await quickOnboarding(page);
    await createAccount(page, "Conta", "2.000,00");
    for (const [path, heading] of [
      ["/financiamento", "Financiar ou juntar?"],
      ["/parcelas", "Parcelas"],
      ["/assinaturas", "Assinaturas"],
      ["/despesas-anuais", "Despesas anuais"],
      ["/imposto-de-renda", "Imposto de Renda"],
      ["/retrospectiva", /Seu \d{4} com o Banqueiro/],
      ["/fluxo-de-caixa?atraso=5", "Fluxo de caixa"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(1);
    }
    await context.close();
  }
});

test("simulador compara financiar e juntar, e despesa anual vira valor por mês", async ({ page }) => {
  await signUp(page, "Simula", uniqueEmail("simula"));
  await quickOnboarding(page);
  await createAccount(page, "Conta", "2.000,00");

  await page.goto("/financiamento");
  await page.getByRole("radio", { name: "Carro" }).click();
  await expect(page.getByRole("heading", { name: "Financiar agora" })).toBeVisible();
  await expect(page.getByText("Juros pagos ao banco")).toBeVisible();
  await page.getByLabel("Prazo (meses)").fill("0");
  await expect(page.getByRole("alert").filter({ hasText: "O prazo vai de 1 a 420 meses" })).toBeVisible();

  await page.goto("/despesas-anuais");
  await page.getByRole("button", { name: "Adicionar despesa anual" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("O que é").fill("IPTU");
  await dialog.getByLabel("Valor aproximado").fill("1.200,00");
  // Dia 15, seis meses à frente: seis meses para juntar, longe de virada de mês e de fuso.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 15));
  await dialog.getByLabel("Próximo pagamento").fill(next.toISOString().slice(0, 10));
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("listitem").getByText("IPTU", { exact: true })).toBeVisible();
  await expect(page.getByText(/R\$\s200,00\/mês/)).toBeVisible();

  const ics = await page.request.get("/api/agenda");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
});
