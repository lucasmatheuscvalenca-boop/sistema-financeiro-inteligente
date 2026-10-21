import Anthropic from "@anthropic-ai/sdk";
import type { LlmAnswer, LlmProvider, LlmTurn } from "./provider";
import type { FinancialTool, ToolOutput } from "./tools";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

/**
 * Provedor Claude (Anthropic). Laço manual de ferramentas: o modelo pede uma consulta,
 * o servidor executa a função determinística com o usuário autenticado e devolve o resultado.
 * O histórico de turnos anteriores é enviado só como texto (sem blocos de raciocínio), e
 * dentro de um turno o conteúdo da resposta é reenviado sem alterações.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  constructor(
    private readonly model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    private readonly apiKey = process.env.ANTHROPIC_API_KEY,
  ) {}

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private getClient(): Anthropic {
    this.client ??= new Anthropic({ apiKey: this.apiKey, timeout: 120_000, maxRetries: 2 });
    return this.client;
  }

  async answer(params: {
    system: string;
    history: LlmTurn[];
    question: string;
    tools: FinancialTool[];
    runTool: (name: string, input: unknown) => Promise<ToolOutput>;
  }): Promise<LlmAnswer> {
    const client = this.getClient();
    const tools: Anthropic.Beta.BetaTool[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.jsonSchema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...params.history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.Beta.BetaMessageParam),
      { role: "user", content: params.question },
    ];
    const toolCalls: LlmAnswer["toolCalls"] = [];
    const outputs: ToolOutput[] = [];
    let servedModel = this.model;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: params.system,
        messages,
        tools,
        output_config: { effort: "medium" },
        // Se um classificador de segurança recusar, a API tenta automaticamente outro modelo.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      servedModel = response.model;

      if (response.stop_reason === "refusal") {
        return { text: "", toolCalls, outputs, refused: true, model: servedModel };
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { text, toolCalls, outputs, refused: false, model: servedModel };
      }
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        toolCalls.push({ name: use.name, input: use.input });
        try {
          const out = await params.runTool(use.name, use.input);
          outputs.push(out);
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(stripData(out)) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: e instanceof Error ? e.message : "Erro ao consultar os dados" });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return { text: "", toolCalls, outputs, refused: false, model: servedModel };
  }
}

/** O modelo recebe fatos já formatados; o objeto bruto `data` fica só no servidor. */
function stripData(out: ToolOutput): Omit<ToolOutput, "data"> {
  const { data, ...rest } = out;
  void data;
  return rest;
}
