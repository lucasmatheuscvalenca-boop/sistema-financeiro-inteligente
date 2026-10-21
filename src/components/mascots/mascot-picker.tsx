"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { MASCOT_LIST, MASCOT_STATES, MASCOT_STATE_LABEL, type MascotId, type MascotState } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/form";
import { MascotArt } from "./mascot-art";

/**
 * Seleção explícita de mascote: nenhum personagem vem pré-selecionado. O usuário pode
 * experimentar cada um (estados e exemplo de mensagem) antes de confirmar.
 */
export function MascotPicker({ action, current, userName, confirmLabel = "Confirmar escolha", origin }: { action: FormAction; current?: MascotId | null; userName: string; confirmLabel?: string; origin?: string }) {
  const [selected, setSelected] = useState<MascotId | null>(null);
  const [previewState, setPreviewState] = useState<MascotState>("neutral");
  const chosen = selected ? MASCOT_LIST.find((m) => m.id === selected)! : null;
  return (
    <ActionForm action={action} className="space-y-6">
      {origin ? <input type="hidden" name="voltar" value={origin} /> : null}
      <input type="hidden" name="mascotId" value={selected ?? ""} />
      <div role="radiogroup" aria-label="Escolha seu mascote" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MASCOT_LIST.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`mascote-${m.id}`}
              onClick={() => {
                setSelected(m.id);
                setPreviewState("guidance");
              }}
              className={cn(
                "group relative flex flex-col rounded-3xl border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
                active ? "border-petrol-500 ring-2 ring-petrol-400/60" : "border-line",
              )}
            >
              {active ? (
                <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-petrol-600 text-white">
                  <Check className="size-4" />
                </span>
              ) : null}
              {current === m.id ? <span className="absolute left-3 top-3 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">Atual</span> : null}
              <div className="flex items-center gap-3">
                <MascotArt id={m.id} size={76} state={active ? "celebration" : "neutral"} decorative />
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-petrol-700 dark:text-petrol-300">{m.title}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">{m.personality.join(" · ")}</p>
              <p className="mt-2 text-sm">{m.shortDescription}</p>
              <p className="mt-3 border-l-2 border-gold-400 pl-3 text-sm italic text-muted">“{m.catchphrase}”</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-line bg-surface-2/60 p-5" aria-live="polite">
        {chosen ? (
          <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex flex-col items-center">
              <MascotArt id={chosen.id} size={140} state={previewState} />
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {MASCOT_STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPreviewState(st)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs", previewState === st ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/50 dark:text-petrol-100" : "border-line text-muted")}
                  >
                    {MASCOT_STATE_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Prévia de como {chosen.article === "a" ? "ela" : "ele"} fala com você</p>
              <div className="mt-2 rounded-2xl rounded-tl-sm bg-surface p-4 text-sm shadow-sm">{voiceFor(chosen.id).welcome(userName)}</div>
              <div className="mt-2 rounded-2xl rounded-tl-sm bg-surface p-4 text-sm shadow-sm">
                {voiceFor(chosen.id).opening("caution")} <span className="text-muted">(exemplo de abertura quando há um ponto de atenção)</span>
              </div>
              <p className="mt-3 text-xs text-muted">Foco: {chosen.communicationFocus}. Os cálculos e conclusões são os mesmos para todos os personagens — só muda o jeito de explicar.</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">Toque em um personagem para experimentar. Nenhum é escolhido automaticamente.</p>
        )}
      </div>

      <div className="flex justify-end">
        <SubmitButton size="lg" variant="petrol" className={cn(!selected && "pointer-events-none opacity-50")} pendingLabel="Salvando…">
          {chosen ? `${confirmLabel}: ${chosen.name}` : "Escolha um personagem"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
