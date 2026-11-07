import { describe, expect, it } from "vitest";
import { generateReminders } from "@/domain/reminders";

describe("lembretes", () => {
  const today = "2026-11-07";

  it("autorização do banco: avisa a partir de 30 dias e fica importante na última semana", () => {
    const r = generateReminders({ today, consents: [
      { connectionId: "a", bankName: "Nubank", expiresAt: "2026-12-01" },
      { connectionId: "b", bankName: "Itaú", expiresAt: "2026-11-10" },
      { connectionId: "c", bankName: "Inter", expiresAt: "2027-02-01" },
    ] });
    expect(r.map((x) => [x.title, x.severity])).toEqual([
      ["A autorização do Nubank vence em 24 dias", "attention"],
      ["A autorização do Itaú vence em 3 dias", "important"],
    ]);
  });

  it("fatura fechando, despesa anual chegando e patrimônio antigo", () => {
    const r = generateReminders({
      today,
      cardClosings: [{ cardId: "c", cardName: "Visa", closingDate: "2026-11-08" }],
      annualDue: [
        { key: "ipva", name: "IPVA", amountCents: 240_000, nextDate: "2026-11-20", subscription: false },
        { key: "prime", name: "Prime", amountCents: 16_690, nextDate: "2027-01-01", subscription: true },
      ],
      assets: [{ valuedAt: "2026-09-01" }, { valuedAt: "2026-09-20" }],
    });
    expect(r.map((x) => x.type)).toEqual(["card_closing_soon", "annual_due_soon", "networth_update"]);
    expect(r[0]!.title).toBe("A fatura do Visa fecha amanhã");
    expect(r[1]!.title).toBe("IPVA vence em 13 dias");
    expect(r[2]!.fingerprint).toBe("networth:2026-11");
  });

  it("aporte no dia do salário só para metas que ainda faltam no mês", () => {
    const goals = [
      { goalId: "g1", name: "Viagem", requiredPerPeriodCents: 50_000, contributedThisMonthCents: 0 },
      { goalId: "g2", name: "Carro", requiredPerPeriodCents: 30_000, contributedThisMonthCents: 30_000 },
    ];
    expect(generateReminders({ today, incomeReceivedOn: "2026-11-06", goals }).map((x) => x.href)).toEqual(["/metas/g1"]);
    expect(generateReminders({ today, incomeReceivedOn: "2026-11-01", goals })).toEqual([]);
  });
});
