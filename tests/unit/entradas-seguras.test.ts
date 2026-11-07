import { describe, expect, it } from "vitest";
import { csvMoneyCell, csvTextCell } from "@/lib/csv-export";
import { safeNext } from "@/lib/safe-next";

describe("destino depois do login", () => {
  it("aceita caminhos deste site", () => {
    expect(safeNext("/movimentacoes?mes=2026-10")).toBe("/movimentacoes?mes=2026-10");
    expect(safeNext("/metas/123#aportes")).toBe("/metas/123#aportes");
    expect(safeNext("/")).toBe("/");
  });

  it("recusa outra origem, barras invertidas, esquemas e caracteres de controle", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "https://evil.com/painel",
      "javascript:alert(1)",
      "painel",
      "/\t/evil.com",
      "/\n/evil.com",
      "/painel\r\nSet-Cookie: x=1",
      "/\u0000",
      "",
      null,
      42,
    ]) {
      expect(safeNext(bad)).toBe("/painel");
    }
  });
});

describe("exportação em CSV", () => {
  it("texto que começa com = + - @ vira texto, não fórmula", () => {
    expect(csvTextCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvTextCell("+5511999999999")).toBe("'+5511999999999");
    expect(csvTextCell("-2+3")).toBe("'-2+3");
    expect(csvTextCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvTextCell("\tcmd")).toBe("'\tcmd");
    expect(csvTextCell("Mercado; Extra")).toBe("\"Mercado; Extra\"");
    expect(csvTextCell("Padaria")).toBe("Padaria");
  });

  it("valor em reais continua número (negativo sem apóstrofo)", () => {
    expect(csvMoneyCell(-4590)).toBe("-45,90");
    expect(csvMoneyCell(150000)).toBe("1500,00");
  });
});
