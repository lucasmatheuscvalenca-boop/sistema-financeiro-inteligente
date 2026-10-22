import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

const LONG_ACCOUNT = "Conta com um nome bem comprido para testar";

test("nenhuma tela rola para o lado do celular pequeno ao monitor, mesmo com nomes longos e valores altos", async ({ page }) => {
  test.setTimeout(420_000);
  await signUp(page, "Lia", uniqueEmail("lia"));
  await quickOnboarding(page, "polvo", "Polvo");
  await createAccount(page, LONG_ACCOUNT, "12.345,67");

  await page.goto("/cartoes");
  await page.getByRole("button", { name: "Novo cartão" }).first().click();
  await page.locator("dialog[open] input[name=name]").fill("Cartão com um nome realmente comprido para testar");
  await page.locator("dialog[open] input[name=limit]").fill("123.456,78");
  await page.locator("dialog[open] button[type=submit]").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=amount]").fill("98.765,43");
  await dialog.locator("input[name=description]").fill("Compra de um equipamento com uma descrição muito longa para testar a quebra de linha");
  await dialog.locator("select[name=accountId]").selectOption({ label: LONG_ACCOUNT });
  await dialog.locator("select[name=categoryId]").selectOption({ label: "Mercado" });
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.goto("/metas/nova");
  await page.fill("input[name=name]", "Meta com um nome muito comprido para testar o layout das telas");
  await page.fill("input[name=target]", "1.234.567,89");
  await page.fill("input[name=targetDate]", `${new Date().getFullYear() + 5}-06-15`);
  await page.fill("input[name=plannedMonthly]", "5.000,00");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await page.waitForURL(/\/metas\/[0-9a-f-]{36}/);
  const goalPath = new URL(page.url()).pathname;

  const routes = ["/painel", "/posso-gastar?valor=300,00", "/posso-gastar?valor=150.000,00", "/assistente", "/movimentacoes", "/contas", "/cartoes", "/relatorios", "/planejamento", "/busca?q=conta", "/metas", goalPath, "/metas/nova", "/orcamento", "/recorrencias", "/fluxo-de-caixa", "/importar", "/reserva", "/patrimonio", "/aposentadoria", "/alertas", "/revisao", "/conquistas", "/conexoes", "/compartilhamento", "/configuracoes", "/configuracoes/mascote", "/configuracoes/briefing", "/configuracoes/memoria", "/configuracoes/categorias", "/configuracoes/privacidade", "/termos", "/privacidade"];
  // Celular pequeno, iPad em pé, iPad deitado (menu lateral com área estreita) e notebook.
  for (const width of [320, 768, 1024, 1366]) {
    await page.setViewportSize({ width, height: 800 });
    const wide: string[] = [];
    for (const path of routes) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) wide.push(`${path} (${overflow}px)`);
    }
    expect(wide, `rolagem horizontal com ${width}px`).toEqual([]);
  }
});
