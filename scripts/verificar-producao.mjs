// Teste de ponta a ponta do NEXO publicado, simulando o navegador sem JavaScript
// (formulários com Server Actions e aprimoramento progressivo). Não imprime credenciais.
// Uso: BASE=https://... node smoke-prod.mjs
const BASE = process.env.BASE ?? "https://sistema-financeiro-inteligente.vercel.app";
const tz = { timeZone: "America/Sao_Paulo" };
const today = new Intl.DateTimeFormat("en-CA", tz).format(new Date());
const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4, 8)}15`;
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) failures++;
};
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html) => unesc(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = {};
  }
  keep(r) {
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const kv = c.split(";")[0];
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /max-age=0/i.test(c)) delete this.cookies[k];
      else this.cookies[k] = v;
    }
  }
  header() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async get(path) {
    const r = await fetch(BASE + path, { headers: { cookie: this.header() }, redirect: "manual" });
    this.keep(r);
    return { status: r.status, loc: r.headers.get("location") ?? "", html: await r.text() };
  }
  async submit(path, match, fields) {
    const page = await this.get(path);
    const form = page.html.split("<form").slice(1).map((s) => s.split("</form>")[0]).find((f) => f.includes(match));
    if (!form) throw new Error(`[${this.label}] formulário não encontrado em ${path} (${match}); status ${page.status}`);
    const fd = new FormData();
    for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = /name="([^"]*)"/.exec(m[0])?.[1];
      const value = unesc(/value="([^"]*)"/.exec(m[0])?.[1] ?? "");
      if (name && !(name in fields)) fd.append(name, value);
    }
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(BASE + path, { method: "POST", body: fd, headers: { cookie: this.header() }, redirect: "manual" });
    this.keep(r);
    return { status: r.status, loc: r.headers.get("location") ?? "", html: await r.text(), page: page.html };
  }
}

function options(html, selectName) {
  const sel = new RegExp(`<select[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
  return [...sel.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({ value: m[1], label: unesc(m[2]) }));
}

async function signUpAndOnboard(c, name, email, password, mascot) {
  let r = await c.submit("/criar-conta", 'name="consent"', { name, email, password, consent: "on" });
  ok(r.status === 303 && r.loc.includes("/onboarding"), `[${c.label}] cadastro (${r.status})`);
  r = await c.get("/onboarding");
  ok(r.status === 200 && text(r.html).includes(`Olá, ${name.split(" ")[0]}`), `[${c.label}] onboarding abre com o nome`);
  r = await c.submit("/onboarding?etapa=mascot", 'name="mascotId"', { mascotId: mascot });
  ok(r.status === 303 && r.loc.includes("etapa=personal"), `[${c.label}] mascote escolhido (${mascot})`);
  r = await c.submit("/onboarding?etapa=diagnosis", "Ir para meu painel", {});
  ok(r.status === 303 && r.loc.includes("/painel"), `[${c.label}] onboarding concluído`);
}

async function deleteAccount(c, password) {
  const r = await c.submit("/configuracoes/privacidade", 'name="confirmText"', { password, confirmText: "EXCLUIR" });
  ok(r.status === 303 && r.loc.includes("conta-excluida"), `[${c.label}] conta de teste excluída`);
  const after = await c.get("/painel");
  ok([302, 303, 307].includes(after.status) && after.loc.includes("/entrar"), `[${c.label}] sessão encerrada após exclusão`);
}

const stamp = Date.now();
const pwA = `TesteNexoA${stamp}`;
const pwB = `TesteNexoB${stamp}`;
const emailA = `teste.a.${stamp}@nexo.exemplo`;
const emailB = `teste.b.${stamp}@nexo.exemplo`;
const A = new Client("A");
const B = new Client("B");
const created = [];

