"use client";

import { useActionState, useRef } from "react";
import { initialActionState } from "@/lib/action-state";
import type { FormAction } from "@/components/ui/form";
import { cn } from "@/lib/cn";

/** Nosso lar: de quem é a despesa. Escolher já grava. */
export function QuickOwnership({ action, transactionId, value, partnerName, sharedAccount = false }: { action: FormAction; transactionId: string; value: string | null; partnerName: string; sharedAccount?: boolean }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const form = useRef<HTMLFormElement>(null);
  const first = partnerName.split(" ")[0] || "outra pessoa";
  const current = value ?? (sharedAccount ? "ours" : "mine");
  return (
    <form ref={form} action={formAction} className="inline">
      <input type="hidden" name="id" value={transactionId} />
      <select
        name="ownership"
        defaultValue={current}
        aria-label="De quem é"
        disabled={sharedAccount && !value}
        title={sharedAccount && !value ? "Conta conjunta: o que sai dela é nosso" : undefined}
        onChange={() => form.current?.requestSubmit()}
        className={cn("h-7 rounded-full border px-2 text-xs font-medium", current === "mine" ? "border-line bg-surface-2" : "border-accent bg-leaf-50 text-link dark:bg-forest-800")}
      >
        <option value="mine">Minha</option>
        <option value="ours">Nossa</option>
        <option value="theirs">De {first} (paguei)</option>
      </select>
      {state.error ? <span className="ml-2 text-xs text-negative">{state.error}</span> : null}
    </form>
  );
}
