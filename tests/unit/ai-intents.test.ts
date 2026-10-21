import { describe, expect, it } from "vitest";
import { detectIntent, extractAmount } from "@/server/ai/local-engine";
import { nextMonthStart } from "@/server/ai/tools";

describe("interpretação de perguntas (modo local)", () => {
  it("extrai valores em reais", () => {
    expect(extractAmount("Posso gastar R$ 600 hoje?")).toBe(60000);
    expect(extractAmount("posso gastar 1.250,90 em roupas")).toBe(125090);
    expect(extractAmount("dá pra gastar 2 mil reais?")).toBe(200000);
    expect(extractAmount("comprar em 3x de 200 reais")).toBe(20000);
    expect(extractAmount("renda caísse 20%")).toBeNull();
  });

  it("reconhece as perguntas do produto", () => {
    const t = "2026-10-21";
    expect(detectIntent("Posso gastar R$ 600 em um jantar e um passeio neste fim de semana?", t)).toMatchObject({ kind: "can_i_spend", amountCents: 60000, category: "Lazer" });
    expect(detectIntent("Posso gastar R$ 600 hoje no cartão em 3x?", t)).toMatchObject({ kind: "can_i_spend", card: true, installments: 3 });
    expect(detectIntent("Quanto posso gastar com lazer até o fim do mês?", t)).toEqual({ kind: "category_budget", category: "lazer" });
    expect(detectIntent("Quanto posso gastar hoje?", t)).toEqual({ kind: "free_to_spend" });
    expect(detectIntent("quanto ainda posso gastar este mês", t)).toEqual({ kind: "free_to_spend" });
    expect(detectIntent("Quanto preciso aportar este mês?", t)).toEqual({ kind: "monthly_contributions" });
    expect(detectIntent("Qual meta corre maior risco de atraso?", t)).toEqual({ kind: "goal_risk" });
    expect(detectIntent("Como ficaria meu orçamento se minha renda caísse 20%?", t)).toEqual({ kind: "income_drop", pct: 20 });
    expect(detectIntent("O que mudou na minha situação financeira?", t).kind).toBe("what_changed");
    expect(detectIntent("Quais gastos aumentaram?", t).kind).toBe("what_changed");
    expect(detectIntent("Quanto preciso guardar para viajar em março?", t)).toEqual({ kind: "goal_saving", goal: "viajar", amountCents: null, targetDate: "2027-03-01" });
    expect(detectIntent("O que devo priorizar hoje?", t).kind).toBe("priorities");
    expect(detectIntent("Estou no caminho para atingir minha meta de aposentadoria?", t).kind).toBe("retirement");
    expect(detectIntent("bom dia", t).kind).toBe("help");
  });

  it("próximo mês pelo nome", () => {
    expect(nextMonthStart("março", "2026-10-21")).toBe("2027-03-01");
    expect(nextMonthStart("dezembro", "2026-10-21")).toBe("2026-12-01");
    expect(nextMonthStart("outubro", "2026-10-21")).toBe("2027-10-01");
    expect(nextMonthStart("brumário", "2026-10-21")).toBeNull();
  });
});
