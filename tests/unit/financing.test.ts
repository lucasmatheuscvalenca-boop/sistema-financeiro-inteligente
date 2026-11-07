import { describe, expect, it } from "vitest";
import { amortize, compareFinancing, FinancingError, monthsToSave, validateFinancingInput, type FinancingInput } from "@/domain/financing";

const ONE_PCT_MONTH = 1.01 ** 12 - 1;

const base: FinancingInput = {
  priceCents: 30_000_000,
  downPaymentCents: 6_000_000,
  annualRate: 0.11,
  months: 360,
  system: "sac",
  savingsAnnualRate: 0.1,
  assetAnnualChange: 0.04,
  waitingMonthlyCostCents: 150_000,
};

describe("financiamento", () => {
  it("Price: parcela fixa pela fórmula clássica", () => {
    const r = amortize(10_000_000, ONE_PCT_MONTH, 12, "price");
    expect(r.firstInstallmentCents).toBe(888_488);
    expect(Math.abs(r.lastInstallmentCents - 888_488)).toBeLessThanOrEqual(2);
    expect(r.installmentsTotalCents - r.interestCents).toBe(10_000_000);
    expect(r.years).toEqual([{ year: 1, balanceCents: 0, paidCents: r.installmentsTotalCents }]);
  });

  it("SAC: amortização constante e parcelas decrescentes", () => {
    const r = amortize(12_000_000, ONE_PCT_MONTH, 12, "sac");
    expect(r.firstInstallmentCents).toBe(1_120_000);
    expect(r.lastInstallmentCents).toBe(1_010_000);
    expect(r.interestCents).toBe(780_000);
  });

  it("juros zero divide o valor em parcelas iguais", () => {
    const r = amortize(120_000, 0, 12, "price");
    expect(r.firstInstallmentCents).toBe(10_000);
    expect(r.interestCents).toBe(0);
  });

  it("juntar antes: sem rendimento nem valorização, leva preço ÷ depósito meses", () => {
    const s = monthsToSave({ ...base, priceCents: 120_000, downPaymentCents: 0, savingsAnnualRate: 0, assetAnnualChange: 0, waitingMonthlyCostCents: 0 }, 10_000);
    expect(s.months).toBe(12);
    expect(s.depositedCents).toBe(120_000);
    expect(s.earningsCents).toBe(0);
  });

  it("juntar antes não chega quando o bem sobe mais rápido que os depósitos", () => {
    const s = monthsToSave({ ...base, priceCents: 100_000_000, downPaymentCents: 0, savingsAnnualRate: 0, assetAnnualChange: 0.5 }, 1_000);
    expect(s.months).toBeNull();
  });

  it("compara os dois caminhos com o custo da espera", () => {
    const c = compareFinancing(base);
    expect(c.financing.financedCents).toBe(24_000_000);
    expect(c.financing.totalPaidCents).toBe(base.downPaymentCents + c.financing.installmentsTotalCents);
    expect(c.saving.months).toBeGreaterThan(0);
    expect(c.saving.waitingCostCents).toBe(150_000 * c.saving.months!);
    expect(c.differenceCents).toBe(c.financing.totalPaidCents - (c.saving.depositedCents! + c.saving.waitingCostCents!));
  });

  it("valida as premissas", () => {
    expect(validateFinancingInput({ ...base, downPaymentCents: base.priceCents })).toContain("A entrada já cobre o valor do bem: não há o que financiar.");
    expect(() => compareFinancing({ ...base, months: 0 })).toThrow(FinancingError);
  });
});
