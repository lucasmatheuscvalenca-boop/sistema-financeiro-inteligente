import { describe, expect, it } from "vitest";
import { chatActions } from "@/server/ai/chat-actions";

const spend = (over: Record<string, unknown>) => ({
  tool: "posso_gastar",
  data: { amountCents: 60000, level: "red", maxSafeAmountCents: 25000, goalsAtRisk: [], budget: null, request: { description: "Jantar", categoryId: "cat-lazer" }, ...over },
});

describe("ações sugeridas no assistente", () => {
  it("compra que não cabe: simular valor seguro, ver meta, orçamento e registrar mesmo assim", () => {
    const a = chatActions([spend({ goalsAtRisk: [{ goalId: "g1", name: "Viagem" }], budget: { categoryId: "cat-lazer", categoryName: "Lazer", exceeded: true } })]);
    expect(a.map((x) => x.label)).toEqual(["Simular valor menor", "Ver impacto na meta", "Ajustar orçamento", "Adicionar mesmo assim"]);
    expect(a[0]).toMatchObject({ kind: "ask", prompt: "Posso gastar R$ 250,00 com Jantar?" });
    expect(a[1]!.href).toBe("/metas/g1");
    expect(a[3]!.href).toBe("/movimentacoes?nova=1&valor=600%2C00&descricao=Jantar&cat=cat-lazer");
  });

  it("compra que cabe: registrar primeiro, sem simulação de valor menor", () => {
    const a = chatActions([spend({ level: "green", maxSafeAmountCents: 90000 })]);
    expect(a[0]).toMatchObject({ label: "Registrar despesa", kind: "link" });
    expect(a.some((x) => x.label === "Simular valor menor")).toBe(false);
  });

  it("sem valor seguro positivo não sugere simular", () => {
    const a = chatActions([spend({ maxSafeAmountCents: 0 })]);
    expect(a.map((x) => x.label)).toEqual(["Adicionar mesmo assim"]);
  });

  it("metas em risco levam à meta e a uma nova pergunta; remove duplicadas e limita a 4", () => {
    const a = chatActions([
      { tool: "status_metas", data: { goals: [{ id: "g2", name: "Carro", health: "at_risk" }] } },
      { tool: "aporte_do_mes" },
      { tool: "projecao_caixa" },
      { tool: "quanto_posso_gastar_hoje" },
    ]);
    expect(a.map((x) => x.label)).toEqual(["Abrir Carro", "Quanto guardar por mês?", "Ver metas", "Ver fluxo de caixa"]);
    expect(a).toHaveLength(4);
  });

  it("ferramenta desconhecida ou sem dados não gera ação", () => {
    expect(chatActions([{ tool: "inexistente" }, { tool: "posso_gastar", data: null }])).toEqual([]);
  });
});
