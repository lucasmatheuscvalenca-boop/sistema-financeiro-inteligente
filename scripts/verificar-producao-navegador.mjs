// Teste do NEXO publicado num navegador real (Chromium), como um usuário no iPad, no celular
// e no computador: cadastro, mascote, conta, meta com aporte pelo diálogo, assistente,
// tema escuro, todas as telas sem erro nem rolagem horizontal, imagens e fontes carregadas.
// No fim exclui a conta de teste pelo próprio app. Não imprime credenciais.
// Uso: BASE=https://... node scripts/verificar-producao-navegador.mjs
// (CHROMIUM=/caminho/do/chromium se o navegador do Playwright estiver em outro lugar)
const { chromium, devices } = await import("playwright").catch(() => import("@playwright/test"));

const BASE = process.env.BASE ?? "https://sistema-financeiro-inteligente.vercel.app";
const stamp = Date.now();
const email = `teste.navegador.${stamp}@nexo.exemplo`;
const password = `TesteNavegador${stamp}`;
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) failures++;
};

const SCREENS = ["/painel", "/posso-gastar?valor=300,00", "/assistente", "/movimentacoes", "/contas", "/cartoes", "/relatorios", "/planejamento", "/busca?q=conta", "/metas", "/metas/nova", "/orcamento", "/recorrencias", "/fluxo-de-caixa", "/importar", "/reserva", "/patrimonio", "/aposentadoria", "/alertas", "/revisao", "/conquistas", "/conexoes", "/compartilhamento", "/configuracoes", "/configuracoes/mascote", "/configuracoes/briefing", "/configuracoes/memoria", "/configuracoes/categorias", "/configuracoes/privacidade"];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const problems = [];
function watch(page, label) {
  page.on("pageerror", (e) => problems.push(`[${label}] erro de JavaScript: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`[${label}] ${r.status()} em ${new URL(r.url()).pathname}`);
  });
}
const visible = (page, text) => page.getByText(text).filter({ visible: true }).first();

async function sweep(context, label, routes) {
  const page = await context.newPage();
  watch(page, label);
  const bad = [];
  for (const path of routes) {
    const resp = await page.goto(BASE + path, { waitUntil: "networkidle" });
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      error: /Algo deu errado por aqui|Página não encontrada/.test(document.body.innerText),
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src")),
      // Elementos (sem filhos também vazando) que passam da largura da tela, para diagnóstico.
      wide: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > document.documentElement.clientWidth + 1))
        .slice(0, 3)
        .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.getAttribute("class") ?? "").slice(0, 90)}">${(el.textContent ?? "").trim().slice(0, 40)}`),
    }));
    if (resp?.status() !== 200 || state.error || state.overflow > 1 || state.brokenImages.length)
      bad.push(`${path} (status ${resp?.status()}, rolagem ${state.overflow}px${state.overflow > 1 ? ` por ${state.wide.join(" | ")}` : ""}${state.error ? ", tela de erro" : ""}${state.brokenImages.length ? `, imagens quebradas: ${state.brokenImages.join(" ")}` : ""})`);
  }
  ok(bad.length === 0, `[${label}] ${routes.length} telas abrem sem erro, sem rolagem horizontal e com imagens${bad.length ? `: ${bad.join("; ")}` : ""}`);
  await page.close();
}

