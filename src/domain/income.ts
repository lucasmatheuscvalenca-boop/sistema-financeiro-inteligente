import type { Cents } from "./money";

/**
 * Renda declarada no briefing. Na renda mista, o fixo é garantido e a comissão é
 * estimativa: ela entra nas projeções, mas nunca como dinheiro disponível antes de cair.
 */
export type IncomeKind = "fixed" | "variable" | "mixed";

export interface IncomeDeclaration {
  kind: IncomeKind | null;
  /** Renda líquida mensal informada diretamente (renda fixa ou quando não há detalhamento). */
  netMonthlyCents?: Cents | null;
  /** Parte fixa líquida (salário) na renda mista. */
  fixedCents?: Cents | null;
  /** Média mensal da parte variável (comissões, freelas), líquida. */
  variableAvgCents?: Cents | null;
  /** Quanto costuma entrar num mês fraco e num mês forte. */
  variableLowCents?: Cents | null;
  variableHighCents?: Cents | null;
}

export interface IncomeSummary {
  kind: IncomeKind | null;
  /** Entra todo mês com segurança (salário). */
  guaranteedCents: Cents | null;
  /** Média esperada da parte variável. */
  estimatedCents: Cents | null;
  /** Renda mensal média (garantida + estimada). */
  totalCents: Cents | null;
  /** Cenário conservador: o que entra num mês fraco. */
  lowMonthCents: Cents | null;
  /** Fração da renda média que é variável (0 a 1). */
  variableShare: number | null;
}

export function summarizeIncome(i: IncomeDeclaration): IncomeSummary {
  const fixed = i.fixedCents ?? null;
  const avg = i.variableAvgCents ?? null;
  const low = i.variableLowCents ?? null;
  if (i.kind === "mixed" && (fixed != null || avg != null)) {
    const total = (fixed ?? 0) + (avg ?? 0);
    return {
      kind: "mixed",
      guaranteedCents: fixed,
      estimatedCents: avg,
      totalCents: total,
      // Sem o mês fraco informado, o conservador conta só com o fixo.
      lowMonthCents: fixed != null ? fixed + (low ?? 0) : null,
      variableShare: fixed != null && avg != null && total > 0 ? avg / total : null,
    };
  }
  if (i.kind === "variable" && avg != null) {
    return { kind: "variable", guaranteedCents: 0, estimatedCents: avg, totalCents: avg, lowMonthCents: low, variableShare: avg > 0 ? 1 : null };
  }
  const net = i.netMonthlyCents ?? null;
  const fixedKind = i.kind === "fixed";
  return {
    kind: i.kind,
    guaranteedCents: fixedKind ? net : null,
    estimatedCents: fixedKind ? 0 : null,
    totalCents: net,
    lowMonthCents: fixedKind ? net : null,
    variableShare: fixedKind && net != null ? 0 : null,
  };
}

/** Coerência da faixa da parte variável: mês fraco ≤ média ≤ mês forte. */
export function validateIncome(i: IncomeDeclaration): Record<string, string> {
  const errors: Record<string, string> = {};
  const { variableAvgCents: avg, variableLowCents: low, variableHighCents: high } = i;
  if (low != null && avg != null && low > avg) errors.commissionLow = "O mês fraco não pode ser maior que a média";
  if (high != null && avg != null && high < avg) errors.commissionHigh = "O mês forte não pode ser menor que a média";
  if (low != null && high != null && low > high) errors.commissionHigh = "O mês forte precisa ser maior que o mês fraco";
  return errors;
}
