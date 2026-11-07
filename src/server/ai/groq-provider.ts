import { factsOnly, LlmProviderError, LlmRateLimitError, LlmTimeoutError, type LlmAnswer, type LlmProvider, type LlmTurn } from "./provider";
import type { FinancialTool, ToolOutput } from "./tools";

const BASE_URL = "https://api.groq.com/openai/v1";
/** Modelo aberto com bom uso de ferramentas e disponível no plano gratuito da Groq. */
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const MAX_TOOL_ROUNDS = 8;
/** Espera máxima por uma nova tentativa quando a cota do minuto acaba (cabeçalho retry-after). */
const MAX_RETRY_WAIT_S = 20;
/**
 * Prazo total de uma resposta, somando todas as voltas com as ferramentas e as esperas. A função da
 * Vercel tem 60 s: sobra tempo para responder no modo local e gravar a conversa.
 */
export const ANSWER_DEADLINE_MS = 40_000;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface Completion {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
}

/**
 * Provedor Groq, com plano gratuito (limites por minuto e por dia, sem cartão). Usa a API de
 * chat compatível com a da OpenAI e o mesmo laço manual de ferramentas do provedor Claude: o
 * modelo pede uma consulta, o servidor executa a função determinística com o usuário
 * autenticado e devolve só os fatos formatados.
 */
export class GroqProvider implements LlmProvider {
  readonly id = "groq";
  readonly label = "Groq";

  constructor(
    private readonly model = process.env.GROQ_MODEL || DEFAULT_MODEL,
    private readonly apiKey = process.env.GROQ_API_KEY,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    private readonly deadlineMs = ANSWER_DEADLINE_MS,
  ) {}

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async complete(body: Record<string, unknown>, signal: AbortSignal): Promise<Completion> {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new LlmTimeoutError();
      let res: Response;
      try {
        res = await this.fetchImpl(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new LlmTimeoutError();
        throw e;
      }
      if (res.status === 429) {
        // Cota do minuto: espera o tempo pedido e tenta uma vez. Cota do dia: desiste.
        const wait = Number(res.headers.get("retry-after"));
        if (attempt === 0 && Number.isFinite(wait) && wait > 0 && wait <= MAX_RETRY_WAIT_S) {
          // A espera também respeita o prazo total.
          await Promise.race([this.sleep(Math.ceil(wait * 1000)), aborted(signal)]);
          continue;
        }
        throw new LlmRateLimitError("Limite de uso do provedor de IA atingido");
      }
      if (!res.ok) throw new LlmProviderError(`groq_${res.status}${await errorCode(res)}`);
      return (await res.json()) as Completion;
    }
  }

  async answer(params: {
    system: string;
    history: LlmTurn[];
    question: string;
    tools: FinancialTool[];
    runTool: (name: string, input: unknown) => Promise<ToolOutput>;
    signal?: AbortSignal;
  }): Promise<LlmAnswer> {
    // Um prazo só para a resposta inteira (todas as voltas), e não 60 s por chamada: nove voltas
    // lentas passariam do tempo da função e a pessoa ficaria sem resposta nenhuma.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new LlmTimeoutError()), this.deadlineMs);
    const stop = () => controller.abort(params.signal?.reason);
    params.signal?.addEventListener("abort", stop, { once: true });
    if (params.signal?.aborted) stop();
    try {
      return await this.loop(params, controller.signal);
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener("abort", stop);
    }
  }

  private async loop(
    params: { system: string; history: LlmTurn[]; question: string; tools: FinancialTool[]; runTool: (name: string, input: unknown) => Promise<ToolOutput> },
    signal: AbortSignal,
  ): Promise<LlmAnswer> {
    const tools = params.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
    const messages: ChatMessage[] = [
      { role: "system", content: params.system },
      ...params.history.map((h): ChatMessage => ({ role: h.role, content: h.text })),
      { role: "user", content: params.question },
    ];
    const toolCalls: LlmAnswer["toolCalls"] = [];
    const outputs: ToolOutput[] = [];
    let servedModel = this.model;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const completion = await this.complete(
        {
          model: this.model,
        messages,
        tools,
        // Na última volta o modelo precisa responder com o que já consultou.
          tool_choice: lastRound ? "none" : "auto",
          max_completion_tokens: 2048,
          // Raciocínio curto nos modelos gpt-oss: poupa a cota gratuita de tokens.
          ...(this.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        },
        signal,
      );
      servedModel = completion.model || servedModel;
      const choice = completion.choices?.[0];
      if (!choice?.message) throw new LlmProviderError("groq_sem_resposta");
      const calls = choice.message.tool_calls ?? [];
      if (calls.length === 0 || lastRound) {
        const text = (choice.message.content ?? "").trim();
        return { text, toolCalls, outputs, refused: choice.finish_reason === "content_filter", model: servedModel };
      }
      // Reenvia só o pedido de ferramentas (sem o texto de raciocínio que alguns modelos devolvem).
      messages.push({ role: "assistant", content: choice.message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let input: unknown;
        try {
          input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          messages.push({ role: "tool", tool_call_id: call.id, content: "Erro: os parâmetros não vieram em JSON válido." });
          continue;
        }
        toolCalls.push({ name: call.function.name, input });
        if (signal.aborted) throw new LlmTimeoutError();
        try {
          const out = await params.runTool(call.function.name, input);
          outputs.push(out);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(factsOnly(out)) });
        } catch (e) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Erro: ${e instanceof Error ? e.message : "falha ao consultar os dados"}` });
        }
      }
    }
    return { text: "", toolCalls, outputs, refused: false, model: servedModel };
  }
}

/** Promessa que falha quando o prazo vence (para não esperar à toa). */
function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new LlmTimeoutError());
    else signal.addEventListener("abort", () => reject(new LlmTimeoutError()), { once: true });
  });
}

/** Código curto do erro da API (ex.: invalid_api_key, model_decommissioned), para o registro. */
async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } };
    const code = body.error?.code;
    return typeof code === "string" && /^[a-z0-9_]{1,60}$/.test(code) ? `_${code}` : "";
  } catch {
    return "";
  }
}
