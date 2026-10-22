import { expect, test } from "@playwright/test";

test("páginas públicas e instalação do app funcionam sem login", async ({ page, request }) => {
  // Termos e privacidade abrem sem sessão e apontam um para o outro.
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: "Termos de uso", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Aviso de privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole("heading", { name: "Aviso de privacidade", level: 1 })).toBeVisible();

  // O cadastro leva aos dois documentos.
  await page.goto("/criar-conta");
  await expect(page.getByRole("link", { name: "termos de uso" })).toHaveAttribute("href", "/termos");
  await expect(page.getByRole("link", { name: "aviso de privacidade" })).toHaveAttribute("href", "/privacidade");

  // Manifesto, ícones e metadados para instalar na tela de início.
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "NEXO", display: "standalone", start_url: "/painel" });
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const res = await request.get(icon.src);
    expect(res.ok(), icon.src).toBe(true);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  await page.goto("/");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(appleIcon).toBeTruthy();
  expect((await request.get(appleIcon!)).ok()).toBe(true);
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toContain("opengraph-image");

  // Buscadores só indexam as páginas públicas.
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  expect(robots).toContain("Allow: /termos");
});
