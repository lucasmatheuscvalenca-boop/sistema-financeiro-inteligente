import { expect, test } from "@playwright/test";
import { createAccount, quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("Nosso lar: convite, despesa marcada como nossa e acerto visto pelas duas pessoas", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const emailB = uniqueEmail("bia");

  await signUp(a, "Ana Casa", uniqueEmail("ana"));
  await quickOnboarding(a);
  await signUp(b, "Bia Casa", emailB);
  await quickOnboarding(b);

  // Ana convida a Bia pelo e-mail.
  await a.goto("/casal");
  await a.getByRole("button", { name: "Convidar" }).click();
  await a.locator("dialog[open] input[name=email]").fill(emailB);
  await a.locator("dialog[open]").getByRole("button", { name: "Convidar" }).click();
  await expect(a.getByText(/Aguardando/)).toBeVisible();

  // Bia aceita.
  await b.goto("/casal");
  await expect(b.getByText(/Ana Casa.*convidou você/)).toBeVisible();
  await b.getByRole("button", { name: "Aceitar" }).click();
  await expect(b.getByRole("heading", { level: 2, name: "Acerto do mês" })).toBeVisible();

  // Ana lança duas despesas e marca uma como nossa.
  await createAccount(a, "Conta da Ana", "3.000,00");
  for (const [desc, value] of [["Mercado da casa", "300,00"], ["Presente surpresa", "150,00"]] as const) {
    await a.goto("/movimentacoes");
    await a.getByRole("button", { name: "Nova transação" }).first().click();
    const dialog = a.locator("dialog[open]");
    await dialog.locator("input[name=amount]").fill(value);
    await dialog.locator("input[name=description]").fill(desc);
    await dialog.locator("select[name=accountId]").selectOption({ label: "Conta da Ana" });
    await dialog.getByRole("button", { name: "Registrar" }).click();
    await expect(a.getByText(desc).first()).toBeVisible();
  }
  const row = a.getByRole("listitem").filter({ hasText: "Mercado da casa" });
  await row.getByLabel("De quem é").selectOption("ours");
  await expect(row.getByLabel("De quem é")).toHaveValue("ours");
  await a.waitForTimeout(500);

  // Bia vê só o que é nosso e quanto deve.
  await b.goto("/casal");
  await expect(b.getByText("Mercado da casa")).toBeVisible();
  await expect(b.getByText("Presente surpresa")).toHaveCount(0);
  await expect(b.getByText(/Você\s+transfere\s+R\$\s150,00\s+para\s+Ana/)).toBeVisible();

  // Reunião: combinados guardados por uma, vistos pela outra.
  const month = new Date().toISOString().slice(0, 7);
  await b.goto(`/casal/reuniao?mes=${month}`);
  await b.locator("textarea[name=decisions]").fill("Delivery no máximo 2 vezes por semana");
  await b.getByRole("button", { name: "Guardar combinados" }).click();
  await expect(b.getByText(/Combinados guardados/).first()).toBeVisible();
  await a.goto(`/casal/reuniao?mes=${month}`);
  await expect(a.locator("textarea[name=decisions]")).toHaveValue("Delivery no máximo 2 vezes por semana");

  await ctxA.close();
  await ctxB.close();
});
