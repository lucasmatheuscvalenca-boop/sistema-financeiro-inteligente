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
  isConfigured(): boolean;
  answer(params: {
    system: string;
    history: LlmTurn[];
    question: string;
    tools: FinancialTool[];
    runTool: (name: string, input: unknown) => Promise<ToolOutput>;
  }): Promise<LlmAnswer>;
}
