import { Check, CircleExclamationPoint } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";

/** Mensagem de resultado de um formulário (sucesso ou erro), anunciada a leitores de tela. */
export function Notice({ state, className }: { state: ActionState; className?: string }) {
  if (!state.message) return null;
  const Icon = state.ok ? Check : CircleExclamationPoint;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        state.ok ? "border-personal/40 bg-personal/10 text-personal" : "border-danger/40 bg-danger/10 text-danger",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{state.message}</span>
    </p>
  );
}
