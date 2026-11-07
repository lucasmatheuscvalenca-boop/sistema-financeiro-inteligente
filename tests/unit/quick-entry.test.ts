import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "@/server/ai/quick-entry";

const today = "2026-11-07";

describe("registrar gasto por texto", () => {
  it.each([
    ["gastei 80 no mercado", { kind: "expense", amountCents: 8_000, description: "Mercado", date: today, card: false }],
    ["paguei 120,50 de luz ontem", { kind: "expense", amountCents: 12_050, description: "Luz", date: "2026-11-06", card: false }],
    ["comprei um tênis de R$ 300 no cartão", { kind: "expense", amountCents: 30_000, description: "Tênis", date: today, card: true }],
    ["recebi 500 de freela", { kind: "income", amountCents: 50_000, description: "Freela", date: today, card: false }],
    ["anota 45 padaria dia 3", { kind: "expense", amountCents: 4_500, description: "Padaria", date: "2026-11-03", card: false }],
    ["gastei 1.250,00 no conserto do carro dia 20", { kind: "expense", amountCents: 125_000, description: "Conserto do carro", date: "2026-10-20", card: false }],
    ["paguei 90", { kind: "expense", amountCents: 9_000, description: "Despesa", date: today, card: false }],
  ])("%s", (text, expected) => {
    expect(parseQuickEntry(text, today)).toEqual(expected);
  });

  it.each(["posso gastar 300 com jantar?", "quanto gastei com mercado", "gastei mais esse mês?", "gastei muito no mercado", "qual meu saldo?", "comprei"])("não é registro: %s", (text) => {
    expect(parseQuickEntry(text, today)).toBeNull();
  });
});
