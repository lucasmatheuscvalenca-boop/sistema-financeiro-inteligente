"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import { getMascot, type MascotId } from "@/mascots/catalog";
import { toneToState, type Tone } from "@/mascots/voice";
import { initialActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";
import type { ChatAction } from "@/server/ai/chat-actions";
import { RichText } from "./rich-text";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: Tone;
  mode?: string | null;
  notice?: string | null;
  mascotId?: MascotId | null;
  /** ISO; exibido como hora local. */
  at?: string;
  actions?: ChatAction[];
}

function Time({ at }: { at?: string }) {
  if (!at) return null;
  const d = new Date(at);
  return (
    <time dateTime={at} suppressHydrationWarning className="text-[11px] text-muted">
      {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

function Actions({ actions, onAsk, disabled, highlightFirst }: { actions: ChatAction[]; onAsk: (prompt: string) => void; disabled: boolean; highlightFirst: boolean }) {
  if (!actions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a, i) => {
        const cls = cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol-500",
          i === 0 && highlightFirst ? "border-petrol-500 bg-petrol-50 text-link hover:bg-petrol-100 dark:bg-petrol-900/40 dark:hover:bg-petrol-900/60" : "border-line bg-surface text-ink hover:border-petrol-400 hover:bg-surface-2",
        );
        return a.kind === "ask" ? (
          <button key={a.label} type="button" disabled={disabled} onClick={() => onAsk(a.prompt!)} className={cls}>
            <Sparkles className="size-3.5" /> {a.label}
          </button>
        ) : (
          <Link key={a.label} href={a.href!} className={cls}>
            {a.label} <ArrowUpRight className="size-3.5" />
          </Link>
        );
      })}
    </div>
  );
}

export function Chat({
  action,
  mascotId,
  initial,
  conversationId: initialConversation,
  suggestions,
  prefill,
  autoSend = false,
  mode,
}: {
  action: FormAction;
  mascotId: MascotId;
  initial: ChatMessage[];
  conversationId: string | null;
  suggestions: string[];
  prefill?: string;
  /** Envia `prefill` ao abrir (perguntas vindas do painel). */
  autoSend?: boolean;
  mode: "llm" | "local";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [text, setText] = useState(autoSend ? "" : (prefill ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const router = useRouter();
  const mascot = getMascot(mascotId);

  useEffect(() => {
    if (messages.length || pending) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  }, [messages.length, pending]);

  const send = (message: string) => {
    const m = message.trim();
    if (m.length < 2 || pending) return;
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: "user", content: m, at: new Date().toISOString() }]);
    setText("");
    const fd = new FormData();
    fd.set("message", m);
    if (conversationId) fd.set("conversationId", conversationId);
    startTransition(async () => {
      const r = await action(initialActionState, fd);
      if (!r.ok || !r.data) {
        setError(r.error ?? "Não foi possível responder agora.");
        return;
      }
      const d = r.data as { conversationId: string; text: string; tone: Tone; mode: string; notice: string | null; actions?: ChatAction[]; at?: string };
      setError(null);
      setMessages((prev) => [...prev, { id: `a${r.at ?? Date.now()}`, role: "assistant", content: d.text, tone: d.tone, mode: d.mode, notice: d.notice, mascotId, actions: d.actions ?? [], at: d.at }]);
      if (!conversationId) {
        setConversationId(d.conversationId);
        router.replace(`/assistente?c=${d.conversationId}`, { scroll: false });
      }
    });
  };

  useEffect(() => {
    if (!autoSend || autoSent.current || !prefill) return;
    autoSent.current = true;
    send(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, prefill]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex min-h-[60vh] min-w-0 flex-col">
      <div className="flex-1 space-y-5 pb-4" aria-live="polite">
        {messages.length === 0 && !pending ? (
          <div className="flex flex-col items-center py-8 text-center">
            <MascotArt id={mascotId} state="guidance" size={120} animate />
            <p className="mt-3 text-lg font-semibold">Como posso ajudar hoje?</p>
            <p className="mt-1 max-w-md text-sm text-muted">Pergunte sobre gastos, metas, reserva, aposentadoria ou se uma compra cabe no seu planejamento. {mascot.name} responde com os seus números.</p>
            <Badge className="mt-3" tone={mode === "llm" ? "positive" : "info"}>
              {mode === "llm" ? "IA conectada (Claude) + motor de cálculo" : "Modo local: regras + motor de cálculo, sem modelo de linguagem"}
            </Badge>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex animate-rise flex-col items-end gap-1">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy-900 px-4 py-2.5 text-sm text-white shadow-sm dark:bg-petrol-500 dark:text-navy-950">{m.content}</div>
              <Time at={m.at} />
            </div>
          ) : (
            <div key={m.id} className="flex animate-rise items-start gap-3">
              <MascotArt id={m.mascotId ?? mascotId} state={toneToState(m.tone ?? "neutral")} size={44} decorative className="mt-1 hidden sm:inline-flex" />
              <div className="min-w-0 max-w-full flex-1 sm:max-w-[88%] sm:flex-none">
                <div className="mb-1 flex items-center gap-2">
                  <MascotArt id={m.mascotId ?? mascotId} state={toneToState(m.tone ?? "neutral")} size={28} decorative className="sm:hidden" />
                  <span className="text-xs font-semibold text-link">{getMascot(m.mascotId ?? mascotId).name}</span>
                  <Time at={m.at} />
                </div>
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
                  <RichText text={m.content} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.mode ? <Badge tone={m.mode === "llm" ? "positive" : "info"}>{m.mode === "llm" ? "IA + motor de cálculo" : "Modo local"}</Badge> : null}
                    {m.notice ? <Badge tone="warning">{m.notice}</Badge> : null}
                  </div>
                </div>
                <Actions actions={m.actions ?? []} onAsk={send} disabled={pending} highlightFirst={m.id === lastAssistant} />
              </div>
            </div>
          ),
        )}
        {pending ? (
          <div className="flex items-center gap-3 text-sm text-muted" role="status">
            <MascotArt id={mascotId} state="analysis" size={44} decorative animate />
            <span className="inline-flex items-center gap-1">
              Consultando seus dados
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="size-1 animate-pulse rounded-full bg-current" />
                <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
              </span>
            </span>
          </div>
        ) : null}
        {error ? <p className="text-sm text-negative">{error}</p> : null}
        {/* Margem para a rolagem automática não esconder a resposta atrás da caixa de texto fixa. */}
        <div ref={bottom} className="scroll-mb-56 lg:scroll-mb-40" />
      </div>
      <div className="sticky bottom-20 rounded-3xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] lg:bottom-4">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-petrol-400 hover:text-ink">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="chat-input" className="sr-only">
            Sua pergunta
          </label>
          <textarea
            id="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Ex.: Posso gastar R$ 600 hoje?"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-sm transition focus:border-petrol-400 focus:bg-surface focus:outline-none"
          />
          <button type="submit" disabled={pending || text.trim().length < 2} className={buttonClass("petrol", "md", "h-11")} aria-label="Enviar">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
