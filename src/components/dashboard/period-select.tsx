"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

/** Filtro de período do painel (mês). Atualiza a URL; os números são recalculados no servidor. */
export function PeriodSelect({ value, options }: { value: string; options: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex">
      <span className="sr-only">Período</span>
      <select
        value={value}
        onChange={(e) => router.push(`/painel?mes=${e.target.value}`)}
        className="h-10 appearance-none rounded-xl border border-line bg-surface pl-4 pr-10 text-sm font-medium shadow-[var(--shadow-card)] transition hover:border-navy-200 focus:border-petrol-400 focus:outline-none focus:ring-2 focus:ring-petrol-400/25 dark:hover:border-navy-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </label>
  );
}
