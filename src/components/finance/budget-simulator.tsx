"use client";

import { useMemo, useState } from "react";
import { simulateBudgetAdjustments, type BudgetEvaluation } from "@/domain/budget";
import { parseMoney } from "@/domain/money";
import { centsToInput, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

/** Simulação local de novos limites: nada é gravado até o usuário salvar cada limite. */
export function BudgetSimulator({ evaluation, plannedIncomeCents }: { evaluation: BudgetEvaluation; plannedIncomeCents: number }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(evaluation.lines.map((l) => [l.categoryId, centsToInput(l.limitCents)])));
  const sim = useMemo(() => {
    const adjustments = evaluation.lines.map((l) => {
      let v = l.limitCents;
      try {
        v = Math.max(0, parseMoney(values[l.categoryId] || "0"));
      } catch {}
      return { categoryId: l.categoryId, newLimitCents: v };
    });
    return simulateBudgetAdjustments(evaluation, adjustments, plannedIncomeCents);
  }, [values, evaluation, plannedIncomeCents]);
  const delta = sim.after.marginCents - sim.before.marginCents;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Renda mensal considerada</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(plannedIncomeCents)}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Margem com limites atuais</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(sim.before.marginCents)}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="text-muted">Margem simulada</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatMoney(sim.after.marginCents)}{" "}
            <span className={delta >= 0 ? "text-sm text-positive" : "text-sm text-negative"}>
              ({delta >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(delta))})
            </span>
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line text-sm">
        {sim.lines.map((l) => (
          <li key={l.categoryId} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-36 flex-1">{l.categoryName}</span>
            <span className="text-xs text-muted">atual {formatMoney(l.oldLimitCents)}</span>
            <label className="relative w-36">
              <span className="sr-only">Novo limite para {l.categoryName}</span>
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted">R$</span>
              <input
                value={values[l.categoryId] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [l.categoryId]: e.target.value }))}
                inputMode="decimal"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-sm tabular-nums"
              />
            </label>
            <Badge tone={l.newStatus === "exceeded" ? "negative" : l.newStatus === "warning" ? "warning" : "positive"}>
              {l.newStatus === "exceeded" ? "Projeção estoura" : l.newStatus === "warning" ? "Perto do limite" : "Cabe na projeção"}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Simulação: compara a projeção de fechamento de cada categoria com o novo limite. Para aplicar, salve o limite na tabela acima.</p>
    </div>
  );
}
