import { describe, expect, it } from "vitest";
import { crc16, pixCopyPaste } from "@/domain/pix";
import { splitShared } from "@/domain/split";

describe("Pix copia e cola", () => {
  it("CRC do exemplo do manual do BR Code", () => {
    const body = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(body)).toBe("1D3D");
  });

  it("monta o código com valor, nome e cidade sem acento", () => {
    const code = pixCopyPaste({ key: "fulano@exemplo.com", name: "Lucas Valença", city: "Recife", amountCents: 12_345 });
    expect(code).toContain("0014br.gov.bcb.pix0118fulano@exemplo.com");
    expect(code).toContain("5406123.45");
    expect(code).toContain("5913LUCAS VALENCA");
    expect(code).toContain("6006RECIFE");
    expect(code).toContain("62070503***");
    expect(code.slice(-8, -4)).toBe("6304");
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });
});

describe("divisão de contas", () => {
  const people = [
    { id: "a", name: "Ana", incomeCents: 600_000 },
    { id: "b", name: "Bia", incomeCents: 400_000 },
  ] as const;
  const expenses = [
    { paidBy: "a", amountCents: 200_000 },
    { paidBy: "b", amountCents: 50_000 },
  ];

  it("meio a meio: quem pagou menos transfere a diferença", () => {
    const r = splitShared(people, expenses, "equal");
    expect(r.sharedCents).toBe(250_000);
    expect(r.people.map((p) => p.shouldPayCents)).toEqual([125_000, 125_000]);
    expect(r.settlement).toEqual({ fromId: "b", toId: "a", amountCents: 75_000 });
  });

  it("proporcional à renda: 60% e 40%", () => {
    const r = splitShared(people, expenses, "income");
    expect(r.people.map((p) => p.shouldPayCents)).toEqual([150_000, 100_000]);
    expect(r.settlement).toEqual({ fromId: "b", toId: "a", amountCents: 50_000 });
  });

  it("o que foi pago só pela outra pessoa entra inteiro na conta dela", () => {
    // Ana pagou 300 do mercado nosso e 100 de um remédio da Bia; Bia não pagou nada.
    const r = splitShared(people, [{ paidBy: "a", amountCents: 30_000 }, { paidBy: "a", amountCents: 10_000, forOther: true }], "equal");
    expect(r.forOtherCents).toBe(10_000);
    expect(r.people.map((p) => p.shouldPayCents)).toEqual([15_000, 25_000]);
    expect(r.settlement).toEqual({ fromId: "b", toId: "a", amountCents: 25_000 });
  });

  it("acerto já feito abate a diferença", () => {
    const r = splitShared(people, expenses, "equal", [{ fromId: "b", toId: "a", amountCents: 50_000 }]);
    expect(r.settlement).toEqual({ fromId: "b", toId: "a", amountCents: 25_000 });
    const done = splitShared(people, expenses, "equal", [{ fromId: "b", toId: "a", amountCents: 75_000 }]);
    expect(done.settlement).toBeNull();
  });

  it("contas acertadas não geram transferência", () => {
    expect(splitShared(people, [{ paidBy: "a", amountCents: 100 }, { paidBy: "b", amountCents: 100 }], "equal").settlement).toBeNull();
  });
});
