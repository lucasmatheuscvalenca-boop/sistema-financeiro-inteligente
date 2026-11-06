/** Gera uma página HTML com O Banqueiro em todas as expressões, nos dois temas (para revisão visual). */
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BankerArt } from "@/components/mascots/banker-art";
import { MASCOT_STATES, MASCOT_STATE_LABEL } from "@/mascots/catalog";

function row(bg: string, fg: string, surface: string) {
  const cells = MASCOT_STATES.map((s) => `<figure style="margin:0;text-align:center"><div>${renderToStaticMarkup(createElement(BankerArt, { state: s, size: 160, decorative: true }))}</div><figcaption style="font-size:13px;margin-top:6px">${MASCOT_STATE_LABEL[s]}</figcaption></figure>`).join("");
  return `<section style="--surface:${surface};background:${bg};color:${fg};padding:24px;display:flex;gap:16px;justify-content:center">${cells}</section>`;
}

const out = process.argv[2] ?? "banqueiro.html";
writeFileSync(out, `<!doctype html><html><body style="font-family:system-ui;margin:0">${row("#F7F5EF", "#0F1F18", "#ffffff")}${row("#061B16", "#F2F0E9", "#0B241D")}</body></html>`);
console.log(`Arquivo gerado: ${out}`);
