import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { askAction, deleteConversationAction } from "../_actions/intelligence";
import { Chat, type ChatMessage } from "@/components/ai/chat";
import { Card } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import type { MascotId } from "@/mascots/catalog";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { aiModeAvailable, getConversationMessages, listConversations } from "@/server/ai/assistant";
import { chatActions } from "@/server/ai/chat-actions";
import { HELP_EXAMPLES } from "@/server/ai/local-engine";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Assistente" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; pergunta?: string; enviar?: string }> }) {
  const { ctx, mascotId } = await requireOnboarded();
  const sp = await searchParams;
  const conversations = await listConversations(ctx);
  let initial: ChatMessage[] = [];
  let conversationId: string | null = null;
  if (sp.c) {
    try {
      const { messages } = await getConversationMessages(ctx, sp.c);
      conversationId = sp.c;
      initial = messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        mode: m.mode,
        tone: ((m.data as { tone?: string } | null)?.tone ?? "neutral") as ChatMessage["tone"],
        notice: (m.data as { notice?: string | null } | null)?.notice ?? null,
        mascotId: (m.mascotId as MascotId | null) ?? mascotId,
        at: m.createdAt.toISOString(),
        actions: m.role === "assistant" ? chatActions((m.data as { tools?: Array<{ tool: string; data?: unknown }> } | null)?.tools ?? []) : [],
      }));
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
    }
  }
  const mode = aiModeAvailable();
  const list = (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li key={c.id} className="group flex items-center gap-1">
          <Link href={`/assistente?c=${c.id}`} aria-current={c.id === conversationId ? "page" : undefined} className={cn("block flex-1 truncate rounded-lg px-2 py-1.5 text-sm transition", c.id === conversationId ? "bg-petrol-50 font-medium text-link dark:bg-petrol-900/40" : "text-muted hover:bg-surface-2 hover:text-ink")}>
            {c.title}
          </Link>
          <InlineAction action={deleteConversationAction} hidden={{ id: c.id }} confirm="Apagar esta conversa?" className="sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <span aria-label="Apagar conversa">×</span>
          </InlineAction>
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <PageHeader eyebrow="IA Financeira" title="Assistente financeiro" description="Respostas com seus dados reais e autorizados, calculadas pelo motor determinístico. O assistente nunca move dinheiro nem altera dados." />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <div className="flex gap-2">
            <Link href="/assistente" className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-petrol-400 hover:bg-surface-2">
              <Plus className="size-4 text-link" /> Nova conversa
            </Link>
          </div>
          {conversations.length ? (
            <details className="rounded-2xl border border-line bg-surface p-2 lg:hidden">
              <summary className="cursor-pointer px-2 py-1 text-sm font-medium">Conversas anteriores ({conversations.length})</summary>
              <div className="mt-1 max-h-60 overflow-y-auto">{list}</div>
            </details>
          ) : null}
          <Card className="hidden max-h-[50vh] overflow-y-auto p-2 lg:block">
            {conversations.length === 0 ? <p className="p-2 text-xs text-muted">Suas conversas aparecem aqui.</p> : list}
          </Card>
          <p className="hidden px-1 text-xs text-muted lg:block">Cada resposta informa a data dos dados, separa fatos de estimativas e lista o que falta.</p>
        </aside>
        <Chat key={conversationId ?? "nova"} action={askAction} mascotId={mascotId} initial={initial} conversationId={conversationId} suggestions={HELP_EXAMPLES} prefill={sp.pergunta} autoSend={sp.enviar === "1" && !!sp.pergunta && !conversationId} mode={mode} />
      </div>
    </div>
  );
}
