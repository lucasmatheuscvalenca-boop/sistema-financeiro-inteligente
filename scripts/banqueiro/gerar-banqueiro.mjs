// Gera todas as versões do Banqueiro a partir de design/banqueiro/banqueiro-master.svg.
//
//   node scripts/banqueiro/gerar-banqueiro.mjs        (precisa do Chromium do Playwright;
//   CHROMIUM=/caminho/do/chromium para usar outro binário)
//
// Saídas:
//   public/banqueiro/*.svg            seis expressões e variantes usadas pela interface
//   public/banqueiro/icones/*.svg     ícones de estado, independentes do personagem
//   design/banqueiro/png/*.png        as mesmas peças em PNG transparente, alta resolução
//   design/banqueiro/prancha-validacao.png   todas as peças sobre fundo claro e escuro
//
// Cada saída é montada copiando as partes nomeadas do arquivo-mestre, na ordem de camadas
// indicada abaixo. Nenhuma peça é desenhada aqui: o desenho mora só no arquivo-mestre.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const master = readFileSync(join(root, "design/banqueiro/banqueiro-master.svg"), "utf8");

const BUSTO = "0 0 200 200";
const MEIO = "0 24 200 296";
const INTEIRO = "0 24 200 404";
const cabeca = (rosto) => ["cabeca", rosto, "oculos", "nariz"];

/** Expressões: mesma moldura, mesmo enquadramento, só rosto e gesto mudam. */
export const EXPRESSOES = [
  { arquivo: "banqueiro-neutro", titulo: "Neutro", viewBox: BUSTO, partes: ["busto", ...cabeca("rosto-neutro")] },
  { arquivo: "banqueiro-analise", titulo: "Análise", viewBox: BUSTO, partes: ["braco-esq-queixo-superior", "busto", ...cabeca("rosto-analise"), "braco-esq-queixo"] },
  { arquivo: "banqueiro-orientacao", titulo: "Orientação", viewBox: BUSTO, partes: ["braco-esq-gesto-superior", "busto", "braco-esq-explica", ...cabeca("rosto-orientacao")] },
  { arquivo: "banqueiro-comemoracao", titulo: "Comemoração", viewBox: BUSTO, partes: ["braco-esq-gesto-superior", "busto", "braco-esq-comemora", ...cabeca("rosto-comemoracao")] },
  { arquivo: "banqueiro-atencao", titulo: "Atenção", viewBox: BUSTO, partes: ["busto", ...cabeca("rosto-atencao")] },
  { arquivo: "banqueiro-alerta", titulo: "Alerta", viewBox: BUSTO, partes: ["busto", ...cabeca("rosto-alerta")] },
];

export const VARIANTES = [
  { arquivo: "banqueiro-cabeca", titulo: "Retrato (cabeça)", viewBox: "40 28 120 120", partes: cabeca("rosto-neutro") },
  { arquivo: "banqueiro-avatar", titulo: "Avatar circular", viewBox: "18 24 164 164", avatar: true, partes: ["busto", ...cabeca("rosto-neutro")] },
  { arquivo: "banqueiro-meio-corpo", titulo: "Meio corpo", viewBox: MEIO, partes: ["tronco", "braco-esq-repouso", "braco-dir-repouso", "busto", ...cabeca("rosto-neutro")] },
  { arquivo: "banqueiro-corpo-inteiro", titulo: "Corpo inteiro", viewBox: INTEIRO, partes: ["pernas", "tronco", "braco-esq-repouso", "braco-dir-repouso", "busto", ...cabeca("rosto-neutro")] },
  { arquivo: "banqueiro-sidebar", titulo: "Sidebar (pequeno)", viewBox: "26 26 148 148", partes: ["busto", ...cabeca("rosto-neutro")] },
  { arquivo: "banqueiro-onboarding", titulo: "Onboarding", viewBox: MEIO, partes: ["tronco", "braco-esq-gesto-superior", "braco-dir-repouso", "busto", "braco-esq-aceno", ...cabeca("rosto-orientacao")] },
  { arquivo: "banqueiro-assistente", titulo: "Assistente", viewBox: MEIO, partes: ["tronco", "braco-esq-repouso", "braco-dir-tablet-superior", "busto", "tablet", "braco-dir-tablet", ...cabeca("rosto-neutro")] },
];

export const ICONES = [
  { arquivo: "icone-lupa", titulo: "Lupa (análise)", parte: "icone-lupa" },
  { arquivo: "icone-lampada", titulo: "Lâmpada (orientação)", parte: "icone-lampada" },
  { arquivo: "icone-trofeu", titulo: "Troféu (comemoração)", parte: "icone-trofeu" },
  { arquivo: "icone-atencao", titulo: "Atenção", parte: "icone-atencao" },
  { arquivo: "icone-alerta", titulo: "Alerta", parte: "icone-alerta" },
];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");

