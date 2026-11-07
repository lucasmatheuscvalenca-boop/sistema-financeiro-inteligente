import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { formatDateBR } from "@/domain/dates";
import { getMascot, type MascotId } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { consumeRateLimit } from "../security/rate-limit";
import type { ServiceContext } from "../services/context";
import { existingId, parse } from "../services/common";
import { getPreferences } from "../services/preferences";
import { AnthropicProvider } from "./anthropic-provider";
import { GroqProvider } from "./groq-provider";
import { answerLocally, composeAnswer, type AssistantAnswer } from "./local-engine";
import { LlmProviderError, LlmRateLimitError, LlmTimeoutError, type LlmProvider } from "./provider";
import { ANSWER_DEADLINE_MS } from "./groq-provider";
import { ALL_TOOLS, runTool } from "./tools";

let providerOverride: LlmProvider | null | undefined;
let deadlineMs = ANSWER_DEADLINE_MS;

/** Prazo total da resposta da IA (testes usam um prazo curto). */
export function setAssistantDeadlineMs(ms: number | undefined): void {
  deadlineMs = ms ?? ANSWER_DEADLINE_MS;
}

/** Permite injetar um provedor (testes) ou forçar o modo local (null). */
export function setLlmProvider(p: LlmProvider | null | undefined): void {
  providerOverride = p;
}

/**
 * Primeiro provedor com chave configurada: Claude (pago, ANTHROPIC_API_KEY) e depois Groq
 * (plano gratuito, GROQ_API_KEY). Sem nenhuma chave, o assistente fica no modo local.
 */
function activeProvider(): LlmProvider | null {
  if (providerOverride !== undefined) return providerOverride;
  if (process.env.AI_MODE === "local") return null;
  for (const p of [new AnthropicProvider(), new GroqProvider()]) if (p.isConfigured()) return p;
  return null;
}

export function aiModeAvailable(): "llm" | "local" {
  return activeProvider() ? "llm" : "local";
}

/** Nome do provedor em uso (para a tela do assistente e o aviso de privacidade), ou null no modo local. */
export function aiProviderLabel(): string | null {
  return activeProvider()?.label ?? null;
}

export function buildSystemPrompt(mascotId: MascotId, today: string, name: string): string {
  const m = getMascot(mascotId);
  return [
    `Você é ${m.name}, o consultor financeiro pessoal do aplicativo Meu Banqueiro. Responda sempre em português do Brasil.`,
    voiceFor(mascotId).styleGuide,
    `A voz muda só o tom e a forma de explicar. Fatos, valores, projeções e conclusões vêm exclusivamente das ferramentas.`,
    `Hoje é ${formatDateBR(today)}. O usuário se chama ${name}.`,
    "",
    "Regras obrigatórias:",
    "1. Todo número que você mencionar precisa vir do resultado de uma ferramenta desta conversa. Nunca calcule de cabeça, nunca invente saldos, transações, cotações ou rentabilidades.",
    "2. Sempre consulte as ferramentas antes de responder sobre a situação financeira. Para \"posso gastar?\", use posso_gastar; nunca responda só com base no saldo.",
    "3. Informe o período analisado e a data de referência dos dados.",
    "4. Separe claramente fatos (dados registrados), estimativas/projeções e hipóteses. Projeções e rendimentos não são garantidos.",
    "5. Se faltar informação, diga o que falta e, quando útil, apresente um cenário condicional com a premissa explícita.",
    "6. Você não executa pagamentos, transferências nem altera dados. Opções que você sugerir são simulações até o usuário confirmá-las no aplicativo.",
    "7. Não faça recomendação individualizada de investimento específico (produto, ativo, fundo). Explique conceitos e cenários.",
    "8. Seja claro e conciso: comece pela resposta direta, depois o porquê em poucos tópicos, e termine com uma ação sugerida.",
  ].join("\n");
}

const askSchema = z.object({
  message: z.string().trim().min(2, "Escreva sua pergunta").max(1000, "Use até 1.000 caracteres"),
  conversationId: z.uuid().nullish(),
});

export interface AskResult {
  conversationId: string;
  answer: AssistantAnswer & { model?: string; notice?: string };
  mascotId: MascotId;
}

