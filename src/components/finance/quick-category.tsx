"use client";

import { useActionState, useEffect, useRef } from "react";
import { initialActionState } from "@/lib/action-state";
import { useToast } from "@/components/ui/toast";
import type { FormAction } from "@/components/ui/form";
import type { CategoryOption } from "./types";

/** Seletor de categoria dentro da lista: escolher já grava, sem abrir o lançamento. */
export function QuickCategory({ action, transactionId, kind, categories, value, placeholder = "Qual categoria?" }: { action: FormAction; transactionId: string; kind: "income" | "expense"; categories: CategoryOption[]; value: string | null; placeholder?: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.at && state.ok && state.message) toast({ title: state.message, tone: "positive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return (
    <form ref={form} action={formAction} className="inline">
      <input type="hidden" name="id" value={transactionId} />
      <select
        name="categoryId"
        defaultValue={value ?? ""}
        aria-label="Categoria"
        onChange={() => form.current?.requestSubmit()}
        className={value ? "h-7 max-w-44 rounded-full border border-line bg-surface-2 px-2 text-xs font-medium" : "h-7 max-w-44 rounded-full border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"}
      >
        <option value="">{placeholder}</option>
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
      </select>
      {state.error ? <span className="ml-2 text-xs text-negative">{state.error}</span> : null}
    </form>
  );
}
