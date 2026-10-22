import { formatMoney } from "@/domain/money";

/** Eixo com valores compactos: R$ 0 / R$ 2 mil / R$ 1,2 mi. */
export function compactMoney(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  // Espaços não separáveis: o rótulo do eixo nunca quebra em duas linhas.
  if (abs >= 1_000_000) return `${sign}R$\u00a0${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}\u00a0mi`;
  if (abs >= 1_000) return `${sign}R$\u00a0${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}\u00a0mil`;
  return `${sign}R$\u00a0${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export const money = (cents: number) => formatMoney(cents);

export const CHART = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  grid: "var(--chart-grid)",
  axis: "var(--muted)",
  surface: "var(--surface)",
  negative: "var(--negative)",
};
