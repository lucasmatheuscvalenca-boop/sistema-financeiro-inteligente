/** Imprime o SVG do Banqueiro numa expressão (usado por gerar-icones.mjs). Uso: tsx scripts/banqueiro-svg.ts guidance 200 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BankerArt } from "@/components/mascots/banker-art";
import { MASCOT_STATES, type MascotState } from "@/mascots/catalog";

const state = (process.argv[2] ?? "guidance") as MascotState;
if (!MASCOT_STATES.includes(state)) throw new Error(`Expressão desconhecida: ${state}`);
const size = Number(process.argv[3] ?? 200);
process.stdout.write(renderToStaticMarkup(createElement(BankerArt, { state, size, decorative: true })));
