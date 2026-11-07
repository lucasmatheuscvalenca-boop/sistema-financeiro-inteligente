import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqProvider } from "@/server/ai/groq-provider";
import { LlmProviderError, LlmRateLimitError, LlmTimeoutError } from "@/server/ai/provider";
import type { FinancialTool, ToolOutput } from "@/server/ai/tools";

const TOOL: FinancialTool = {
  name: "resumo_financeiro",
  description: "Resumo do mês",
  schema: z.object({ mes: z.string().nullable() }),
  jsonSchema: { type: "object", properties: { mes: { type: ["string", "null"] } }, required: ["mes"], additionalProperties: false },
  run: async () => OUT,
};
const OUT: ToolOutput = { tool: "resumo_financeiro", asOf: "2026-11-06", summary: "Saldo do mês", facts: ["Receitas: R$ 3.000,00"], estimates: [], assumptions: [], missing: [], data: { segredo: 1 } };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const toolCall = (args: string) => json({ model: "openai/gpt-oss-120b", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "resumo_financeiro", arguments: args } }] } }] });
const final = (text: string) => json({ model: "openai/gpt-oss-120b", choices: [{ finish_reason: "stop", message: { content: text } }] });

/** Resposta que só chega quando o prazo cancela a chamada (simula a Groq lenta). */
const HANG = Symbol("hang");

function setup(responses: Array<Response | typeof HANG>, opts: { deadlineMs?: number } = {}) {
  const bodies: Array<Record<string, unknown>> = [];
  const headers: Array<Record<string, string>> = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(init?.headers as Record<string, string>);
    signals.push(init?.signal);
    const next = responses.shift();
    if (!next) throw new Error("sem resposta simulada");
    if (next === HANG) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelada", "AbortError")));
      });
    }
    return next;
  });
  const sleep = vi.fn(async () => {});
  const provider = new GroqProvider("openai/gpt-oss-120b", "chave-de-teste", fetchImpl as unknown as typeof fetch, sleep, opts.deadlineMs);
  const runTool = vi.fn(async () => OUT);
  const ask = (signal?: AbortSignal) =>
    provider.answer({ system: "Regras", history: [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá" }], question: "Como estou?", tools: [TOOL], runTool, signal });
  return { provider, fetchImpl, sleep, runTool, bodies, headers, signals, ask };
}

describe("provedor Groq (plano gratuito)", () => {
  it("só fica ativo com a chave", () => {
    expect(new GroqProvider("m", undefined).isConfigured()).toBe(false);
    expect(new GroqProvider("m", "k").isConfigured()).toBe(true);
  });

  it("consulta as ferramentas e envia ao modelo só os fatos formatados", async () => {
    const t = setup([toolCall('{"mes":null}'), final("Você recebeu R$ 3.000,00.")]);
    const r = await t.ask();
    expect(r).toMatchObject({ text: "Você recebeu R$ 3.000,00.", refused: false, model: "openai/gpt-oss-120b" });
    expect(r.toolCalls).toEqual([{ name: "resumo_financeiro", input: { mes: null } }]);
    expect(r.outputs).toEqual([OUT]);
    expect(t.runTool).toHaveBeenCalledWith("resumo_financeiro", { mes: null });
    expect(t.headers[0]!.authorization).toBe("Bearer chave-de-teste");

    const first = t.bodies[0]!;
    expect(first.model).toBe("openai/gpt-oss-120b");
    expect(first.reasoning_effort).toBe("low");
    expect(first.messages).toEqual([
      { role: "system", content: "Regras" },
      { role: "user", content: "oi" },
      { role: "assistant", content: "Olá" },
      { role: "user", content: "Como estou?" },
    ]);
    expect(first.tools).toEqual([{ type: "function", function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.jsonSchema } }]);

    const second = t.bodies[1]!.messages as Array<Record<string, unknown>>;
    const toolMsg = second.at(-1)!;
    expect(toolMsg).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(String(toolMsg.content)).toContain("Receitas: R$ 3.000,00");
    expect(String(toolMsg.content)).not.toContain("segredo");
  });

  it("parâmetros em JSON inválido voltam ao modelo como erro, sem executar a ferramenta", async () => {
    const t = setup([toolCall("{mes:"), final("Não consegui consultar.")]);
    const r = await t.ask();
    expect(t.runTool).not.toHaveBeenCalled();
    expect(r.text).toBe("Não consegui consultar.");
    const toolMsg = (t.bodies[1]!.messages as Array<Record<string, unknown>>).at(-1)!;
    expect(String(toolMsg.content)).toContain("JSON válido");
  });

  it("cota do minuto: espera o retry-after e tenta de novo uma vez", async () => {
    const t = setup([json({ error: { code: "rate_limit_exceeded" } }, 429, { "retry-after": "3" }), final("Pronto.")]);
    const r = await t.ask();
    expect(t.sleep).toHaveBeenCalledWith(3000);
    expect(r.text).toBe("Pronto.");
  });

  it("cota do dia (espera longa ou sem retry-after): avisa limite atingido", async () => {
    await expect(setup([json({}, 429, { "retry-after": "3600" })]).ask()).rejects.toBeInstanceOf(LlmRateLimitError);
    await expect(setup([json({}, 429)]).ask()).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("outros erros viram um código curto para o registro", async () => {
    const err = await setup([json({ error: { code: "invalid_api_key", message: "Invalid API Key" } }, 401)])
      .ask()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmProviderError);
    expect((err as LlmProviderError).code).toBe("groq_401_invalid_api_key");
  });

  it("prazo total único para todas as voltas: a mesma chamada cancelável vale do começo ao fim", async () => {
    const t = setup([toolCall('{"mes":null}'), final("Pronto.")]);
    await t.ask();
    expect(t.signals).toHaveLength(2);
    expect(t.signals[0]).toBeInstanceOf(AbortSignal);
    expect(t.signals[1]).toBe(t.signals[0]);
  });

  it("estourando o prazo no meio das voltas, desiste com LlmTimeoutError (o assistente responde no modo local)", async () => {
    const t = setup([toolCall('{"mes":null}'), HANG], { deadlineMs: 30 });
    const started = Date.now();
    await expect(t.ask()).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(t.runTool).toHaveBeenCalledTimes(1);
  });

  it("prazo de quem chama também interrompe", async () => {
    const t = setup([HANG], { deadlineMs: 60_000 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    await expect(t.ask(controller.signal)).rejects.toBeInstanceOf(LlmTimeoutError);
  });
});
