import { expect, test } from "@playwright/test";

test("rotina diária: a chamada passa pelo servidor sem ser mandada para o login", async ({ request }) => {
  // Sem segredo nem user-agent da Vercel: a própria rota recusa (401), sem redirecionar para /entrar.
  const denied = await request.get("/api/cron/sync", { maxRedirects: 0 });
  expect(denied.status()).toBe(401);
  expect(denied.headers()["location"]).toBeUndefined();
  expect(await denied.json()).toEqual({ error: "unauthorized" });

  // Como a Vercel chama (sem cookie, user-agent vercel-cron): a rotina roda (ou respeita o intervalo de 20 min).
  const run = await request.get("/api/cron/sync", { maxRedirects: 0, headers: { "user-agent": "vercel-cron/1.0" } });
  expect([200, 429]).toContain(run.status());
  expect(run.headers()["location"]).toBeUndefined();
  const body = await run.json();
  if (run.status() === 200) expect(body).toMatchObject({ cleanup: expect.any(Object) });
  else expect(body).toEqual({ skipped: "cooldown" });

  // As páginas privadas continuam protegidas pelo proxy.
  const page = await request.get("/painel", { maxRedirects: 0 });
  expect(page.status()).toBe(307);
  expect(page.headers()["location"]).toContain("/entrar");
});