try {
  // Páginas públicas e instalação do app.
  const anon = new Client("anônimo");
  for (const path of ["/", "/termos", "/privacidade", "/entrar", "/criar-conta"]) {
    const s = await anon.get(path);
    ok(s.status === 200, `página pública ${path} abre sem login (${s.status})`);
  }
  const home = await anon.get("/");
  const manifest = await (await fetch(BASE + "/manifest.webmanifest")).json();
  ok(manifest.short_name === "NEXO" && manifest.display === "standalone", "manifesto do app (NEXO, tela cheia)");
  const assets = [...manifest.icons.map((i) => i.src), /<link rel="apple-touch-icon" href="([^"]+)"/.exec(home.html)?.[1], /<meta property="og:image" content="([^"]+)"/.exec(home.html)?.[1]];
  const badAssets = [];
  for (const src of assets) {
    const r = src ? await fetch(new URL(unesc(src), BASE)) : null;
    if (!r?.ok || r.headers.get("content-type") !== "image/png") badAssets.push(src ?? "(ausente)");
  }
  ok(badAssets.length === 0, `ícones do app e imagem de compartilhamento (${assets.length})${badAssets.length ? `: ${badAssets.join(", ")}` : ""}`);
  const robots = await (await fetch(BASE + "/robots.txt")).text();
  ok(/Disallow: \//.test(robots) && /Allow: \/termos/.test(robots), "robots.txt libera só as páginas públicas");

  // Login inválido não entra.
  let r = await new Client("anônimo").submit("/entrar", 'name="password"', { email: "ninguem@exemplo.com", password: "senha-incorreta-1" });
  ok(r.status === 200 && /E-mail ou senha incorretos/i.test(text(r.html)), "login com senha errada é recusado");

  // Usuário A: cadastro, conta, transação, meta e aporte.
  await signUpAndOnboard(A, "Teste Alfa", emailA, pwA, "lince");
  created.push([A, pwA]);
  r = await A.get("/painel");
  ok(r.status === 200 && text(r.html).includes("Seu plano de hoje"), "[A] painel com plano de hoje");

  r = await A.submit("/contas", 'name="initialBalance"', { name: "Conta Teste Alfa", type: "checking", purpose: "spending", institution: "", initialBalance: "2.000,00", initialBalanceDate: today });
  ok(r.status === 200 && !/Não foi possível concluir/.test(text(r.html)), "[A] conta criada");
  r = await A.get("/contas");
  ok(text(r.html).includes("Conta Teste Alfa") && /R\$\s2\.000,00/.test(text(r.html)), "[A] conta aparece com saldo de R$ 2.000,00");

  r = await A.get("/movimentacoes");
  const account = options(r.html, "accountId").find((o) => o.label.includes("Conta Teste Alfa"));
  const category = options(r.html, "categoryId").find((o) => o.label.trim() === "Mercado");
  ok(!!account && !!category, "[A] conta e categoria disponíveis no formulário de transação");
  r = await A.submit("/movimentacoes", 'name="description"', { kind: "expense", method: "account", amount: "150,00", date: today, description: "Mercado teste migração", accountId: account?.value ?? "", categoryId: category?.value ?? "", status: "realized", notes: "" });
  ok(r.status === 200 && !/Não foi possível concluir/.test(text(r.html)), "[A] transação registrada");
  r = await A.get("/movimentacoes");
  ok(text(r.html).includes("Mercado teste migração"), "[A] transação aparece na lista");
  r = await A.get("/contas");
  ok(/R\$\s1\.850,00/.test(text(r.html)), "[A] saldo da conta atualizado para R$ 1.850,00");

  r = await A.submit("/metas/nova", 'name="target"', { name: "Meta Teste Alfa", kind: "travel", target: "5.000,00", targetDate: nextYear, priority: "3", contributionDay: "5", plannedMonthly: "300,00", description: "", expectedReturn: "", holdingAccountId: "" });
  const goalId = /\/metas\/([0-9a-f-]{36})/.exec(r.loc)?.[1];
  ok(r.status === 303 && !!goalId, "[A] meta criada");
  r = await A.submit(`/metas/${goalId}`, 'name="goalId"', { goalId, kind: "deposit", amount: "500,00", date: today, sourceAccountId: "", note: "" });
  ok(r.status === 200 && !/Não foi possível concluir/.test(text(r.html)), "[A] aporte registrado");
  r = await A.get(`/metas/${goalId}`);
  ok(r.status === 200 && text(r.html).includes("10%") && /R\$\s500,00/.test(text(r.html)), "[A] meta mostra R$ 500,00 e 10%");

  // Todas as telas da área logada abrem sem erro.
  const screens = ["/painel", "/painel?mes=" + today.slice(0, 7), "/posso-gastar?valor=300,00", "/assistente", "/movimentacoes", "/contas", "/cartoes", "/relatorios", "/planejamento", "/busca?q=conta", "/metas", "/metas/nova", `/metas/${goalId}`, "/orcamento", "/recorrencias", "/fluxo-de-caixa", "/importar", "/reserva", "/patrimonio", "/aposentadoria", "/alertas", "/revisao", "/conquistas", "/conexoes", "/compartilhamento", "/configuracoes", "/configuracoes/mascote", "/configuracoes/briefing", "/configuracoes/memoria", "/configuracoes/categorias", "/configuracoes/privacidade"];
  const broken = [];
  for (const path of screens) {
    const s = await A.get(path);
    // Sem os <script>: o payload do React traz os textos das telas de erro mesmo quando não aparecem.
    const t = text(s.html.replace(/<script[\s\S]*?<\/script>/g, ""));
    if (s.status !== 200 || /Algo deu errado por aqui|Página não encontrada/.test(t)) broken.push(`${path} (${s.status})`);
  }
  ok(broken.length === 0, `[A] ${screens.length} telas da área logada abrem sem erro${broken.length ? `: ${broken.join(", ")}` : ""}`);

  // Persistência: nova sessão (outro “navegador”) com login.
  const A2 = new Client("A/novo login");
  r = await A2.submit("/entrar", 'name="password"', { email: emailA, password: pwA });
  ok(r.status === 303 && r.loc.includes("/painel"), "[A] login em nova sessão");
  r = await A2.get("/metas");
  ok(text(r.html).includes("Meta Teste Alfa"), "[A] meta persiste após novo login");
  r = await A2.get("/movimentacoes");
  ok(text(r.html).includes("Mercado teste migração"), "[A] transação persiste após novo login");
  r = await A2.get("/contas");
  ok(text(r.html).includes("Conta Teste Alfa") && /R\$\s1\.850,00/.test(text(r.html)), "[A] conta e saldo persistem após novo login");

  // Usuário B: isolamento.
  await signUpAndOnboard(B, "Teste Beta", emailB, pwB, "raposa");
  created.push([B, pwB]);
  r = await B.get("/contas");
  ok(r.status === 200 && !text(r.html).includes("Conta Teste Alfa"), "[B] não vê a conta de A");
  r = await B.get("/metas");
  ok(r.status === 200 && !text(r.html).includes("Meta Teste Alfa"), "[B] não vê a meta de A");
  r = await B.get("/movimentacoes");
  ok(r.status === 200 && !text(r.html).includes("Mercado teste migração"), "[B] não vê a transação de A");
  r = await B.get(`/metas/${goalId}`);
  ok(r.status === 404, `[B] acesso direto à meta de A responde 404 (${r.status})`);
  r = await B.get("/configuracoes/mascote");
  ok(text(r.html).includes("Raposa"), "[B] mantém o próprio mascote (Raposa)");
  r = await A2.get("/configuracoes/mascote");
  ok(text(r.html).includes("Lince"), "[A] mantém o próprio mascote (Lince)");
} catch (e) {
  failures++;
  console.log(`FALHA erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  // Limpeza: as contas de teste são excluídas pelo próprio fluxo do app.
  for (const [c, pw] of created) {
    try {
      await deleteAccount(c, pw);
    } catch (e) {
      failures++;
      console.log(`FALHA limpeza de ${c.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(failures ? `RESULTADO: ${failures} falha(s)` : "RESULTADO: todas as verificações passaram");
  process.exitCode = failures ? 1 : 0;
}
