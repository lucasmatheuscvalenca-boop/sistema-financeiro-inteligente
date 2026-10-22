import { describe, expect, it } from "vitest";
import { canISpend, type CanISpendInput } from "@/domain/can-i-spend";
import { nextConfirmedIncome, projectCashFlow, type CashEvent } from "@/domain/cashflow";

const today = "2026-10-21";

const salary: CashEvent = { date: "2026-11-05", amountCents: 600000, label: "Salário", kind: "income", certainty: "confirmed" };

function input(overrides: Partial<CanISpendInput> = {}): CanISpendInput {
  return {
    today,
    amountCents: 60000,
    description: "Jantar e passeio",
    payment: { method: "account" },
    openingAvailableCents: 300000,
    events: [salary],
    safetyMarginCents: 50000,
    dataQuality: { lastDataUpdate: today, hasIncomeInfo: true, hasBankConnection: false, connectionStale: false, missing: [] },
    ...overrides,
  };
}

describe("projeção de fluxo de caixa", () => {
  it("detecta o primeiro dia negativo e separa estimativas", () => {
    const p = projectCashFlow({
      startDate: today,
      endDate: "2026-11-10",
      openingCents: 100000,
      events: [
        { date: "2026-10-25", amountCents: -150000, label: "Aluguel", kind: "expense", certainty: "confirmed" },
        { date: "2026-10-28", amountCents: 200000, label: "Comissão", kind: "income", certainty: "estimated" },
        salary,
      ],
    });
    expect(p.firstNegativeConfirmed).toBe("2026-10-25");
    expect(p.lowestConfirmed.balanceCents).toBe(-50000);
    expect(p.lowestWithEstimated.balanceCents).toBe(-50000);
    expect(p.closingConfirmedCents).toBe(550000);
    expect(p.closingWithEstimatedCents).toBe(750000);
    expect(nextConfirmedIncome(p.days.flatMap((d) => d.events), today)!.date).toBe("2026-11-05");
  });
});

