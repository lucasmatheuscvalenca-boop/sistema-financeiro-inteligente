"use client";

import dynamic from "next/dynamic";

/**
 * Gráficos carregados sob demanda: o Recharts (a maior biblioteca do app) só é baixado nas telas
 * que mostram gráfico e depois que a tela já está pronta para uso. Enquanto carrega, um bloco do
 * mesmo tamanho segura o lugar para a página não pular.
 */

function placeholder(height: number, legend: boolean) {
  function ChartPlaceholder() {
    return (
      <div aria-hidden className="w-full">
        {legend ? <div className="mb-2 h-4 w-40 animate-pulse rounded bg-surface-2" /> : null}
        <div style={{ height }} className="w-full animate-pulse rounded-xl bg-surface-2" />
        <div className="mt-2 h-4" />
      </div>
    );
  }
  return ChartPlaceholder;
}

export const IncomeExpenseChart = dynamic(() => import("./charts").then((m) => m.IncomeExpenseChart), { ssr: false, loading: placeholder(220, true) });
export const CashFlowChart = dynamic(() => import("./charts").then((m) => m.CashFlowChart), { ssr: false, loading: placeholder(260, true) });
export const SingleLineChart = dynamic(() => import("./charts").then((m) => m.SingleLineChart), { ssr: false, loading: placeholder(220, false) });
export const ScenarioChart = dynamic(() => import("./charts").then((m) => m.ScenarioChart), { ssr: false, loading: placeholder(280, true) });
export const GoalEvolutionChart = dynamic(() => import("./charts").then((m) => m.GoalEvolutionChart), { ssr: false, loading: placeholder(240, true) });