// Monta os SVGs no próprio navegador: DOMParser lê o mestre, as partes são clonadas pelo id.
const montados = await page.evaluate(
  ({ master, pecas, icones }) => {
    const doc = new DOMParser().parseFromString(master, "image/svg+xml");
    const NS = "http://www.w3.org/2000/svg";
    const parte = (id) => {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`Parte não encontrada no arquivo-mestre: ${id}`);
      return el.cloneNode(true);
    };
    const novo = (viewBox, titulo) => {
      const out = document.implementation.createDocument(NS, "svg", null);
      const svg = out.documentElement;
      svg.setAttribute("viewBox", viewBox);
      const [, , w, h] = viewBox.split(/\s+/).map(Number);
      svg.setAttribute("width", String(Math.round(w * 2.56)));
      svg.setAttribute("height", String(Math.round(h * 2.56)));
      const t = out.createElementNS(NS, "title");
      t.textContent = `O Banqueiro — ${titulo}`;
      svg.appendChild(t);
      return { out, svg };
    };
    const ser = (out) => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Gerado de design/banqueiro/banqueiro-master.svg por scripts/banqueiro/gerar-banqueiro.mjs. Não edite à mão. -->\n${new XMLSerializer().serializeToString(out)}\n`;
    const result = {};
    for (const p of pecas) {
      const { out, svg } = novo(p.viewBox, p.titulo);
      let alvo = svg;
      let aro = null;
      if (p.avatar) {
        const [x, y, w] = p.viewBox.split(/\s+/).map(Number);
        const cx = x + w / 2, cy = y + w / 2, r = w / 2 - 2;
        const defs = out.createElementNS(NS, "defs");
        const clip = out.createElementNS(NS, "clipPath");
        clip.setAttribute("id", "avatar-recorte");
        const c = out.createElementNS(NS, "circle");
        c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r - 2);
        clip.appendChild(c); defs.appendChild(clip); svg.appendChild(defs);
        const fundo = out.createElementNS(NS, "circle");
        fundo.setAttribute("cx", cx); fundo.setAttribute("cy", cy); fundo.setAttribute("r", r - 2);
        fundo.setAttribute("fill", "#EFE8D6");
        svg.appendChild(fundo);
        alvo = out.createElementNS(NS, "g");
        alvo.setAttribute("clip-path", "url(#avatar-recorte)");
        svg.appendChild(alvo);
        aro = out.createElementNS(NS, "circle");
        aro.setAttribute("cx", cx); aro.setAttribute("cy", cy); aro.setAttribute("r", r - 1);
        aro.setAttribute("fill", "none"); aro.setAttribute("stroke", "#D4AF57"); aro.setAttribute("stroke-width", "3");
      }
      for (const id of p.partes) alvo.appendChild(out.importNode(parte(id), true));
      if (aro) svg.appendChild(aro);
      result[p.arquivo] = ser(out);
    }
    for (const i of icones) {
      const { out, svg } = novo("-21 -21 42 42", i.titulo);
      svg.appendChild(out.importNode(parte(i.parte), true));
      result[`icones/${i.arquivo}`] = ser(out);
    }
    return result;
  },
  { master, pecas: [...EXPRESSOES, ...VARIANTES], icones: ICONES },
);

const pub = join(root, "public/banqueiro");
const png = join(root, "design/banqueiro/png");
mkdirSync(join(pub, "icones"), { recursive: true });
mkdirSync(png, { recursive: true });

/** PNG transparente: a largura de saída é fixa, a altura segue a proporção da peça. */
async function exportarPng(svg, largura, destino) {
  const m = svg.match(/viewBox="([^"]+)"/);
  const [, , w, h] = m[1].split(/\s+/).map(Number);
  const altura = Math.round((largura * h) / w);
  const inline = svg.replace(/^<\?xml[^>]*>\s*/, "").replace(/<!--[\s\S]*?-->\s*/, "").replace(/width="\d+" height="\d+"/, `width="${largura}" height="${altura}"`);
  await page.setViewportSize({ width: Math.max(largura, 200), height: Math.max(altura, 200) });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${inline}</body></html>`);
  await page.locator("svg").screenshot({ path: destino, omitBackground: true });
}

for (const [nome, svg] of Object.entries(montados)) {
  writeFileSync(join(pub, `${nome}.svg`), svg);
  const largura = nome.startsWith("icones/") ? 256 : nome === "banqueiro-sidebar" ? 256 : 1024;
  await exportarPng(svg, largura, join(png, `${nome.replace("icones/", "")}.png`));
  console.log("gerado", nome);
}
// O personagem pequeno da barra lateral também sai no tamanho de uso (48 px, com 2x).
await exportarPng(montados["banqueiro-sidebar"], 96, join(png, "banqueiro-sidebar-96.png"));

// Prancha de validação: expressões, variantes e ícones, sobre o creme e o verde-escuro.
const img = (nome, alt) => `<img alt="${alt}" src="data:image/svg+xml;base64,${Buffer.from(montados[nome]).toString("base64")}">`;
const fundo = (cor, tinta) => `
  <section style="background:${cor};color:${tinta};padding:28px 32px">
    <div class="linha">${EXPRESSOES.map((e) => `<figure>${img(e.arquivo, e.titulo)}<figcaption>${e.titulo}</figcaption></figure>`).join("")}</div>
    <div class="linha variantes">${VARIANTES.map((v) => `<figure>${img(v.arquivo, v.titulo)}<figcaption>${v.titulo}</figcaption></figure>`).join("")}</div>
    <div class="linha icones">${ICONES.map((i) => `<figure>${img(`icones/${i.arquivo}`, i.titulo)}<figcaption>${i.titulo}</figcaption></figure>`).join("")}</div>
  </section>`;
await page.setViewportSize({ width: 1400, height: 800 });
await page.setContent(`<!doctype html><html><head><style>
  body{margin:0;font:13px/1.3 system-ui,sans-serif}
  .linha{display:flex;gap:18px;align-items:flex-end;justify-content:center;margin-bottom:18px}
  figure{margin:0;text-align:center}
  .linha:first-child img{width:180px;height:180px}
  .variantes img{height:200px;width:auto}
  .icones img{width:44px;height:44px}
  figcaption{margin-top:6px;opacity:.8}
</style></head><body>${fundo("#FAF7EF", "#0F1F18")}${fundo("#061B16", "#E9F6ED")}</body></html>`);
await page.screenshot({ path: join(root, "design/banqueiro/prancha-validacao.png"), fullPage: true });
console.log("gerado design/banqueiro/prancha-validacao.png");
await browser.close();
