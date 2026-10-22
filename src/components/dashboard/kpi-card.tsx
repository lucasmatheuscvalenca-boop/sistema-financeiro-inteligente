import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  teal: "bg-petrol-50 text-petrol-700 dark:bg-petrol-900/40 dark:text-petrol-200",
} as const;

/**
 * Indicador com variação. `goodWhenUp=false` inverte a cor (despesas subindo é ruim).
 * Sem base comparável, mostra a explicação em vez de um percentual inventado.
 */
export function KpiCard({ label, cents, deltaPct, basis, icon, tone, goodWhenUp = true, hint }: { label: string; cents: number; deltaPct: number | null; basis: string; icon: ReactNode; tone: keyof typeof TONES; goodWhenUp?: boolean; hint?: ReactNode }) {
  const up = (deltaPct ?? 0) >= 0;
  const good = deltaPct === null ? null : up === goodWhenUp;
  return (
    <Card className="card-hover h-full p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl sm:size-10", TONES[tone])}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-0.5 text-lg font-bold tracking-tight sm:truncate sm:text-xl">
            <Money cents={cents} tone="none" />
          </p>
          {deltaPct === null ? (
            <p className="mt-1 text-xs text-muted">Sem base para comparar</p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted" title={basis}>
              <span className={cn("inline-flex items-center font-semibold", good ? "text-positive" : "text-negative")}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(deltaPct) >= 999 ? ">999" : Math.abs(deltaPct).toFixed(0)}%
              </span>
              <span className="truncate">vs. mês anterior</span>
              <span className="sr-only">({basis})</span>
            </p>
          )}
          {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
      </div>
    </Card>
  );
}
