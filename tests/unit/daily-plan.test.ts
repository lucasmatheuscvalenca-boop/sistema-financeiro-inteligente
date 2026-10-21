import { describe, expect, it } from "vitest";
import { buildDailyPlan, heroInsight, percentChange, type DailyPlanInput } from "@/domain/daily-plan";

const T = "2026-10-21";

function base(over: Partial<DailyPlanInput> = {}): DailyPlanInput {
  return {
    today: T,
    hasAccounts: true,
    goals: [],
    budgetLines: [],
    payables: [],
    overdue: [],
    reserve: null,
    lastDataUpdate: "2026-10-20",
    extraCents: null,
    ...over,
  };
}

describe("Seu plano de hoje", () => {
  it("sem contas, a primeira ação é cadastrar uma conta", () => {
    const plan = buildDailyPlan(base({ hasAccounts: false, lastDataUpdate: null }));
    expect(plan[0]).toMatchObject({ kind: "setup", primary: true, action: { href: "/contas" } });
    expect(plan.some((p) => p.kind === "data")).toBe(false);
  });

  it("aporte pendente perto da data vira ação com o valor que falta", () => {
    const plan = buildDailyPlan(
      base({
        goals: [{ id: "g1", name: "Viagem", status: "active", health: "on_track", monthlyTargetCents: 80000, contributedThisMonthCents: 30000, contributionDay: 25 }],
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.title).toBe("Separar o aporte de Viagem");
    expect(plan[0]!.detail).toContain("500,00");
    expect(plan[0]!.action.href).toBe("/metas/g1");
  });

  it("aporte distante (mais de 7 dias) não entra; meta pausada nunca entra", () => {
    const plan = buildDailyPlan(
      base({
        today: "2026-10-01",
        lastDataUpdate: "2026-09-30",
        goals: [
          { id: "g1", name: "Carro", status: "active", health: "on_track", monthlyTargetCents: 50000, contributedThisMonthCents: 0, contributionDay: 25 },
          { id: "g2", name: "Casa", status: "paused", health: "paused", monthlyTargetCents: 50000, contributedThisMonthCents: 0, contributionDay: 2 },
        ],
      }),
    );
    expect(plan).toEqual([]);
  });

  it("orçamento estourado, contas próximas e pendências aparecem com motivo e ordem de prioridade", () => {
    const plan = buildDailyPlan(
      base({
        budgetLines: [
          { categoryName: "Alimentação", usedPct: 108, status: "exceeded" },
          { categoryName: "Lazer", usedPct: 85, status: "warning" },
        ],
        payables: [
          { date: "2026-10-22", label: "Luz", amountCents: 12000 },
          { date: "2026-10-24", label: "Internet", amountCents: 10000 },
          { date: "2026-10-30", label: "Aluguel", amountCents: 150000 },
        ],
        overdue: [{ amountCents: 5000, kind: "expense" }],
      }),
    );
    expect(plan.map((p) => p.kind)).toEqual(["pending", "bills", "budget", "budget"]);
    expect(plan[1]!.title).toBe("2 contas vencem nos próximos 3 dias");
    expect(plan[1]!.detail).toContain("220,00");
    expect(plan[2]!.detail).toBe("8% acima do planejado para o mês.");
  });

  it("valor extra só é sugerido sem pendências, sem orçamento estourado e com reserva no mínimo", () => {
    expect(buildDailyPlan(base({ extraCents: 125000 })).map((p) => p.kind)).toEqual(["invest"]);
    expect(buildDailyPlan(base({ extraCents: 125000, reserve: { belowMinimum: true, gapToMinimumCents: 300000 } })).map((p) => p.kind)).toEqual(["reserve"]);
    expect(buildDailyPlan(base({ extraCents: 5000 }))).toEqual([]);
  });

  it("dados parados há mais de 7 dias geram lembrete; limite de 5 ações", () => {
    const plan = buildDailyPlan(
      base({
        lastDataUpdate: "2026-10-01",
        budgetLines: Array.from({ length: 6 }, (_, i) => ({ categoryName: `C${i}`, usedPct: 120, status: "exceeded" as const })),
      }),
    );
    expect(plan).toHaveLength(5);
    expect(buildDailyPlan(base({ lastDataUpdate: "2026-10-01" }))[0]!.detail).toBe("O último lançamento foi há 20 dias.");
  });
});

describe("mensagem de abertura", () => {
  const i = { today: T, hasAccounts: true, firstNegativeDate: null, exceededBudget: null, reserveBelowMinimum: false, onTrackGoal: null, atRiskGoal: null, monthEndConfirmedCents: null };

  it("prioriza risco de saldo negativo sobre metas no prazo", () => {
    expect(heroInsight({ ...i, firstNegativeDate: "2026-10-28", onTrackGoal: { id: "g", name: "Viagem", targetDate: "2027-03-15" } })).toMatchObject({ tone: "critical", href: "/fluxo-de-caixa" });
  });

  it("meta no prazo cita o mês (e o ano quando não é o atual)", () => {
    const r = heroInsight({ ...i, onTrackGoal: { id: "g", name: "a viagem", targetDate: "2027-03-15" } });
    expect(r.tone).toBe("positive");
    expect(r.message).toBe("Se mantiver seu ritmo, a viagem em março de 2027 continua no caminho certo.");
  });

  it("sem contas pede o primeiro cadastro", () => {
    expect(heroInsight({ ...i, hasAccounts: false }).href).toBe("/contas");
  });
});

describe("variação percentual", () => {
  it("calcula sobre base positiva e não inventa percentual sem base", () => {
    expect(percentChange(10800, 10000)).toBeCloseTo(8);
    expect(percentChange(9600, 10000)).toBeCloseTo(-4);
    expect(percentChange(5000, 0)).toBeNull();
    expect(percentChange(5000, -100)).toBeNull();
  });
});
