import { describe, expect, it } from "vitest";
import { summarizeIncome, validateIncome } from "@/domain/income";

describe("renda declarada no briefing", () => {
  it("mista: fixo garantido, comissão estimada e mês fraco como cenário conservador", () => {
    const r = summarizeIncome({ kind: "mixed", fixedCents: 4_000_00, variableAvgCents: 2_500_00, variableLowCents: 1_000_00, variableHighCents: 5_000_00 });
    expect(r).toMatchObject({ guaranteedCents: 4_000_00, estimatedCents: 2_500_00, totalCents: 6_500_00, lowMonthCents: 5_000_00 });
    expect(r.variableShare).toBeCloseTo(2_500 / 6_500);
  });

  it("mista sem o mês fraco: o conservador conta só com o fixo (comissão não é garantida)", () => {
    const r = summarizeIncome({ kind: "mixed", fixedCents: 3_000_00, variableAvgCents: 1_500_00 });
    expect(r.totalCents).toBe(4_500_00);
    expect(r.lowMonthCents).toBe(3_000_00);
  });

  it("mista com só a média da comissão: total parcial e sem cenário conservador", () => {
    const r = summarizeIncome({ kind: "mixed", variableAvgCents: 2_000_00 });
    expect(r).toMatchObject({ guaranteedCents: null, estimatedCents: 2_000_00, totalCents: 2_000_00, lowMonthCents: null, variableShare: null });
  });

  it("variável: nada garantido, média estimada e mês fraco quando informado", () => {
    expect(summarizeIncome({ kind: "variable", variableAvgCents: 5_000_00, variableLowCents: 2_000_00 })).toMatchObject({
      guaranteedCents: 0,
      estimatedCents: 5_000_00,
      totalCents: 5_000_00,
      lowMonthCents: 2_000_00,
      variableShare: 1,
    });
  });

  it("fixa: a renda líquida inteira é garantida", () => {
    expect(summarizeIncome({ kind: "fixed", netMonthlyCents: 7_000_00 })).toMatchObject({ guaranteedCents: 7_000_00, estimatedCents: 0, totalCents: 7_000_00, lowMonthCents: 7_000_00, variableShare: 0 });
  });

  it("sem tipo de renda: usa a renda informada sem presumir o que é garantido", () => {
    expect(summarizeIncome({ kind: null, netMonthlyCents: 5_000_00 })).toMatchObject({ guaranteedCents: null, totalCents: 5_000_00, lowMonthCents: null });
  });

  it("recusa uma faixa incoerente para a parte variável", () => {
    expect(validateIncome({ kind: "mixed", variableAvgCents: 2_000_00, variableLowCents: 3_000_00 })).toHaveProperty("commissionLow");
    expect(validateIncome({ kind: "mixed", variableAvgCents: 2_000_00, variableHighCents: 1_000_00 })).toHaveProperty("commissionHigh");
    expect(validateIncome({ kind: "mixed", variableAvgCents: 2_000_00, variableLowCents: 1_000_00, variableHighCents: 4_000_00 })).toEqual({});
  });
});
