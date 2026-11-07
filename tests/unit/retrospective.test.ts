import { describe, expect, it } from "vitest";
import { buildRetrospective, type RetroTx } from "@/domain/retrospective";

const t = (date: string, kind: string, amountCents: number, description = "x", category: string | null = null): RetroTx => ({ date, kind, amountCents, description, category });

describe("retrospectiva do ano", () => {
  const txs = [
    t("2026-01-05", "income", 500_000, "Salário"),
    t("2026-01-10", "expense", 100_000, "MERCADO BOM PRECO", "Mercado"),
    t("2026-01-20", "expense", 50_000, "MERCADO BOM PRECO", "Mercado"),
    t("2026-02-05", "income", 500_000, "Salário"),
    t("2026-02-14", "expense", 400_000, "TV 55 POLEGADAS", "Compras"),
    t("2026-02-15", "refund", 50_000, "TV 55 POLEGADAS", "Compras"),
    t("2025-12-31", "expense", 999_999, "Ano passado", "Mercado"),
  ];
  const r = buildRetrospective(2026, txs);

  it("soma o ano sem misturar outros anos e desconta estornos", () => {
    expect(r.incomeCents).toBe(1_000_000);
    expect(r.expenseCents).toBe(500_000);
    expect(r.savedCents).toBe(500_000);
    expect(r.savingsRatePct).toBe(50);
    expect(r.monthsWithData).toBe(2);
  });

  it("acha o melhor mês, o mais caro, a categoria e o lugar favorito", () => {
    expect(r.bestMonth).toEqual({ month: "2026-01", savedCents: 350_000 });
    expect(r.priciestMonth).toEqual({ month: "2026-02", expenseCents: 350_000 });
    expect(r.topCategory?.name).toBe("Compras");
    expect(r.favoritePlace).toMatchObject({ count: 2, cents: 150_000 });
    expect(r.biggestPurchase?.cents).toBe(400_000);
    expect(r.activeDays).toBe(6);
  });

  it("ano sem dados não inventa destaques", () => {
    const empty = buildRetrospective(2024, txs);
    expect(empty.transactions).toBe(0);
    expect(empty.bestMonth).toBeNull();
    expect(empty.topCategory).toBeNull();
    expect(empty.savingsRatePct).toBeNull();
  });
});