export async function askAssistant(ctx: ServiceContext, input: z.input<typeof askSchema>): Promise<AskResult> {
  const data = parse(askSchema, input);
  await consumeRateLimit(ctx.db, `ai:${ctx.userId}`, 60, 3600);
  const prefs = await getPreferences(ctx);
  if (!prefs.mascotId) throw new ValidationError("Escolha seu mascote antes de usar o assistente.");
  const mascotId = prefs.mascotId;
  const [user] = await ctx.db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, ctx.userId));

  let conversationId = data.conversationId ?? null;
  if (conversationId) {
    const [conv] = await ctx.db
      .select()
      .from(s.aiConversations)
      .where(and(eq(s.aiConversations.id, conversationId), eq(s.aiConversations.userId, ctx.userId)))
      .limit(1);
    if (!conv) throw new NotFoundError("Conversa não encontrada");
  } else {
    const [conv] = await ctx.db
      .insert(s.aiConversations)
      .values({ userId: ctx.userId, title: data.message.slice(0, 80) })
      .returning({ id: s.aiConversations.id });
    conversationId = conv!.id;
  }
  const history = await ctx.db
    .select({ role: s.aiMessages.role, content: s.aiMessages.content })
    .from(s.aiMessages)
    .where(and(eq(s.aiMessages.conversationId, conversationId), eq(s.aiMessages.userId, ctx.userId)))
    .orderBy(asc(s.aiMessages.createdAt));
  await ctx.db.insert(s.aiMessages).values({ conversationId, userId: ctx.userId, role: "user", content: data.message, mascotId });

  const provider = activeProvider();
  let answer: AskResult["answer"];
  if (provider) {
    // Prazo total para a IA (todas as voltas). A pergunta já foi gravada: vencido o prazo, a pessoa
    // recebe a resposta do modo local em vez de ficar sem nenhuma quando a função estoura o tempo.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new LlmTimeoutError()), deadlineMs);
    try {
      const llm = await Promise.race([
        provider.answer({
          system: buildSystemPrompt(mascotId, ctx.today, user?.name ?? ""),
          history: history.slice(-12).map((h) => ({ role: h.role as "user" | "assistant", text: h.content })),
          question: data.message,
          tools: ALL_TOOLS,
          runTool: (name, toolInput) => runTool(ctx, name, toolInput),
          signal: deadline.signal,
        }),
        new Promise<never>((_, reject) => deadline.signal.addEventListener("abort", () => reject(new LlmTimeoutError()), { once: true })),
      ]);
      if (llm.refused || !llm.text) {
        const local = await answerLocally(ctx, mascotId, data.message);
        answer = { ...local, notice: "O modelo de linguagem não respondeu a esta pergunta; usei o modo local." };
      } else {
        const tone = composeAnswer(mascotId, llm.outputs).tone;
        answer = { text: llm.text, tone, tools: llm.outputs, mode: "llm", model: llm.model };
      }
    } catch (e) {
      console.error("[assistente] falha no provedor de IA", { provider: provider.id, error: e instanceof Error ? e.name : "desconhecido", code: e instanceof LlmProviderError ? e.code : undefined });
      const local = await answerLocally(ctx, mascotId, data.message);
      const notice =
        e instanceof LlmRateLimitError
          ? "O limite de uso da IA acabou por agora; respondi no modo local. Tente de novo em alguns minutos."
          : e instanceof LlmTimeoutError || deadline.signal.aborted
            ? "A IA demorou demais para responder; respondi no modo local. Tente de novo em instantes."
            : "O serviço de IA está indisponível agora; respondi no modo local.";
      answer = { ...local, notice };
    } finally {
      clearTimeout(timer);
    }
  } else {
    answer = await answerLocally(ctx, mascotId, data.message);
  }

  await ctx.db.insert(s.aiMessages).values({
    conversationId,
    userId: ctx.userId,
    role: "assistant",
    content: answer.text,
    mascotId,
    mode: answer.mode,
    toolCalls: answer.tools.map((t) => ({ name: t.tool, input: null })),
    data: { tone: answer.tone, notice: answer.notice ?? null, tools: answer.tools.map((t) => ({ tool: t.tool, summary: t.summary, asOf: t.asOf, data: t.data ?? null })) },
  });
  await ctx.db.update(s.aiConversations).set({ updatedAt: new Date() }).where(eq(s.aiConversations.id, conversationId));
  return { conversationId, answer, mascotId };
}

export async function listConversations(ctx: ServiceContext) {
  return ctx.db.select().from(s.aiConversations).where(eq(s.aiConversations.userId, ctx.userId)).orderBy(desc(s.aiConversations.updatedAt)).limit(50);
}

export async function getConversationMessages(ctx: ServiceContext, conversationId: string) {
  existingId(conversationId, "Conversa não encontrada");
  const [conv] = await ctx.db
    .select()
    .from(s.aiConversations)
    .where(and(eq(s.aiConversations.id, conversationId), eq(s.aiConversations.userId, ctx.userId)))
    .limit(1);
  if (!conv) throw new NotFoundError("Conversa não encontrada");
  const messages = await ctx.db.select().from(s.aiMessages).where(eq(s.aiMessages.conversationId, conversationId)).orderBy(asc(s.aiMessages.createdAt));
  return { conversation: conv, messages };
}

export async function deleteConversation(ctx: ServiceContext, conversationId: string): Promise<void> {
  existingId(conversationId, "Conversa não encontrada");
  const r = await ctx.db
    .delete(s.aiConversations)
    .where(and(eq(s.aiConversations.id, conversationId), eq(s.aiConversations.userId, ctx.userId)))
    .returning({ id: s.aiConversations.id });
  if (r.length === 0) throw new NotFoundError("Conversa não encontrada");
}

export async function deleteAllConversations(ctx: ServiceContext): Promise<void> {
  await ctx.db.delete(s.aiConversations).where(eq(s.aiConversations.userId, ctx.userId));
}