describe("Posso gastar?", () => {
  it("cabe quando há folga até o próximo recebimento", () => {
    const r = canISpend(input());
    expect(r.verdict).toBe("cabe");
    expect(r.level).toBe("green");
    expect(r.horizon.nextIncomeDate).toBe("2026-11-05");
    expect(r.after!.lowestBalanceCents).toBe(240000);
    expect(r.after!.leftoverAfterMarginCents).toBe(190000);
    expect(r.options[0]!.id).toBe("buy");
  });

  it("saldo insuficiente: não recomendado", () => {
    const r = canISpend(input({ openingAvailableCents: 40000 }));
    expect(r.verdict).toBe("nao_recomendado");
    expect(r.level).toBe("red");
    expect(r.commitmentShortfallCents).toBe(20000);
    // alternativa: adiar para depois do salário
    expect(r.alternatives.postpone!.date).toBe("2026-11-05");
    expect(r.alternatives.postpone!.verdict).toBe("cabe");
  });

  it("não olha só o saldo: compromissos futuros contam", () => {
    const events: CashEvent[] = [
      { date: "2026-10-28", amountCents: -200000, label: "Aluguel", kind: "expense", certainty: "confirmed" },
      { date: "2026-11-01", amountCents: -60000, label: "Condomínio", kind: "expense", certainty: "confirmed" },
      salary,
    ];
    // Saldo de 300.000 hoje cobriria os 60.000, mas aluguel e condomínio deixam só 40.000 antes do salário.
    const r = canISpend(input({ events }));
    expect(r.verdict).toBe("nao_recomendado");
    expect(r.after!.lowestBalanceCents).toBe(-20000);
    expect(r.affectedCommitments.map((c) => c.label)).toContain("Condomínio");
    expect(r.maxSafeAmountCents).toBe(0);
    expect(r.facts.join(" ")).toContain("Próximo recebimento");
  });

  it("metas em risco: só cabe reduzindo o aporte e informa o atraso", () => {
    const events: CashEvent[] = [
      { date: "2026-10-25", amountCents: -100000, label: "Aporte: Viagem", kind: "goal_contribution", certainty: "confirmed", optional: true, sourceId: "viagem" },
      { date: "2026-10-26", amountCents: -100000, label: "Aporte: Carro", kind: "goal_contribution", certainty: "confirmed", optional: true, sourceId: "carro" },
      salary,
    ];
    const r = canISpend(
      input({
        openingAvailableCents: 220000,
        events,
        safetyMarginCents: 0,
        goals: [
          { goalId: "viagem", name: "Viagem", priority: 1, currentCents: 100000, targetCents: 600000, monthlyContributionCents: 100000, contributionDay: 25 },
          { goalId: "carro", name: "Carro", priority: 3, currentCents: 200000, targetCents: 1000000, monthlyContributionCents: 100000, contributionDay: 26 },
        ],
      }),
    );
    expect(r.verdict).toBe("afeta_metas");
    expect(r.level).toBe("yellow");
    // déficit de 40.000 coberto pela meta de menor prioridade (Carro)
    expect(r.goalsAtRisk).toEqual([{ goalId: "carro", name: "Carro", reductionCents: 40000, delayMonths: 1 }]);
    expect(r.options.some((o) => o.id === "adjust_goal")).toBe(true);
    // metade do valor (30.000) ainda passa da folga de 20.000
    expect(r.alternatives.cheaper!.amountCents).toBe(30000);
    expect(r.alternatives.cheaper!.verdict).toBe("afeta_metas");
    expect(r.maxSafeAmountCents).toBe(20000);
  });

  it("alternativa mais barata informada pelo usuário", () => {
    const r = canISpend(
      input({
        openingAvailableCents: 220000,
        safetyMarginCents: 0,
        cheaperAlternativeCents: 15000,
        events: [
          { date: "2026-10-25", amountCents: -200000, label: "Aporte: Viagem", kind: "goal_contribution", certainty: "confirmed", optional: true, sourceId: "viagem" },
          salary,
        ],
      }),
    );
    expect(r.alternatives.cheaper).toEqual({ amountCents: 15000, verdict: "cabe", leftoverAfterMarginCents: 5000 });
  });

  it("consome a margem de segurança", () => {
    const r = canISpend(input({ openingAvailableCents: 100000, amountCents: 60000 }));
    expect(r.verdict).toBe("consome_margem");
    expect(r.maxSafeAmountCents).toBe(50000);
  });

  it("estoura o orçamento da categoria e sugere remanejar", () => {
    const r = canISpend(
      input({
        budget: { categoryId: "lazer", categoryName: "Lazer", limitCents: 80000, committedCents: 50000 },
        otherBudgets: [
          { categoryId: "lazer", categoryName: "Lazer", remainingCents: 30000 },
          { categoryId: "roupas", categoryName: "Roupas", remainingCents: 40000 },
        ],
      }),
    );
    expect(r.verdict).toBe("estoura_orcamento");
    expect(r.budget!.remainingAfterCents).toBe(-30000);
    expect(r.alternatives.reviewBudget).toEqual({ fromCategoryId: "roupas", fromCategoryName: "Roupas", moveCents: 30000 });
    expect(r.maxSafeAmountCents).toBe(30000);
  });

  it("cartão: o impacto no caixa é na data de vencimento da fatura", () => {
    const r = canISpend(
      input({
        openingAvailableCents: 50000,
        safetyMarginCents: 0,
        payment: { method: "card", cardName: "Visa", cycle: { closingDay: 25, dueDay: 10 }, installments: 1, availableLimitCents: 500000 },
      }),
    );
    // compra em 21/10 cai na fatura que vence em 10/11, depois do salário de 05/11
    expect(r.impactDates).toEqual(["2026-11-10"]);
    expect(r.verdict).toBe("cabe");
  });

  it("cartão sem limite disponível", () => {
    const r = canISpend(
      input({ payment: { method: "card", cardName: "Visa", cycle: { closingDay: 25, dueDay: 10 }, installments: 3, availableLimitCents: 10000 } }),
    );
    expect(r.verdict).toBe("sem_limite");
    expect(r.card!.dueDates).toHaveLength(3);
  });

  it("sem contas cadastradas: análise condicional", () => {
    const r = canISpend(input({ openingAvailableCents: null }));
    expect(r.verdict).toBe("dados_insuficientes");
    expect(r.level).toBe("gray");
    expect(r.assumptions[0]).toContain("Análise condicional");
    expect(r.caveats[0]).toContain("Nenhuma conta");
  });

  it("dados desatualizados e receita estimada geram ressalvas", () => {
    const r = canISpend(
      input({
        events: [salary, { date: "2026-10-30", amountCents: 150000, label: "Comissão", kind: "income", certainty: "estimated" }],
        dataQuality: { lastDataUpdate: "2026-10-01", hasIncomeInfo: true, hasBankConnection: true, connectionStale: true, missing: [] },
      }),
    );
    expect(r.estimatedIncomeIgnoredCents).toBe(150000);
    expect(r.caveats.some((c) => c.includes("desatualizados"))).toBe(true);
    expect(r.caveats.some((c) => c.includes("não são atualizados desde"))).toBe(true);
    expect(r.caveats.some((c) => c.includes("receitas estimadas"))).toBe(true);
  });

  it("sem renda confirmada usa 30 dias e avisa", () => {
    const r = canISpend(input({ events: [], dataQuality: { lastDataUpdate: today, hasIncomeInfo: false, hasBankConnection: false, connectionStale: false, missing: [] } }));
    expect(r.horizon.nextIncomeDate).toBeNull();
    expect(r.horizon.end).toBe("2026-11-20");
    expect(r.caveats[0]).toContain("Não encontrei receitas confirmadas");
  });

  it("rejeita valor inválido", () => {
    expect(() => canISpend(input({ amountCents: 0 }))).toThrow();
  });
});
