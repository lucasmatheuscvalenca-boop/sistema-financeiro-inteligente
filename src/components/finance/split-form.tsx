"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { parseMoney } from "@/domain/money";
import { formatMoney } from "@/lib/format";
import { initialActionState } from "@/lib/action-state";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { CategoryOption } from "./types";

function cents(v: string): number {
  try {
    return v.trim() ? parseMoney(v, "auto") : 0;
  } catch {
    return 0;
  }
}

/** Dividir um lançamento em partes com categorias diferentes; a soma precisa fechar no valor original. */
export function SplitForm({ action, transactionId, totalCents, kind, categories, currentCategoryId }: { action: FormAction; transactionId: string; totalCents: number; kind: "income" | "expense"; categories: CategoryOption[]; currentCategoryId: string | null }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [rows, setRows] = useState([{ amount: "", category: currentCategoryId ?? "" }, { amount: "", category: "" }]);
  const toast = useToast();
  useEffect(() => {
    if (state.ok && state.message) toast({ title: state.message, tone: "positive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  const used = rows.reduce((t, r) => t + cents(r.amount), 0);
  const left = totalCents - used;
  const field = "h-10 rounded-lg border border-field-line bg-field px-3 text-sm";
  const options = categories.filter((c) => c.kind === kind);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={transactionId} />
      <p className="text-sm text-muted">Total: {formatMoney(totalCents)}. A primeira parte fica neste lançamento; as outras viram lançamentos novos na mesma conta e data.</p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] items-center gap-2">
            <input aria-label={`Valor da parte ${i + 1}`} name="partAmount" inputMode="decimal" placeholder="0,00" value={r.amount} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className={`${field} tabular-nums`} />
            <select aria-label={`Categoria da parte ${i + 1}`} name="partCategory" value={r.category} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} className={field}>
              <option value="">Sem categoria</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {rows.length > 2 ? (
              <button type="button" aria-label={`Tirar a parte ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-2">
                <Trash2 className="size-4" />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {rows.length < 6 ? (
          <button type="button" onClick={() => setRows((rs) => [...rs, { amount: left > 0 ? (left / 100).toFixed(2).replace(".", ",") : "", category: "" }])} className={buttonClass("ghost", "sm")}>
            <Plus className="size-4" /> Mais uma parte
          </button>
        ) : (
          <span />
        )}
        <span className={left === 0 ? "text-positive" : "text-warning"} role="status">
          {left === 0 ? "Fechou o valor." : left > 0 ? `Faltam ${formatMoney(left)}` : `Passou ${formatMoney(-left)}`}
        </span>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-negative">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || left !== 0} className={buttonClass("petrol")}>
        {pending ? "Dividindo…" : "Dividir"}
      </button>
    </form>
  );
}
