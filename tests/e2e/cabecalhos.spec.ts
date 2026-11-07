import { expect, test } from "@playwright/test";
import { quickOnboarding, signUp, uniqueEmail } from "./helpers";

test("cabeçalhos de segurança: CSP restrita e nenhuma violação nas telas", async ({ page, request }) => {
  const res = await request.get("/entrar");
  const csp = res.headers()["content-security-policy"] ?? "";
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "https://cdn.pluggy.ai"]) {
    expect(csp).toContain(directive);
  }
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");

  // Nenhum recurso bloqueado pela política ao navegar pelo app.
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/");
  await signUp(page, "Cris", uniqueEmail("cris"));
  await quickOnboarding(page);
  for (const path of ["/painel", "/movimentacoes", "/conexoes", "/assistente"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
  }
  expect(violations).toEqual([]);
});
