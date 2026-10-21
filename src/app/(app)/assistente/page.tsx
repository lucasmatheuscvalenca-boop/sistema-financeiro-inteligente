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
import { HELP_EXAMPLES } from "@/server/ai/local-engine";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Assistente" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; pergunta?: string }> }) {
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
      }));
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
    }
  }
  const mode = aiModeAvailable();
  return (
    <div>
      <PageHeader eyebrow="Inteligência" title="Assistente financeiro" description="Respostas com seus dados reais e autorizados, calculadas pelo motor determinístico. O assistente nunca move dinheiro nem altera dados." />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <Link href="/assistente" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
            <Plus className="size-4" /> Nova conversa
          </Link>
          <Card className="max-h-[50vh] overflow-y-auto p-2">
            {conversations.length === 0 ? <p className="p-2 text-xs text-muted">Suas conversas aparecem aqui.</p> : null}
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <Link href={`/assistente?c=${c.id}`} className={cn("block flex-1 truncate rounded-lg px-2 py-1.5 text-sm", c.id === conversationId ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2")}>
                    {c.title}
                  </Link>
                  <InlineAction action={deleteConversationAction} hidden={{ id: c.id }} confirm="Apagar esta conversa?" className="opacity-0 group-hover:opacity-100">
                    ×
                  </InlineAction>
                </li>
              ))}
            </ul>
          </Card>
          <p className="px-1 text-xs text-muted">Cada resposta informa a data dos dados, separa fatos de estimativas e lista o que falta.</p>
        </aside>
        <Chat key={conversationId ?? "nova"} action={askAction} mascotId={mascotId} initial={initial} conversationId={conversationId} suggestions={HELP_EXAMPLES} prefill={sp.pergunta} mode={mode} />
      </div>
    </div>
  );
}
