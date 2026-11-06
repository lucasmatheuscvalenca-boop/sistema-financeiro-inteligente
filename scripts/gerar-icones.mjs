// Gera os ícones do app e a imagem de compartilhamento a partir da marca Meu Banqueiro.
// Uso: node scripts/gerar-icones.mjs . (precisa do Chromium do Playwright)
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const NAVY = "#061B16";
const mark = (scale) => {
  // Mesma geometria do LogoMark (viewBox 40): laço dourado em espiral, centralizado e escalado.
  const t = 20 - 20 * scale;
  return `<g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke="url(#g)" stroke-linecap="round">
    <path d="M30.5 13.5 A12.5 12.5 0 1 0 32.5 22" stroke-width="4.6"/>
    <path d="M32.5 22 C30 28 22 29 18 25 C14.5 21.5 17 15.5 22 15.5 C26 15.5 27.5 20 24.5 22" stroke-width="3.4"/></g>`;
};
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D78F"/><stop offset="0.55" stop-color="#D4AF57"/><stop offset="1" stop-color="#B8923B"/></linearGradient></defs>`;
const squareIcon = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="100%" height="100%">${defs}<rect width="40" height="40" fill="${NAVY}"/>${mark(scale)}</svg>`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: w, height: h } });
  console.log("gerado", out);
}

mkdirSync(join(root, "public/icons"), { recursive: true });
// iOS arredonda os cantos sozinho: ícone quadrado, sem transparência.
await shot(squareIcon(0.62), 180, 180, join(root, "src/app/apple-icon.png"));
await shot(squareIcon(0.62), 192, 192, join(root, "public/icons/icon-192.png"));
await shot(squareIcon(0.62), 512, 512, join(root, "public/icons/icon-512.png"));
// Maskable: a marca cabe no círculo seguro de 80% do diâmetro.
await shot(squareIcon(0.5), 512, 512, join(root, "public/icons/icon-maskable-512.png"));

// Imagem de compartilhamento (1200×630).
const font = readFileSync(join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).toString("base64");
const serif = readFileSync(join(root, "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2")).toString("base64");
// O Banqueiro em três expressões, com os PNGs aprovados do kit (sem alteração) e a mesma área
// visível usada pelo componente BanqueiroMascot (esconde a pílula de rótulo da comemoração).
const KIT = [
  ["expressoes/03-analise.png", 137, 183, [0, 0, 137, 183]],
  ["expressoes/04-orientacao.png", 138, 180, [0, 0, 138, 180]],
  ["expressoes/05-comemoracao.png", 200, 198, [0, 0, 200, 193]],
];
const ALTURA = 236;
const mascots = KIT.map(([arq, w, h, [cx, cy, cw, ch]]) => {
  const k = ALTURA / ch;
  const src = `data:image/png;base64,${readFileSync(join(root, "public/assets/banqueiro", arq)).toString("base64")}`;
  return `<span style="position:relative;display:block;overflow:hidden;width:${cw * k}px;height:${ch * k}px"><img src="${src}" style="position:absolute;left:${-cx * k}px;top:${-cy * k}px;width:${w * k}px;height:${h * k}px;object-fit:contain"></span>`;
}).join("");
const og = `<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
  @font-face{font-family:Fraunces;src:url(data:font/woff2;base64,${serif}) format("woff2");font-weight:100 900}
  .wrap{box-sizing:border-box;width:1200px;height:630px;background:${NAVY};font-family:Inter,sans-serif;color:#fff;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
  .glow{position:absolute;right:-160px;top:-160px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(63,191,127,.28),transparent 70%)}.glow2{position:absolute;left:-120px;bottom:-200px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(212,175,87,.16),transparent 70%)}
  .brand{display:flex;align-items:center;gap:22px}.brand span{font-family:Fraunces,serif;font-size:56px;font-weight:600;letter-spacing:-.01em}
  h1{margin:28px 0 0;font-family:Fraunces,serif;font-size:60px;line-height:1.1;font-weight:600;letter-spacing:-.01em;max-width:760px}
  h1 em{font-style:normal;color:#E8C77A}
  p{margin:18px 0 0;font-size:26px;color:rgba(255,255,255,.75);max-width:900px}
  .mascots{display:flex;gap:8px;align-items:flex-end;position:absolute;right:56px;bottom:0}
  .gold{position:absolute;left:80px;bottom:72px;height:4px;width:120px;border-radius:2px;background:#D4AF57}</style>
  <div class="wrap"><div class="glow"></div><div class="glow2"></div>
    <div><div class="brand"><svg viewBox="0 0 40 40" width="84" height="84">${defs}${mark(1)}</svg><span>Meu Banqueiro</span></div>
    <h1>Seu dinheiro em <em>boas mãos</em></h1>
    <p>Central financeira, metas, “Posso gastar?” e planejamento de vida, com O Banqueiro explicando cada passo.</p></div>
    <div class="mascots">${mascots}</div><div class="gold"></div></div>`;
await shot(og, 1200, 630, join(root, "src/app/opengraph-image.png"));
await browser.close();
