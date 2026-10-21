import { describe, expect, it } from "vitest";
import { allocateMonthlyCapacity } from "@/domain/allocation";
import {
  averageMonthlyContribution,
  contributionDates,
  delayFromReduction,
  diagnoseGoal,
  goalBalances,
  monthlyRateFromAnnual,
  requiredContribution,
  simulateGoal,
} from "@/domain/goals";

describe("aporte necessário", () => {
  it("sem rendimento: (alvo − acumulado) ÷ períodos restantes, pelo calendário real", () => {
    // Hoje 21/10/2026, aporte no dia 5, viagem em 15/03/2027: aportes em 05/11, 05/12, 05/01, 05/02, 05/03 = 5
    expect(contributionDates("2026-10-21", "2027-03-15", 5)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05", "2027-03-05"]);
    const r = requiredContribution({
      targetCents: 600000,
      currentCents: 100000,
      today: "2026-10-21",
      targetDate: "2027-03-15",
      contributionDay: 5,
    });
    expect(r.status).toBe("ok");
    expect(r.periods).toBe(5);
    expect(r.perPeriodCents).toBe(100000);
  });

  it("arredonda para cima para garantir o alvo", () => {
    const r = requiredContribution({ targetCents: 100000, currentCents: 0, today: "2026-10-01", targetDate: "2026-12-31", contributionDay: 10 });
    expect(r.periods).toBe(3);
    expect(r.perPeriodCents).toBe(33334);
  });

  it("meta concluída", () => {
    const r = requiredContribution({ targetCents: 1000, currentCents: 1500, today: "2026-10-01", targetDate: "2026-12-31", contributionDay: 10 });
    expect(r.status).toBe("completed");
    expect(r.perPeriodCents).toBe(0);
    expect(r.remainingCents).toBe(0);
  });

  it("prazo vencido informa a situação em vez de calcular", () => {
    const r = requiredContribution({ targetCents: 100000, currentCents: 10000, today: "2026-10-21", targetDate: "2026-09-30", contributionDay: 5 });
    expect(r.status).toBe("overdue");
    expect(r.perPeriodCents).toBeNull();
  });

  it("sem períodos suficientes antes do prazo", () => {
    const r = requiredContribution({ targetCents: 100000, currentCents: 0, today: "2026-10-21", targetDate: "2026-11-02", contributionDay: 5 });
    expect(r.status).toBe("insufficient_periods");
    expect(r.perPeriodCents).toBeNull();
  });

  it("com rendimento o aporte é menor e o rendimento projetado é separado", () => {
    const base = { targetCents: 1200000, currentCents: 0, today: "2026-01-01", targetDate: "2026-12-31", contributionDay: 1 };
    const semJuros = requiredContribution(base);
    const comJuros = requiredContribution({ ...base, annualReturnRate: 0.12 });
    expect(semJuros.perPeriodCents).toBe(100000);
    expect(comJuros.perPeriodCents!).toBeLessThan(100000);
    expect(comJuros.perPeriodCents!).toBeGreaterThan(90000);
    expect(comJuros.projectedYieldCents).toBeGreaterThan(0);
    // aportes + rendimento projetado ≈ alvo
    expect(comJuros.perPeriodCents! * comJuros.periods + comJuros.projectedYieldCents).toBeGreaterThanOrEqual(1200000 - 12);
  });

  it("taxa mensal equivalente", () => {
    expect(monthlyRateFromAnnual(0.12).toNumber()).toBeCloseTo(0.009489, 5);
  });
});

describe("simulação de metas", () => {
  const base = { targetCents: 1000000, currentCents: 200000, startDate: "2026-10-21", monthlyContributionCents: 100000, contributionDay: 5 };

  it("projeta conclusão sem rendimento", () => {
    const r = simulateGoal(base);
    expect(r.reached).toBe(true);
    expect(r.monthsToComplete).toBe(8);
    expect(r.completionDate).toBe("2027-06-05");
    expect(r.totalYieldCents).toBe(0);
  });

  it("aporte extraordinário antecipa e pausa atrasa", () => {
    expect(simulateGoal({ ...base, extraContributionCents: 300000 }).monthsToComplete).toBe(5);
    expect(simulateGoal({ ...base, pauseMonths: 2 }).monthsToComplete).toBe(10);
  });

  it("rendimento hipotético antecipa a conclusão", () => {
    const r = simulateGoal({ ...base, annualReturnRate: 0.1 });
    expect(r.monthsToComplete!).toBeLessThanOrEqual(8);
    expect(r.totalYieldCents).toBeGreaterThan(0);
  });

  it("sem aporte e sem rendimento nunca conclui", () => {
    const r = simulateGoal({ ...base, monthlyContributionCents: 0 });
    expect(r.reached).toBe(false);
    expect(r.completionDate).toBeNull();
  });

  it("informa atraso em relação ao prazo", () => {
    const r = simulateGoal({ ...base, targetDate: "2027-03-31" });
    expect(r.onTime).toBe(false);
    expect(r.monthsLate).toBe(3);
  });

  it("calcula atraso causado por deixar de aportar", () => {
    const d = delayFromReduction({
      targetCents: 1000000,
      currentCents: 200000,
      monthlyContributionCents: 100000,
      contributionDay: 5,
      today: "2026-10-21",
      reductionCents: 100000,
    });
    expect(d.delayMonths).toBe(1);
  });
});

describe("diagnóstico de metas", () => {
  const contributions = [
    { date: "2026-08-05", amountCents: 50000, kind: "deposit" as const },
    { date: "2026-09-05", amountCents: 50000, kind: "deposit" as const },
    { date: "2026-10-05", amountCents: 50000, kind: "deposit" as const },
    { date: "2026-10-10", amountCents: 1000, kind: "yield" as const },
    { date: "2026-10-12", amountCents: -10000, kind: "withdrawal" as const },
  ];

  it("separa aportes, resgates e rendimentos", () => {
    expect(goalBalances(contributions)).toEqual({ contributedCents: 150000, withdrawnCents: 10000, yieldCents: 1000, balanceCents: 141000 });
    expect(averageMonthlyContribution(contributions, "2026-10-21")).toBe(46667);
  });

  it("classifica no prazo e em risco", () => {
    const common = { targetCents: 300000, currentCents: 141000, contributionDay: 5, contributions, today: "2026-10-21" };
    expect(diagnoseGoal({ ...common, targetDate: "2027-12-31" }).health).toBe("on_track");
    expect(diagnoseGoal({ ...common, targetDate: "2026-12-31" }).health).toBe("at_risk");
    expect(diagnoseGoal({ ...common, targetDate: "2026-01-01" }).health).toBe("overdue");
    expect(diagnoseGoal({ ...common, currentCents: 300000, targetDate: "2026-12-31" }).health).toBe("completed");
    expect(diagnoseGoal({ ...common, paused: true, targetDate: "2027-12-31" }).health).toBe("paused");
    expect(diagnoseGoal({ ...common, contributions: [], currentCents: 0, targetDate: "2027-12-31" }).health).toBe("not_started");
  });
});

describe("priorização de metas", () => {
  const today = "2026-10-21";
  const needs = [
    { goalId: "viagem", name: "Viagem", priority: 2, targetDate: "2027-03-15", requiredMonthlyCents: 100000, remainingCents: 500000 },
    { goalId: "carro", name: "Carro", priority: 3, targetDate: "2028-01-01", requiredMonthlyCents: 80000, remainingCents: 1200000 },
    {
      goalId: "reserva",
      name: "Reserva",
      priority: 4,
      requiredMonthlyCents: 50000,
      remainingCents: 600000,
      isEmergencyReserve: true,
      belowMinimum: true,
    },
  ];

  it("não usa o mesmo dinheiro duas vezes e aponta conflito", () => {
    const r = allocateMonthlyCapacity({ capacityCents: 170000, needs, today });
    expect(r.allocations.map((a) => a.goalId)).toEqual(["reserva", "viagem", "carro"]);
    expect(r.allocations.map((a) => a.allocatedCents)).toEqual([50000, 100000, 20000]);
    const total = r.allocations.reduce((s, a) => s + a.allocatedCents, 0);
    expect(total).toBe(170000);
    expect(r.hasConflict).toBe(true);
    expect(r.conflicts[0]!.goalIds).toEqual(["carro"]);
    const alt = r.alternatives.find((a) => a.goalId === "carro")!;
    expect(alt.monthsWithAllocated).toBe(60);
  });

  it("sem conflito quando a capacidade cobre tudo", () => {
    const r = allocateMonthlyCapacity({ capacityCents: 300000, needs, today });
    expect(r.hasConflict).toBe(false);
    expect(r.unallocatedCents).toBe(70000);
  });

  it("capacidade negativa não aloca nada", () => {
    const r = allocateMonthlyCapacity({ capacityCents: -5000, needs, today });
    expect(r.allocations.every((a) => a.allocatedCents === 0)).toBe(true);
    expect(r.alternatives.every((a) => a.monthsWithAllocated === null)).toBe(true);
  });
});
