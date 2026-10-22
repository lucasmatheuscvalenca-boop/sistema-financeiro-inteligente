import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { getBriefing, initialDiagnosis, saveBriefingSection } from "@/server/services/briefing";
import { createIncomeRecurrences, incomeSuggestion, listRecurrences, nextDayOfMonth } from "@/server/services/recurrences";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("renda mista no briefing", () => {
  it("fixo + média de comissão: renda total, mês fraco no diagnóstico e tipo de renda igual nas duas etapas", async () => {
    const u = await createUser("Renda Mista");
    await saveBriefingSection(u, "personal", { incomeType: "fixed" });
    await saveBriefingSection(u, "financial", {
      incomeType: "mixed",
      fixedIncomeCents: 4_000_00,
      fixedIncomeDay: 5,
      commissionAvgCents: 2_500_00,
      commissionLowCents: 1_000_00,
      commissionHighCents: 5_000_00,
      commissionDay: 20,
      essentialExpensesCents: 3_500_00,
      variableExpensesCents: 1_200_00,
      hasDebts: false,
      currentReserveCents: 5_000_00,
    });

    const { answers } = await getBriefing(u);
    expect(answers.financial?.monthlyNetIncomeCents).toBe(6_500_00);
    expect(answers.personal?.incomeType).toBe("mixed");

    const d = await initialDiagnosis(u);
    const mix = d.indicators.find((i) => i.key === "income_mix");
    expect(mix?.value).toMatch(/R\$\s4\.000,00 fixos \+ R\$\s2\.500,00 de comissão média/);
    const low = d.indicators.find((i) => i.key === "margin_low");
    // Mês fraco: 4.000 + 1.000 − 3.500 − 1.200 = 300.
    expect(low?.value).toMatch(/R\$\s300,00/);
    expect(d.indicators.find((i) => i.key === "margin")?.value).toMatch(/R\$\s1\.800,00/);
    expect(d.assumptions.join(" ")).toMatch(/estimativa/);
  });

  it("recusa mês fraco acima da média da comissão", async () => {
    const u = await createUser("Faixa Errada");
    await expect(saveBriefingSection(u, "financial", { incomeType: "mixed", fixedIncomeCents: 3_000_00, commissionAvgCents: 1_000_00, commissionLowCents: 2_000_00 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("vira recorrências com um toque: salário confirmado e comissão estimada, sem repetir", async () => {
    const u = await createUser("Renda Recorrente");
    await saveBriefingSection(u, "financial", { incomeType: "mixed", fixedIncomeCents: 4_000_00, fixedIncomeDay: 5, commissionAvgCents: 2_500_00, commissionDay: 20 });
    expect(await incomeSuggestion(u)).toMatchObject({ kind: "mixed", salary: { amountCents: 4_000_00, day: 5 }, variable: { amountCents: 2_500_00, day: 20 } });

    const acc = await createAccount(u, { name: "Conta salário", type: "checking", initialBalanceCents: 0 });
    expect(await createIncomeRecurrences(u, acc.id)).toBe(2);
    const rules = await listRecurrences(u);
    const salary = rules.find((r) => r.incomeType === "salary");
    const commission = rules.find((r) => r.incomeType === "commission");
    expect(salary).toMatchObject({ certainty: "scheduled", amountCents: 4_000_00, accountId: acc.id, startDate: nextDayOfMonth(u.today, 5) });
    expect(commission).toMatchObject({ certainty: "estimated", amountCents: 2_500_00, startDate: nextDayOfMonth(u.today, 20) });

    expect(await incomeSuggestion(u)).toBeNull();
    await expect(createIncomeRecurrences(u, acc.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a próxima data respeita o dia do mês e meses curtos", () => {
    expect(nextDayOfMonth("2026-10-21", 25)).toBe("2026-10-25");
    expect(nextDayOfMonth("2026-10-21", 5)).toBe("2026-11-05");
    expect(nextDayOfMonth("2026-01-31", 30)).toBe("2026-02-28");
    expect(nextDayOfMonth("2026-12-10", 5)).toBe("2027-01-05");
  });
});
