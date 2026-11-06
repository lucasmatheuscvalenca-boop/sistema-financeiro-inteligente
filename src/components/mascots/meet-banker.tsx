"use client";

import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BANKER, MASCOT_STATES, MASCOT_STATE_LABEL, type MascotState } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { Silk } from "@/components/app/silk";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/form";
import { MascotArt } from "./mascot-art";

/**
 * Apresentação do Banqueiro: expressões para experimentar, quem ele é e como fala. No primeiro
 * acesso vem com o botão que confirma o consultor; em Configurações é só a apresentação.
 */
export function MeetBanker({ action, userName, confirmLabel = "Começar com O Banqueiro" }: { action?: FormAction; userName: string; confirmLabel?: string }) {
  const [state, setState] = useState<MascotState>("guidance");
  const voice = voiceFor();
  const body = (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
      <div className="relative overflow-hidden rounded-lg bg-hero px-4 pb-4 pt-6 text-hero-ink">
        <Silk />
        <div className="relative flex justify-center" aria-live="polite">
          <MascotArt state={state} size={200} animate />
        </div>
        <p className="relative mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">Expressões</p>
        <div className="relative mt-2 flex flex-wrap gap-1.5">
          {MASCOT_STATES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setState(st)}
              aria-pressed={state === st}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition", state === st ? "border-gold-300 bg-white/10 font-semibold text-white" : "border-white/20 text-white/70 hover:text-white")}
            >
              {MASCOT_STATE_LABEL[st]}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-link">Seu consultor</p>
        <h2 className="mt-1 text-[32px]">{BANKER.name}</h2>
        <p className="font-medium text-muted">{BANKER.title}</p>
        <p className="mt-1 text-xs text-muted">{BANKER.personality.join(" · ")}</p>
        <p className="mt-4 text-[15px] leading-relaxed">{BANKER.shortDescription}</p>
        <p className="mt-3 border-l-2 border-gold-400 pl-3 italic text-muted">“{BANKER.catchphrase}”</p>
        <p className="mt-3 text-sm text-muted">Foco: {BANKER.communicationFocus}.</p>
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Como ele fala com você</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Bubble caption="Boas-vindas" state="guidance">
              {voice.welcome(userName)}
            </Bubble>
            <Bubble caption="Quando há um ponto de atenção" state="attention">
              {voice.opening("caution")} {voice.closing("caution")}
            </Bubble>
          </div>
          <p className="mt-3 text-xs text-muted">Os cálculos e as conclusões vêm do motor financeiro. O Banqueiro só explica, no tom certo para cada momento.</p>
        </div>
        {action ? (
          <div className="mt-6 flex justify-end">
            <SubmitButton size="lg" variant="petrol" pendingLabel="Salvando…">
              {confirmLabel} <ArrowRight className="size-4" />
            </SubmitButton>
          </div>
        ) : null}
      </div>
    </div>
  );
  if (!action) return body;
  return (
    <ActionForm action={action}>
      <input type="hidden" name="mascotId" value="banqueiro" />
      {body}
    </ActionForm>
  );
}

/** Fala de exemplo do Banqueiro, como no chat do assistente. */
function Bubble({ caption, state, children }: { caption: string; state: MascotState; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <MascotArt state={state} size={40} decorative className="mt-4" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted">{caption}</p>
        <div className="mt-1 rounded-lg rounded-tl-sm border border-line bg-surface p-3.5 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
