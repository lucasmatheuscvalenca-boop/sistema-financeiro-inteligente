/** Gera uma página HTML com os seis mascotes em todos os estados (para revisão visual). */
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MascotArt } from "@/components/mascots/mascot-art";
import { MASCOT_IDS, MASCOT_STATES, MASCOT_STATE_LABEL, MASCOTS } from "@/mascots/catalog";

const header = `<div style="display:flex;gap:8px;margin-left:150px">${MASCOT_STATES.map((s) => `<div style="width:110px;text-align:center;font-size:12px">${MASCOT_STATE_LABEL[s]}</div>`).join("")}</div>`;
const rows = MASCOT_IDS.map(
  (id) =>
    `<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><div style="width:142px;font-size:13px"><b>${MASCOTS[id].name}</b><br>${MASCOTS[id].title}</div>${MASCOT_STATES.map((s) => renderToStaticMarkup(createElement(MascotArt, { id, state: s, size: 110 }))).join("")}</div>`,
).join("");
const out = process.argv[2] ?? "mascotes.html";
writeFileSync(out, `<!doctype html><html><body style="font-family:system-ui;background:#fff;padding:16px">${header}${rows}</body></html>`);
console.log(`Arquivo gerado: ${out}`);