let ipad;
let created = false;
try {
  // iPad em pé: navegação inferior (abaixo de 1024 px de largura).
  ipad = await browser.newContext({ ...devices["iPad Mini"], viewport: { width: 768, height: 1024 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ipad.newPage();
  watch(page, "iPad");
  page.setDefaultTimeout(30_000);

  await page.goto(`${BASE}/criar-conta`);
  await page.fill("input[name=name]", "Teste Navegador");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.check("input[name=consent]");
  await page.getByRole("button", { name: "Criar conta e começar" }).click();
  await page.waitForURL(/\/onboarding/);
  created = true;
  ok(true, "[iPad] cadastro pelo formulário");

  await page.getByRole("button", { name: /Começar/ }).click();
  await page.waitForURL(/etapa=mascot/);
  await page.getByTestId("mascote-capivara").click();
  await page.getByRole("button", { name: /Confirmar escolha: Capivara/ }).click();
  await page.waitForURL(/etapa=personal/);
  await page.getByRole("button", { name: "Terminar depois" }).click();
  await page.waitForURL(/\/painel/);
  await visible(page, "Seu plano de hoje").waitFor();
  ok(await page.getByRole("navigation", { name: "Atalhos" }).isVisible(), "[iPad] mascote escolhido, painel com plano de hoje e navegação inferior");
  ok(await page.evaluate(() => document.fonts.check("16px 'Inter Variable'")), "[iPad] fonte Inter carregada");

  await page.goto(`${BASE}/contas`);
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  const accDialog = page.locator("dialog[open]");
  await accDialog.locator("input[name=name]").fill("Conta Navegador");
  await accDialog.locator("input[name=initialBalance]").fill("3.000,00");
  await accDialog.getByRole("button", { name: "Criar conta" }).click();
  await visible(page, "Conta Navegador").waitFor();
  ok(await visible(page, /R\$\s3\.000,00/).isVisible(), "[iPad] conta criada pelo diálogo com R$ 3.000,00");

  await page.goto(`${BASE}/metas/nova`);
  await page.fill("input[name=name]", "Viagem Navegador");
  await page.fill("input[name=target]", "6.000,00");
  const d = new Date();
  await page.fill("input[name=targetDate]", `${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, "0")}-15`);
  await page.fill("input[name=plannedMonthly]", "500,00");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await page.waitForURL(/\/metas\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Adicionar aporte" }).click();
  const goalDialog = page.locator("dialog[open]");
  await goalDialog.locator("input[name=amount]").fill("600,00");
  await goalDialog.getByRole("button", { name: "Registrar" }).click();
  await page.getByRole("status").filter({ hasText: /Aporte de R\$\s600,00 registrado em Viagem Navegador/ }).waitFor();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  ok(await page.getByText("10%", { exact: true }).first().isVisible(), "[iPad] meta criada; aporte pelo diálogo com aviso na tela e progresso de 10%");

  await page.goto(`${BASE}/assistente`);
  await page.getByPlaceholder(/Posso gastar R\$ 600/).fill("Quanto ainda posso gastar hoje?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await visible(page, /Valor máximo para gastar hoje/).waitFor();
  await page.waitForURL(/\?c=/);
  ok(true, "[iPad] assistente responde com os números do motor de cálculo");

  await page.goto(`${BASE}/painel`);
  const toggle = page.getByRole("button", { name: /Alternar tema/ }).first();
  for (let i = 0; i < 3 && !(await page.locator("html.dark").count()); i++) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
  await page.goto(`${BASE}/metas`);
  ok((await page.locator("html.dark").count()) === 1, "[iPad] tema escuro escolhido e mantido entre páginas");

  await sweep(ipad, "iPad", SCREENS);
  const state = await ipad.storageState();
  const phone = await browser.newContext({ ...devices["iPhone 13"], storageState: state, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await sweep(phone, "iPhone", SCREENS);
  await phone.close();
  const landscape = await browser.newContext({ ...devices["iPad (gen 7) landscape"], viewport: { width: 1080, height: 810 }, storageState: state, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await sweep(landscape, "iPad deitado", SCREENS);
  await landscape.close();
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 }, storageState: state, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await sweep(desktop, "computador", SCREENS);
  await desktop.close();
} catch (e) {
  failures++;
  console.log(`FALHA erro inesperado: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
} finally {
  if (created && ipad) {
    try {
      const page = await ipad.newPage();
      await page.goto(`${BASE}/configuracoes/privacidade`);
      await page.fill("input[name=password]", password);
      await page.fill("input[name=confirmText]", "EXCLUIR");
      await page.getByRole("button", { name: "Excluir minha conta" }).click();
      await page.waitForURL(/conta-excluida/);
      ok(true, "conta de teste excluída pelo app");
    } catch (e) {
      failures++;
      console.log(`FALHA limpeza da conta de teste: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  ok(problems.length === 0, `nenhum erro de JavaScript nem resposta 5xx${problems.length ? `: ${problems.slice(0, 8).join("; ")}` : ""}`);
  await browser.close();
  console.log(failures ? `RESULTADO: ${failures} falha(s)` : "RESULTADO: todas as verificações passaram");
  process.exitCode = failures ? 1 : 0;
}
