import { describe, expect, it } from "vitest";
import { cardLabel, formatDecimal, plural } from "@/domain/text";

describe("plural e decimal em português", () => {
  it("escolhe singular ou plural pela quantidade", () => {
    expect(plural(1, "mês", "meses")).toBe("1 mês");
    expect(plural(0, "mês", "meses")).toBe("0 meses");
    expect(plural(3, "cartão", "cartões")).toBe("3 cartões");
    expect(plural(2.9, "mês", "meses")).toBe("2,9 meses");
    expect(plural(1.04, "mês", "meses")).toBe("1 mês");
  });

  it("usa vírgula e corta zeros", () => {
    expect(formatDecimal(4.5)).toBe("4,5");
    expect(formatDecimal(3)).toBe("3");
    expect(formatDecimal(2.94)).toBe("2,9");
    expect(formatDecimal(1234.5)).toBe("1.234,5");
    expect(formatDecimal(0.0425, 2)).toBe("0,04");
  });
});

describe("nome do cartão", () => {
  it("não repete a palavra cartão", () => {
    expect(cardLabel("Nubank")).toBe("Cartão Nubank");
    expect(cardLabel("Cartão (fictício)")).toBe("Cartão (fictício)");
    expect(cardLabel("cartao azul")).toBe("cartao azul");
  });
});
