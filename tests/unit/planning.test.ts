import { describe, expect, it } from "vitest";
import { evaluateReserve, recommendedReserveMonths } from "@/domain/emergency";
import { simulateIncomeShock, spendingChanges } from "@/domain/insights";
import { computeNetWorth } from "@/domain/net-worth";
import { planRetirement, realAnnualRate, RetirementError, type RetirementInput } from "@/domain/retirement";

describe("reserva de emergência", () => {
  it("recomenda cobertura conforme estabilidade, dependentes e dívidas", () => {
    expect(recommendedReserveMonths({ employment: "clt" }).months).toBe(6);
    expect(recommendedReserveMonths({ employment: "public_servant" }).months).toBe(3);
    expect(recommendedReserveMonths({ employment: "self_employed" }).months).toBe(12);
    const r = recommendedReserveMonths({ employment: "clt", incomeStability: "variable", dependents: 2, hasDebts: true });
    expect(r.months).toBe(12);
    expect(r.reasons).toHaveLength(4);
  });

  it("avalia progresso, cobertura e cenários", () => {
    const r = evaluateReserve({ currentCents: 600000, monthlyEssentialCents: 400000, targetMonths: 6, today: "2026-10-21" });
    expect(r.targetCents).toBe(2400000);
    expect(r.gapCents).toBe(1800000);
    expect(r.progressPct).toBe(25);
    expect(r.coverageMonths).toBe(1.5);
    expect(r.status).toBe("building");
    expect(r.belowMinimum).toBe(true);
    expect(r.recommendedContributionCents).toBe(150000);
    expect(r.monthsToComplete).toBe(12);
    expect(r.completionDate).toBe("2027-10-21");
    expect(r.scenarios.map((s) => s.monthsToComplete)).toEqual([24, 12, 8, 6]);
  });

  it("respeita a capacidade mensal e reconhece reserva completa", () => {
    const limited = evaluateReserve({ currentCents: 0, monthlyEssentialCents: 300000, targetMonths: 6, today: "2026-10-21", monthlyCapacityCents: 50000 });
    expect(limited.recommendedContributionCents).toBe(50000);
    expect(limited.status).toBe("empty");
    const done = evaluateReserve({ currentCents: 2000000, monthlyEssentialCents: 300000, targetMonths: 6, today: "2026-10-21" });
    expect(done.status).toBe("complete");
    expect(done.belowMinimum).toBe(false);
    expect(evaluateReserve({ currentCents: 0, monthlyEssentialCents: 0, targetMonths: 6, today: "2026-10-21" }).status).toBe("not_configured");
  });
});

describe("aposentadoria", () => {
  const base: RetirementInput = {
    currentAge: 30,
    retirementAge: 60,
    lifeExpectancy: 90,
    desiredMonthlyIncomeCents: 1000000,
    otherMonthlyIncomeCents: 300000,
    currentWealthCents: 5000000,
    monthlyContributionCents: 150000,
    annualInflation: 0.04,
    annualNominalReturn: 0.09,
    safetyMarginPct: 0,
  };

  it("retorno real pela equação de Fisher", () => {
    expect(realAnnualRate(0.09, 0.04).toNumber()).toBeCloseTo(0.048077, 5);
  });

  it("calcula capital necessário, patrimônio projetado e aporte necessário coerentes", () => {
    const r = planRetirement(base);
    expect(r.monthsToRetirement).toBe(360);
    expect(r.monthsInRetirement).toBe(360);
    expect(r.monthlyNeedRealCents).toBe(700000);
    // Com o aporte necessário, o patrimônio projetado deve igualar o capital necessário.
    const funded = planRetirement({ ...base, monthlyContributionCents: r.requiredMonthlyContributionRealCents });
    expect(funded.onTrack).toBe(true);
    // O aporte é arredondado para cima ao centavo, então o projetado cobre o necessário com sobra mínima.
    const surplus = funded.projectedWealthRealCents - r.requiredCapitalRealCents;
    expect(surplus).toBeGreaterThanOrEqual(0);
    expect(surplus / r.requiredCapitalRealCents).toBeLessThan(1e-5);
    // Nominal = real corrigido pela inflação
    expect(r.projectedWealthNominalCents).toBeGreaterThan(r.projectedWealthRealCents * 3);
    expect(r.scenarios.map((s) => s.key)).toEqual(["conservative", "base", "optimistic"]);
    expect(r.scenarios[0]!.projectedWealthRealCents).toBeLessThan(r.scenarios[2]!.projectedWealthRealCents);
    expect(r.assumptions.some((a) => a.includes("não são garantias"))).toBe(true);
  });

  it("começar depois exige aportes maiores", () => {
    const r = planRetirement(base);
    const values = r.costOfWaiting.map((c) => c.requiredMonthlyContributionRealCents);
    expect(values).toHaveLength(3);
    expect(values[0]!).toBeGreaterThan(r.requiredMonthlyContributionRealCents);
    expect(values[2]!).toBeGreaterThan(values[0]!);
  });

  it("detecta esgotamento do patrimônio quando o plano é insuficiente", () => {
    const r = planRetirement({ ...base, monthlyContributionCents: 0, currentWealthCents: 0 });
    expect(r.onTrack).toBe(false);
    expect(r.depletionAge).not.toBeNull();
    expect(r.warnings.join(" ")).toContain("esgotaria");
  });

  it("viver de renda exige mais capital que consumir até a idade-horizonte", () => {
    const consume = planRetirement(base);
    const perpetuity = planRetirement({ ...base, mode: "perpetuity" });
    expect(perpetuity.requiredCapitalRealCents).toBeGreaterThan(consume.requiredCapitalRealCents);
  });

  it("valida premissas impossíveis", () => {
    expect(() => planRetirement({ ...base, retirementAge: 25 })).toThrow(RetirementError);
    expect(() => planRetirement({ ...base, lifeExpectancy: 55 })).toThrow(RetirementError);
    expect(() => planRetirement({ ...base, annualInflation: 3 })).toThrow(RetirementError);
  });
});

