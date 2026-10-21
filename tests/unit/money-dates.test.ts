import { describe, expect, it } from "vitest";
import {
  addMonths,
  dateWithClampedDay,
  diffDays,
  endOfMonth,
  fullMonthsBetween,
  isISODate,
  monthDiff,
  parseFlexibleDate,
  todayInTimeZone,
} from "@/domain/dates";
import { expandOccurrences, nextOccurrence } from "@/domain/recurrence";
import { formatMoney, parseMoney, percentOf, splitEvenly, sumCents } from "@/domain/money";

describe("dinheiro em centavos", () => {
  it("interpreta formatos brasileiros e internacionais", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("1234,5")).toBe(123450);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1.234")).toBe(123400); // milhar no padrão brasileiro
    expect(parseMoney("-45,90")).toBe(-4590);
    expect(parseMoney("(12,30)")).toBe(-1230);
    expect(parseMoney("12,30-")).toBe(-1230);
    expect(parseMoney("-123.45", ".")).toBe(-12345);
  });

  it("rejeita valores inválidos", () => {
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("")).toThrow();
    expect(() => parseMoney("1,2,3")).toThrow();
  });

  it("evita erro de ponto flutuante", () => {
    // 0,1 + 0,2 em float = 0,30000000000000004
    expect(sumCents([parseMoney("0,10"), parseMoney("0,20")])).toBe(30);
    expect(parseMoney(0.1 + 0.2)).toBe(30);
  });

  it("divide parcelas sem perder centavos", () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(splitEvenly(1, 4)).toEqual([1, 0, 0, 0]);
    expect(() => splitEvenly(100, 0)).toThrow();
  });

  it("formata em reais", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe("datas de calendário", () => {
  it("soma meses ajustando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(dateWithClampedDay(2026, 14, 31)).toBe("2027-02-28");
  });

  it("calcula diferenças", () => {
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(diffDays("2026-03-01", "2026-02-28")).toBe(-1);
    expect(monthDiff("2026-10", "2027-03")).toBe(5);
    expect(fullMonthsBetween("2026-01-15", "2026-03-14")).toBe(1);
    expect(fullMonthsBetween("2026-01-31", "2026-02-28")).toBe(1);
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
  });

  it("valida e interpreta datas importadas", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(parseFlexibleDate("05/03/2026")).toBe("2026-03-05");
    expect(parseFlexibleDate("05/03/26")).toBe("2026-03-05");
    expect(parseFlexibleDate("2026-03-05")).toBe("2026-03-05");
    expect(parseFlexibleDate("20260305120000")).toBe("2026-03-05");
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
  });

  it("calcula hoje no fuso de São Paulo", () => {
    // 02:00 UTC = 23:00 do dia anterior em São Paulo (UTC-3)
    expect(todayInTimeZone("America/Sao_Paulo", new Date("2026-10-21T02:00:00Z"))).toBe("2026-10-20");
  });
});

describe("recorrências", () => {
  it("mensal no dia 31 respeita meses curtos sem acumular desvio", () => {
    const dates = expandOccurrences({ startDate: "2026-01-31", frequency: "monthly" }, "2026-01-01", "2026-05-31");
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("respeita quantidade e data final", () => {
    expect(expandOccurrences({ startDate: "2026-01-10", frequency: "monthly", count: 3 }, "2026-01-01", "2027-01-01")).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
    expect(
      expandOccurrences({ startDate: "2026-01-10", frequency: "weekly", endDate: "2026-01-31" }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31"]);
  });

  it("dia fixo do mês anterior ao início não gera ocorrência antes do início", () => {
    const dates = expandOccurrences({ startDate: "2026-01-15", frequency: "monthly", dayOfMonth: 5, count: 2 }, "2026-01-01", "2026-12-31");
    expect(dates).toEqual(["2026-02-05", "2026-03-05"]);
  });

  it("encontra a próxima ocorrência e anual em 29/02", () => {
    expect(nextOccurrence({ startDate: "2026-01-05", frequency: "monthly" }, "2026-10-06")).toBe("2026-11-05");
    expect(expandOccurrences({ startDate: "2028-02-29", frequency: "yearly" }, "2028-01-01", "2030-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });

  it("rejeita regras inválidas", () => {
    expect(() => expandOccurrences({ startDate: "2026-01-10", frequency: "monthly", interval: 0 }, "2026-01-01", "2026-02-01")).toThrow();
    expect(() =>
      expandOccurrences({ startDate: "2026-01-10", frequency: "monthly", endDate: "2025-01-01" }, "2026-01-01", "2026-02-01"),
    ).toThrow();
  });
});
