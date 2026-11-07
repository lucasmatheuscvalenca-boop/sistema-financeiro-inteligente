import { describe, expect, it } from "vitest";
import { detectAnnualCharges, monthsToPrepare, setAsidePlan } from "@/domain/annual";

const tx = (id: string, date: string, description: string, amountCents: number) => ({ id, date, description, amountCents });

describe("despesas anuais", () => {
  it("acha cobranças que voltam depois de um ano", () => {
    const found = detectAnnualCharges(
      [tx("1", "2025-12-02", "AMAZON PRIME ANUAL", 16_690), tx("2", "2026-12-01", "AMAZON PRIME ANUAL", 17_990), tx("3", "2026-10-05", "NETFLIX", 5_590), tx("4", "2026-11-05", "NETFLIX", 5_590)],
      "2026-12-10",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.amountCents).toBe(17_990);
    expect(found[0]!.nextDate).toBe("2027-12-01");
  });

  it("ignora quem cobra todo mês e cobranças antigas demais", () => {
    expect(detectAnnualCharges([tx("1", "2024-01-10", "SEGURO AUTO X", 200_000), tx("2", "2025-01-12", "SEGURO AUTO X", 210_000)], "2026-11-07")).toEqual([]);
    expect(detectAnnualCharges([tx("1", "2025-01-10", "ACADEMIA", 10_000), tx("2", "2025-06-10", "ACADEMIA", 10_000), tx("3", "2026-01-10", "ACADEMIA", 10_000)], "2026-02-01")).toEqual([]);
  });

  it("conta os meses para juntar antes do vencimento", () => {
    expect(monthsToPrepare("2026-11-07", "2027-03-20")).toBe(4);
    expect(monthsToPrepare("2026-11-07", "2026-11-30")).toBe(1);
    expect(monthsToPrepare("2026-11-07", "2026-12-01")).toBe(1);
  });

  it("transforma cada despesa em quanto separar por mês", () => {
    const plan = setAsidePlan(
      [
        { name: "IPVA", amountCents: 240_000, nextDate: "2027-03-15" },
        { name: "Natal", amountCents: 100_000, nextDate: "2026-12-20" },
      ],
      "2026-11-07",
    );
    expect(plan.lines.map((l) => [l.name, l.months, l.monthlyCents])).toEqual([
      ["Natal", 1, 100_000],
      ["IPVA", 4, 60_000],
    ]);
    expect(plan.monthlyCents).toBe(160_000);
    expect(plan.yearlyCents).toBe(340_000);
  });
});