describe("patrimônio", () => {
  it("separa procedência e ignora projeções", () => {
    const r = computeNetWorth([
      { id: "1", name: "Conta", side: "asset", category: "cash", valueCents: 500000, provenance: "confirmed", liquid: true },
      { id: "2", name: "Apartamento", side: "asset", category: "real_estate", valueCents: 40000000, provenance: "informed" },
      { id: "3", name: "Carro", side: "asset", category: "vehicle", valueCents: 5000000, provenance: "estimated" },
      { id: "4", name: "Financiamento", side: "liability", category: "mortgage", valueCents: 25000000, provenance: "confirmed" },
      { id: "5", name: "Patrimônio em 2040", side: "asset", category: "investment", valueCents: 99999999, provenance: "projected" },
    ]);
    expect(r.assetsCents).toBe(45500000);
    expect(r.liabilitiesCents).toBe(25000000);
    expect(r.netWorthCents).toBe(20500000);
    expect(r.liquidAssetsCents).toBe(500000);
    expect(r.byProvenance).toEqual({ confirmed: 500000, informed: 40000000, estimated: 5000000 });
    expect(r.byCategory[0]!.category).toBe("real_estate");
  });
});

describe("análises", () => {
  it("identifica gastos que aumentaram", () => {
    const changes = spendingChanges(
      [
        { categoryId: "delivery", name: "Delivery", amountCents: 80000 },
        { categoryId: "mercado", name: "Mercado", amountCents: 100000 },
        { categoryId: "pet", name: "Pet", amountCents: 30000 },
      ],
      [
        { categoryId: "delivery", name: "Delivery", amountCents: 30000 },
        { categoryId: "mercado", name: "Mercado", amountCents: 98000 },
        { categoryId: "academia", name: "Academia", amountCents: 12000 },
      ],
    );
    expect(changes.map((c) => [c.categoryId, c.direction])).toEqual([
      ["delivery", "up"],
      ["pet", "new"],
      ["academia", "gone"],
    ]);
    expect(changes[0]!.deltaPct).toBeCloseTo(166.7, 1);
  });

  it("simula queda de renda de 20%", () => {
    const r = simulateIncomeShock({
      monthlyIncomeCents: 1000000,
      essentialCents: 600000,
      nonEssentialCents: 200000,
      plannedContributionsCents: 150000,
      reserveCents: 1200000,
      dropPct: 20,
    });
    expect(r.incomeAfterCents).toBe(800000);
    expect(r.marginBeforeCents).toBe(50000);
    expect(r.marginAfterCents).toBe(-150000);
    expect(r.cutNeededCents).toBe(150000);
    expect(r.coverableByNonEssential).toBe(true);
    expect(r.monthsReserveCovers).toBeNull();
  });
});
