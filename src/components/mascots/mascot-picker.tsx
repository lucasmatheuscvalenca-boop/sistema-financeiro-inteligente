"use client";

import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MASCOT_LIST, MASCOT_STATES, MASCOT_STATE_LABEL, type MascotId, type MascotState } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/form";
import { MascotArt } from "./mascot-art";

/**
 * Seleção explícita de mascote: nenhum personagem vem pré-selecionado. O usuário pode
 * experimentar cada um (estados e exemplo de mensagem) antes de confirmar.
 */
export function MascotPicker({
  action,
  current,
  userName,
  confirmLabel = "Confirmar escolha",
  origin,
  withTabBar = false,
}: {
  action: FormAction;
  current?: MascotId | null;
  userName: string;
  confirmLabel?: string;
  origin?: string;
  /** Dentro do app, no celular, a barra de confirmação fica acima da navegação inferior. */
  withTabBar?: boolean;
}) {
  // Na troca, o mascote atual já vem marcado; no primeiro acesso nenhum é escolhido por você.
  const [selected, setSelected] = useState<MascotId | null>(current ?? null);
  const [previewState, setPreviewState] = useState<MascotState>("neutral");
  const chosen = selected ? MASCOT_LIST.find((m) => m.id === selected)! : null;
  const changed = selected !== null && selected !== current;
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
                {/* Indicador de seleção dentro do cartão: vazio ou marcado. */}
                <span aria-hidden className={cn("absolute right-2 top-2 grid size-6 place-items-center rounded-full border-2 transition", active ? "animate-pop border-petrol-600 bg-petrol-600 text-white" : "border-line bg-surface group-hover:border-petrol-300")}>
                  {active ? <Check className="size-4" /> : null}
                </span>
                {current === m.id ? <span className="absolute left-2 top-2 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-800 dark:bg-gold-500/20 dark:text-gold-200">Atual</span> : null}
                <MascotArt id={m.id} size={112} state={active ? "celebration" : "neutral"} decorative />
                <span className="mt-2 font-semibold">{m.name}</span>
                <span className="text-xs text-muted">{m.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-line bg-surface-2/60 p-4 sm:p-6" aria-live="polite">
        {chosen ? (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_minmax(0,1fr)] md:items-center md:gap-8">
              <div className="flex flex-col items-center rounded-2xl bg-hero px-4 pb-4 pt-5">
                <MascotArt id={chosen.id} size={168} state={previewState} />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Expressões</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {MASCOT_STATES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPreviewState(st)}
                      aria-pressed={previewState === st}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition",
                        previewState === st ? "border-petrol-500 bg-surface font-semibold text-petrol-800 dark:text-petrol-100" : "border-line bg-surface/60 text-muted hover:text-ink",
                      )}
                    >
                      {MASCOT_STATE_LABEL[st]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold">{chosen.name}</p>
                <p className="font-medium text-link">{chosen.title}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {chosen.personality.map((trait) => (
                    <span key={trait} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted ring-1 ring-line">
                      {trait}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-[15px] leading-relaxed">{chosen.shortDescription}</p>
                <p className="mt-3 border-l-2 border-gold-400 pl-3 italic text-muted">“{chosen.catchphrase}”</p>
                <p className="mt-3 text-xs text-muted">Foco: {chosen.communicationFocus}.</p>
              </div>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Prévia de como {chosen.article === "a" ? "ela" : "ele"} fala com você</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Bubble id={chosen.id} caption="Boas-vindas">
                  {voiceFor(chosen.id).welcome(userName)}
                </Bubble>
                <Bubble id={chosen.id} caption="Quando há um ponto de atenção">
                  {voiceFor(chosen.id).opening("caution")}
                </Bubble>
              </div>
              <p className="mt-3 text-xs text-muted">Os cálculos e as conclusões são os mesmos para todos os personagens — só muda o jeito de explicar.</p>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Toque em um personagem para experimentar. Nenhum é escolhido automaticamente.</p>
        )}
      </div>

      {/* Depois da escolha, no celular e no tablet, a confirmação acompanha a rolagem numa barra própria. */}
      <div
        className={cn(
          "flex items-center justify-end gap-3",
          changed &&
            "sticky z-20 rounded-2xl border border-line bg-surface p-2 pl-3 shadow-[var(--shadow-pop)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          changed && (withTabBar ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]"),
        )}
      >
        {chosen && changed ? (
          <span className="mr-auto flex min-w-0 items-center gap-2 text-sm lg:hidden">
            <MascotArt id={chosen.id} size={36} decorative />
            <span className="truncate">
              <span className="font-semibold">{chosen.name}</span> {chosen.article === "a" ? "selecionada" : "selecionado"}
            </span>
          </span>
        ) : null}
        <SubmitButton size="lg" variant="petrol" className="shrink-0" disabled={!changed} pendingLabel="Salvando…">
          {chosen && !changed ? (
            `${chosen.name} já é ${chosen.article === "a" ? "sua companheira" : "seu companheiro"}`
          ) : chosen ? (
            <>
              {/* No celular o texto visível é curto; o nome acessível continua completo. */}
              <span aria-hidden className="lg:hidden">
                Confirmar
              </span>
              <span className="sr-only lg:not-sr-only">
                {confirmLabel}: {chosen.name}
              </span>
            </>
          ) : (
            "Escolha um personagem"
          )}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Fala de exemplo do mascote, como no chat do assistente. */
function Bubble({ id, caption, children }: { id: MascotId; caption: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <MascotArt id={id} size={40} decorative className="mt-4" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted">{caption}</p>
        <div className="mt-1 rounded-2xl rounded-tl-sm bg-surface p-3.5 text-sm leading-relaxed shadow-sm">{children}</div>
      </div>
    </div>
  );
}
