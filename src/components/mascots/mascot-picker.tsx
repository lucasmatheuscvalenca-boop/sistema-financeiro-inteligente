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
      <div role="radiogroup" aria-label="Escolha seu mascote" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {MASCOT_LIST.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${m.name}, ${m.title}`}
              data-testid={`mascote-${m.id}`}
              onClick={() => {
                setSelected(m.id);
                setPreviewState("guidance");
              }}
              className="group flex flex-col items-center gap-2.5 rounded-3xl text-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  "relative flex w-full flex-col items-center rounded-2xl border bg-surface px-2 pb-3 pt-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-card)] group-focus-visible:ring-2 group-focus-visible:ring-petrol-400",
                  active ? "border-petrol-500 shadow-[var(--shadow-card)] ring-1 ring-petrol-500" : "border-line",
                )}
              >
                {active ? (
                  <span className="absolute right-2 top-2 grid size-6 animate-pop place-items-center rounded-full bg-petrol-600 text-white">
                    <Check className="size-4" />
                  </span>
                ) : null}
                {current === m.id ? <span className="absolute left-2 top-2 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-800 dark:bg-gold-500/20 dark:text-gold-200">Atual</span> : null}
                <MascotArt id={m.id} size={112} state={active ? "celebration" : "neutral"} decorative />
                <span className="mt-2 font-semibold">{m.name}</span>
                <span className="text-xs text-muted">{m.title}</span>
              </span>
              <span aria-hidden className={cn("grid size-5 place-items-center rounded-full border-2 transition", active ? "border-petrol-500" : "border-line group-hover:border-petrol-300")}>
                <span className={cn("size-2.5 rounded-full bg-petrol-500 transition", active ? "scale-100" : "scale-0")} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-line bg-surface-2/60 p-5" aria-live="polite">
        {chosen ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
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
              <p className="text-lg font-semibold">
                {chosen.name} <span className="font-normal text-link">· {chosen.title}</span>
              </p>
              <p className="text-xs text-muted">{chosen.personality.join(" · ")}</p>
              <p className="mt-2 text-sm">{chosen.shortDescription}</p>
              <p className="mt-2 border-l-2 border-gold-400 pl-3 text-sm italic text-muted">“{chosen.catchphrase}”</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Prévia de como {chosen.article === "a" ? "ela" : "ele"} fala com você</p>
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

      {/* Depois da escolha, no celular, o botão acompanha a rolagem (acima da barra inferior). */}
      <div className={cn("flex justify-end", selected && "sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 lg:static")}>
        <SubmitButton size="lg" variant="petrol" className={cn(selected ? "shadow-[var(--shadow-pop)]" : "pointer-events-none opacity-50")} pendingLabel="Salvando…">
          {chosen ? `${confirmLabel}: ${chosen.name}` : "Escolha um personagem"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
