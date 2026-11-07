import { describe, expect, it } from "vitest";
import { baseDescription, bestPurchaseDay, groupInstallments, installmentsByMonth, type InstallmentRowInput } from "@/domain/installments";

const row = (o: Partial<InstallmentRowInput>): InstallmentRowInput => ({ cardId: "c1", planId: null, description: "Loja X 2/10", amountCents: 10_000, number: 2, count: 10, reference: "2026-11", ...o });

describe("central de parcelas", () => {
  it("reconhece a parcela no fim da descrição", () => {
    expect(baseDescription("MAGAZINE LUIZA 03/12")).toBe("MAGAZINE LUIZA");
    expect(baseDescription("Geladeira (2/10)")).toBe("Geladeira");
    expect(baseDescription("Notebook - Parcela 4 de 6")).toBe("Notebook");
    expect(baseDescription("Mercado")).toBe("Mercado");
  });

  it("projeta as parcelas que o banco ainda não mandou", () => {
    const g = groupInstallments([row({ description: "Loja X 01/10", number: 1, reference: "2026-10" }), row({ description: "Loja X 02/10" })], "2026-11");
    expect(g).toHaveLength(1);
    expect(g[0]!.paidCount).toBe(1);
    expect(g[0]!.remainingCount).toBe(9);
    expect(g[0]!.remainingCents).toBe(90_000);
    expect(g[0]!.lastReference).toBe("2027-07");
    expect(g[0]!.schedule.filter((p) => p.projected)).toHaveLength(8);
  });

  it("compra antiga importada no meio conta as parcelas anteriores como pagas", () => {
    const g = groupInstallments([row({ description: "TV 7/10", number: 7 })], "2026-11");
    expect(g[0]!.paidCount).toBe(6);
    expect(g[0]!.remainingCount).toBe(4);
  });

  it("plano criado no app usa as parcelas gravadas, sem projetar de novo", () => {
    const rows = [1, 2, 3].map((n) => row({ planId: "p1", description: `Sofá (${n}/3)`, number: n, count: 3, reference: `2026-${String(9 + n).padStart(2, "0")}` }));
    const g = groupInstallments(rows, "2026-11");
    expect(g[0]!.schedule.every((p) => !p.projected)).toBe(true);
    expect(g[0]!.remainingCount).toBe(2);
    expect(g[0]!.description).toBe("Sofá");
  });

  it("some quando a última parcela já passou e ignora compras à vista", () => {
    expect(groupInstallments([row({ number: 10, reference: "2026-09" }), row({ count: 1, number: 1 })], "2026-11")).toEqual([]);
  });

  it("soma as parcelas por mês de fatura", () => {
    const g = groupInstallments([row({ number: 9 }), row({ cardId: "c2", description: "Outra 1/2", count: 2, number: 1, amountCents: 5_000 })], "2026-11");
    expect(installmentsByMonth(g, "2026-11", 3)).toEqual([
      { reference: "2026-11", cents: 15_000 },
      { reference: "2026-12", cents: 15_000 },
      { reference: "2027-01", cents: 0 },
    ]);
  });

  it("melhor dia de compra é o dia do fechamento", () => {
    const b = bestPurchaseDay({ closingDay: 3, dueDay: 10 }, "2026-11-07");
    expect(b.day).toBe(3);
    expect(b.nextClosing).toBe("2026-12-03");
    expect(b.daysToClosing).toBe(26);
    // Compra em 03/12 entra na fatura que fecha 03/01 e vence 10/01: 38 dias.
    expect(b.daysToPay).toBe(38);
  });
});
