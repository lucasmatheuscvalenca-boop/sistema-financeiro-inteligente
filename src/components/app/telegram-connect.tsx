"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";

/** Gera o código de uso único e mostra o link para abrir a conversa com o bot. */
export function TelegramConnect({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const data = state.data as { code: string; deepLink: string | null } | undefined;
  return (
    <div className="space-y-3">
      <form action={formAction}>
        <button type="submit" disabled={pending} className={buttonClass("petrol")}>
          {pending ? "Gerando…" : data ? "Gerar outro código" : "Conectar meu Telegram"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-negative">
          {state.error}
        </p>
      ) : null}
      {data ? (
        <div role="status" className="rounded-lg bg-surface-2 p-4 text-sm">
          {data.deepLink ? (
            <p>
              <a href={data.deepLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline">
                Abrir o bot no Telegram
              </a>{" "}
              e toque em Começar. Ou envie para ele:
            </p>
          ) : (
            <p>Envie para o bot no Telegram:</p>
          )}
          <p className="mt-2 font-mono text-lg tracking-wider">/start {data.code}</p>
          <p className="mt-1 text-xs text-muted">O código vale 15 minutos e uma vez.</p>
        </div>
      ) : null}
    </div>
  );
}
