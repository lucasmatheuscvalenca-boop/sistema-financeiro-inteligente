import { expect, test } from "@playwright/test";
import { createAccount, signUp, uniqueEmail } from "./helpers";

test("renda mista: briefing pergunta fixo e média de comissão, diagnóstico mostra mês fraco e vira recorrências", async ({ page }) => {
  await signUp(page, "Lucas", uniqueEmail("lucas"));
  await page.getByRole("button", { name: /Começar/ }).click();
  await page.getByTestId("mascote-lince").click();
  await page.getByRole("button", { name: /Confirmar escolha: Lince/ }).click();

  await page.waitForURL(/etapa=personal/);
  await page.selectOption("select[name=incomeType]", "mixed");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();

  // A etapa financeira já abre nos campos da renda mista.
  await page.waitForURL(/etapa=financial/);
  await expect(page.getByRole("radio", { name: /Mista/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("input[name=monthlyNetIncome]")).toHaveCount(0);
  await page.fill("input[name=fixedIncome]", "4.000,00");
  await page.fill("input[name=fixedIncomeDay]", "5");
  await page.fill("input[name=commissionAvg]", "2.500,00");
  await page.fill("input[name=commissionLow]", "1.000,00");
  await page.fill("input[name=commissionDay]", "20");
  await expect(page.getByText(/Renda média: R\$\s6\.500,00 por mês/)).toBeVisible();
  await expect(page.getByText(/Num mês fraco: R\$\s5\.000,00/)).toBeVisible();
  await page.fill("input[name=essentialExpenses]", "3.500,00");
  await page.fill("input[name=variableExpenses]", "1.200,00");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();

  await page.waitForURL(/etapa=life/);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.waitForURL(/etapa=diagnosis/);
  await expect(page.getByText("Renda garantida")).toBeVisible();
  await expect(page.getByText("Sobra num mês fraco")).toBeVisible();
  await page.getByRole("button", { name: /Ir para meu painel/ }).click();
  await page.waitForURL(/\/painel/);

  // Em Recorrências, um toque cadastra o salário (confirmado) e a comissão (estimada).
  await createAccount(page, "Conta salário", "1.000,00");
  await page.goto("/recorrencias");
  await expect(page.getByRole("heading", { name: "Sua renda do briefing" })).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar renda recorrente" }).click();
  await expect(page.getByRole("heading", { name: "Sua renda do briefing" })).toHaveCount(0);
  await expect(page.getByText("Salário", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Comissão (média estimada)").first()).toBeVisible();
});
