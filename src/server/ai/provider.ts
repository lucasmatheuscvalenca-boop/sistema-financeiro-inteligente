import type { FinancialTool, ToolOutput } from "./tools";

/** Turno anterior da conversa (somente texto). */
export interface LlmTurn {
  role: "user" | "assistant";
  text: string;
}

export interface LlmAnswer {
  text: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  outputs: ToolOutput[];
  refused: boolean;
  model: string;
}

/**
 * Abstração de provedor de linguagem. O provedor só recebe as ferramentas de consulta
 * (somente leitura) e devolve texto. Trocar de provedor = nova implementação desta interface.
 */
export interface LlmProvider {
  readonly id: string;
  /** Nome mostrado na tela e no aviso de privacidade (por exemplo, "Claude" ou "Groq"). */
  readonly label: string;
  isConfigured(): boolean;
  answer(params: {
    system: string;
    history: LlmTurn[];
    question: string;
    tools: FinancialTool[];
    runTool: (name: string, input: unknown) => Promise<ToolOutput>;
    /** Prazo total da resposta (todas as voltas com as ferramentas); ao vencer, o provedor desiste. */
    signal?: AbortSignal;
  }): Promise<LlmAnswer>;
}

/** O provedor recusou por limite de uso (por exemplo, a cota gratuita do minuto ou do dia acabou). */
export class LlmRateLimitError extends Error {
  override readonly name = "LlmRateLimitError";
}

/** O provedor não terminou dentro do prazo total da resposta. */
export class LlmTimeoutError extends Error {
  override readonly name = "LlmTimeoutError";
  constructor() {
    super("O provedor de IA não respondeu a tempo");
  }
}

/** Falha do provedor com um código curto e seguro para registro (sem conteúdo do usuário). */
export class LlmProviderError extends Error {
  override readonly name = "LlmProviderError";
  constructor(readonly code: string) {
    super(`Provedor de IA: ${code}`);
  }
}

/** O modelo recebe fatos já formatados; o objeto bruto `data` fica só no servidor. */
export function factsOnly(out: ToolOutput): Omit<ToolOutput, "data"> {
  const { data, ...rest } = out;
  void data;
  return rest;
}
