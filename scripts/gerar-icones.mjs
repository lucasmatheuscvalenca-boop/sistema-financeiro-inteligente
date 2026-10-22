// Gera os ícones do app e a imagem de compartilhamento a partir da marca NEXO.
// Uso: node scripts/gerar-icones.mjs . (precisa do Chromium do Playwright)
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const NAVY = "#0B1F3B";
const mark = (scale) => {
  // Mesma geometria do LogoMark (viewBox 40), centralizada e escalada.
  const t = 20 - 20 * scale;
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <rect x="4" y="4" width="10" height="32" rx="5" fill="url(#a)"/>
    <rect x="26" y="4" width="10" height="32" rx="5" fill="url(#a)"/>
    <path d="M8.6 6.6a5 5 0 0 1 7.6-1.1l17.6 23.9a5 5 0 0 1-8 6L8.2 11.5a5 5 0 0 1 .4-4.9Z" fill="url(#b)"/></g>`;
};
const defs = `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD3D3"/><stop offset="1" stop-color="#0EA5A5"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B8E92"/><stop offset="1" stop-color="#0B5F6E"/></linearGradient></defs>`;
const squareIcon = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="100%" height="100%">${defs}<rect width="40" height="40" fill="${NAVY}"/>${mark(scale)}</svg>`;

const browser = await chromium.launch();
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
const mascots = ["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"]
  .map((m) => `<img src="data:image/webp;base64,${readFileSync(join(root, `public/mascots/${m}/neutral.v2.webp`)).toString("base64")}" style="height:150px;width:auto"/>`)
  .join("");
const og = `<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
  .wrap{box-sizing:border-box;width:1200px;height:630px;background:${NAVY};font-family:Inter,sans-serif;color:#fff;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
  .glow{position:absolute;right:-160px;top:-160px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(14,165,165,.35),transparent 70%)}
  .brand{display:flex;align-items:center;gap:22px}.brand span{font-size:64px;font-weight:800;letter-spacing:.02em}
  h1{margin:28px 0 0;font-size:54px;line-height:1.12;font-weight:700;max-width:860px}
  h1 em{font-style:normal;color:#3FD3D3}
  p{margin:18px 0 0;font-size:26px;color:rgba(255,255,255,.75);max-width:900px}
  .mascots{display:flex;gap:18px;align-items:flex-end;position:absolute;right:72px;bottom:56px}
  .gold{position:absolute;left:80px;bottom:72px;height:6px;width:120px;border-radius:3px;background:#F59E0B}</style>
  <div class="wrap"><div class="glow"></div>
    <div><div class="brand"><svg viewBox="0 0 40 40" width="84" height="84">${defs}${mark(1)}</svg><span>NEXO</span></div>
    <h1>Seu futuro em <em>boas decisões</em></h1>
    <p>Central financeira, metas, “Posso gastar?” e planejamento de vida, com um mascote consultor.</p></div>
    <div class="mascots">${mascots}</div><div class="gold"></div></div>`;
await shot(og, 1200, 630, join(root, "src/app/opengraph-image.png"));
await browser.close();
