import { afterAll, afterEach, describe, expect, it } from "vitest";
import { askAssistant, deleteConversation, getConversationMessages, listConversations, setLlmProvider } from "@/server/ai/assistant";
import type { LlmProvider } from "@/server/ai/provider";
import { closeDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { createGoal } from "@/server/services/goals";
import { selectMascot } from "@/server/services/preferences";
import { createRecurrence } from "@/server/services/recurrences";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});
afterEach(() => setLlmProvider(undefined));

async function setupUser(name: string, mascot: "lince" | "capivara" | "guardiao") {
  const u = await createUser(name);
  await selectMascot(u, mascot);
  const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 300000, initialBalanceDate: "2026-10-01" });
  await createRecurrence(u, { kind: "income", amountCents: 600000, description: "Salário", frequency: "monthly", startDate: "2026-01-05", accountId: cc.id });
  await createRecurrence(u, { kind: "expense", amountCents: 200000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-28", accountId: cc.id });
  return u;
}

describe("assistente (modo local)", () => {
  it("exige mascote escolhido", async () => {
    setLlmProvider(null);
    const u = await createUser("Sem Mascote IA");
    await expect(askAssistant(u, { message: "Posso gastar R$ 100?" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("responde com dados ausentes informando a limitação", async () => {
    setLlmProvider(null);
    const u = await createUser("Vazio IA");
    await selectMascot(u, "coruja");
    const r = await askAssistant(u, { message: "Posso gastar R$ 600 hoje?" });
    expect(r.answer.mode).toBe("local");
    expect(r.answer.text).toContain("Faltam dados");
    expect(r.answer.text).toContain("Análise condicional");
    expect(r.answer.text).not.toMatch(/Saldo disponível hoje: R\$/);
  });

  it("a personalidade muda o tom, mas não os fatos", async () => {
    setLlmProvider(null);
    const a = await setupUser("Lince Fatos", "lince");
    const b = await setupUser("Capivara Fatos", "capivara");
    const q = "Posso gastar R$ 600 em um jantar e um passeio neste fim de semana?";
    const ra = await askAssistant(a, { message: q });
    const rb = await askAssistant(b, { message: q });
    expect(ra.answer.tools[0]!.facts).toEqual(rb.answer.tools[0]!.facts);
    expect(ra.answer.tools[0]!.summary).toBe("Cabe no seu planejamento");
    expect(ra.answer.text).not.toBe(rb.answer.text);
    expect(ra.answer.text).toContain("Dados considerados até 21/10/2026");
    expect(ra.answer.text).toContain("Premissas");
  });

  it("responde as perguntas principais sem erro e guarda o histórico", async () => {
    setLlmProvider(null);
    const u = await setupUser("Perguntas", "guardiao");
    await createGoal(u, { name: "Viagem para o Chile", kind: "travel", targetCents: 600000, targetDate: "2027-03-15", priority: 1 });
    const questions = [
      "Quanto posso gastar com lazer até o fim do mês?",
      "Quanto preciso aportar este mês?",
      "Qual meta corre maior risco de atraso?",
      "Como ficaria meu orçamento se minha renda caísse 20%?",
      "O que mudou na minha situação financeira?",
      "Quanto preciso guardar para viajar em março?",
      "O que devo priorizar hoje?",
      "Estou no caminho para atingir minha meta de aposentadoria?",
    ];
    let conversationId: string | undefined;
    for (const message of questions) {
      const r = await askAssistant(u, { message, conversationId });
      conversationId = r.conversationId;
      expect(r.answer.tools.length).toBeGreaterThan(0);
      expect(r.answer.text.length).toBeGreaterThan(50);
    }
    const travel = await askAssistant(u, { message: "Quanto preciso guardar para viajar em março?", conversationId });
    const plain = (t: string) => t.replace(/\u00a0/g, " ");
    expect(travel.answer.text).toContain("Viagem para o Chile");
    expect(plain(travel.answer.text)).toContain("Aporte necessário: R$ 1.200,00 por mês");
    const drop = await askAssistant(u, { message: "Como ficaria meu orçamento se minha renda caísse 20%?", conversationId });
    expect(plain(drop.answer.text)).toContain("R$ 6.000,00 → R$ 4.800,00");
    const { messages } = await getConversationMessages(u, conversationId!);
    expect(messages.length).toBe((questions.length + 2) * 2);
  });

  it("conversas são isoladas por usuário", async () => {
    setLlmProvider(null);
    const a = await setupUser("Conversa A", "lince");
    const b = await setupUser("Conversa B", "capivara");
    const r = await askAssistant(a, { message: "O que devo priorizar hoje?" });
    await expect(getConversationMessages(b, r.conversationId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(askAssistant(b, { message: "oi tudo bem?", conversationId: r.conversationId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteConversation(b, r.conversationId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listConversations(b)).length).toBe(0);
  });
});

describe("assistente com provedor de linguagem", () => {
  it("o provedor só acessa dados pelas ferramentas, com o usuário autenticado", async () => {
    const u = await setupUser("LLM", "lince");
    let seenSystem = "";
    const fake: LlmProvider = {
      id: "fake",
      isConfigured: () => true,
      async answer({ system, runTool }) {
        seenSystem = system;
        const out = await runTool("resumo_financeiro", { mes: null });
        return { text: `Resumo: ${out.facts[0]}`, toolCalls: [{ name: "resumo_financeiro", input: { mes: null } }], outputs: [out], refused: false, model: "fake-model" };
      },
    };
    setLlmProvider(fake);
    const r = await askAssistant(u, { message: "Como estou este mês?" });
    expect(r.answer.mode).toBe("llm");
    expect(r.answer.text.replace(/\u00a0/g, " ")).toContain("R$ 3.000,00");
    expect(seenSystem).toContain("Todo número que você mencionar precisa vir do resultado de uma ferramenta");
    expect(seenSystem).toContain("Lince");
  });

  it("recusa ou falha do provedor cai para o modo local, avisando", async () => {
    const u = await setupUser("Falha LLM", "capivara");
    setLlmProvider({
      id: "refuses",
      isConfigured: () => true,
      async answer() {
        return { text: "", toolCalls: [], outputs: [], refused: true, model: "x" };
      },
    });
    const r1 = await askAssistant(u, { message: "Posso gastar R$ 100?" });
    expect(r1.answer.mode).toBe("local");
    expect(r1.answer.notice).toContain("modo local");
    setLlmProvider({
      id: "broken",
      isConfigured: () => true,
      async answer() {
        throw new Error("rede indisponível");
      },
    });
    const r2 = await askAssistant(u, { message: "Posso gastar R$ 100?" });
    expect(r2.answer.notice).toContain("indisponível");
  });
});
