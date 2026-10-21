"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { MascotId } from "@/mascots/catalog";
import { toneToState, type Tone } from "@/mascots/voice";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";
import { RichText } from "./rich-text";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: Tone;
  mode?: string | null;
  notice?: string | null;
  mascotId?: MascotId | null;
}

export function Chat({ action, mascotId, initial, conversationId: initialConversation, suggestions, prefill, mode }: { action: FormAction; mascotId: MascotId; initial: ChatMessage[]; conversationId: string | null; suggestions: string[]; prefill?: string; mode: "llm" | "local" }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [text, setText] = useState(prefill ?? "");
  const [state, run] = useActionState<ActionState, FormData>(action, initialActionState);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state.at) return;
    if (state.ok && state.data) {
      const d = state.data as { conversationId: string; text: string; tone: Tone; mode: string; notice: string | null };
      setMessages((m) => [...m, { id: `a${state.at}`, role: "assistant", content: d.text, tone: d.tone, mode: d.mode, notice: d.notice, mascotId }]);
      if (!conversationId) {
        setConversationId(d.conversationId);
        router.replace(`/assistente?c=${d.conversationId}`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const send = (message: string) => {
    const m = message.trim();
    if (m.length < 2 || pending) return;
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: "user", content: m }]);
    setText("");
    const fd = new FormData();
    fd.set("message", m);
    if (conversationId) fd.set("conversationId", conversationId);
    startTransition(() => run(fd));
  };

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <MascotArt id={mascotId} state="guidance" size={110} />
            <p className="mt-3 max-w-md text-sm text-muted">Pergunte sobre seus gastos, metas, reserva, aposentadoria ou se uma compra cabe no seu planejamento.</p>
            <Badge className="mt-2" tone={mode === "llm" ? "positive" : "info"}>
              {mode === "llm" ? "IA conectada (Claude) + motor de cálculo" : "Modo local: regras + motor de cálculo, sem modelo de linguagem"}
            </Badge>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy-900 px-4 py-2.5 text-sm text-white dark:bg-petrol-400 dark:text-navy-950">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-3">
              <MascotArt id={m.mascotId ?? mascotId} state={toneToState(m.tone ?? "neutral")} size={40} decorative className="mt-1" />
              <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 shadow-sm">
                <RichText text={m.content} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.mode ? <Badge tone={m.mode === "llm" ? "positive" : "info"}>{m.mode === "llm" ? "IA + motor de cálculo" : "Modo local"}</Badge> : null}
                  {m.notice ? <Badge tone="warning">{m.notice}</Badge> : null}
                </div>
              </div>
            </div>
          ),
        )}
        {pending ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <MascotArt id={mascotId} state="analysis" size={40} decorative />
            Consultando seus dados…
          </div>
        ) : null}
        {state.error ? <p className="text-sm text-negative">{state.error}</p> : null}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-20 rounded-3xl border border-line bg-surface p-3 shadow-[var(--shadow-card)] lg:bottom-4">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink">
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
            placeholder="Ex.: Posso gastar R$ 600 neste fim de semana?"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm focus:border-petrol-400 focus:outline-none"
          />
          <button type="submit" disabled={pending || text.trim().length < 2} className={buttonClass("petrol", "md", "h-11")} aria-label="Enviar">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
