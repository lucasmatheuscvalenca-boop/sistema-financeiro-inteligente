import Decimal from "decimal.js";
import { addMonths, type ISODate } from "./dates";
import { DecimalMath, percentOf, type Cents } from "./money";

export type EmploymentStatus =
  | "clt"
  | "public_servant"
  | "self_employed"
  | "business_owner"
  | "freelancer"
  | "unemployed"
  | "retired"
  | "student"
  | "other";

export type IncomeStability = "stable" | "variable" | "mixed";

/**
 * Sugestão de cobertura da reserva (em meses de despesas essenciais). É um ponto de
 * partida explicado, não uma regra: o usuário escolhe o valor final.
 */
export function recommendedReserveMonths(input: {
  employment?: EmploymentStatus | null;
  incomeStability?: IncomeStability | null;
  dependents?: number | null;
  hasDebts?: boolean | null;
}): { months: number; reasons: string[] } {
  const reasons: string[] = [];
  let months: number;
  switch (input.employment) {
    case "public_servant":
      months = 3;
      reasons.push("Servidor público costuma ter maior estabilidade de renda: base de 3 meses.");
      break;
    case "clt":
      months = 6;
      reasons.push("Emprego CLT: base de 6 meses de despesas essenciais.");
      break;
    case "retired":
      months = 6;
      reasons.push("Aposentadoria com renda recorrente: base de 6 meses.");
      break;
    case "self_employed":
    case "business_owner":
    case "freelancer":
      months = 12;
      reasons.push("Renda de trabalho autônomo ou empresarial oscila mais: base de 12 meses.");
      break;
    case "unemployed":
      months = 12;
      reasons.push("Sem renda ativa no momento: a reserva precisa cobrir um período maior.");
      break;
    default:
      months = 6;
      reasons.push("Sem informação detalhada sobre o trabalho: base de 6 meses.");
  }
  if (input.incomeStability === "variable" && months < 12) {
    months += 3;
    reasons.push("Renda variável: +3 meses.");
  } else if (input.incomeStability === "mixed" && months < 12) {
    months += 1;
    reasons.push("Parte da renda é variável: +1 mês.");
  }
  const deps = Math.max(0, Math.min(3, input.dependents ?? 0));
  if (deps > 0) {
    months += deps;
    reasons.push(`${deps} dependente(s) financeiro(s): +${deps} ${deps === 1 ? "mês" : "meses"}.`);
  }
  if (input.hasDebts) {
    months += 1;
    reasons.push("Dívidas com parcelas fixas: +1 mês.");
  }
  return { months: Math.min(months, 24), reasons };
}

export type ReserveStatus = "not_configured" | "empty" | "building" | "complete";

export interface ReserveScenario {
  monthlyContributionCents: Cents;
  monthsToComplete: number | null;
  completionDate: ISODate | null;
}

export interface ReserveEvaluation {
  status: ReserveStatus;
  currentCents: Cents;
  monthlyEssentialCents: Cents;
  targetMonths: number;
  targetCents: Cents;
  gapCents: Cents;
  progressPct: number;
  /** Quantos meses de despesas essenciais o valor atual cobre. */
  coverageMonths: number;
  recommendedContributionCents: Cents;
  monthsToComplete: number | null;
  completionDate: ISODate | null;
  scenarios: ReserveScenario[];
  belowMinimum: boolean;
}

function monthsFor(gap: Cents, monthly: Cents): number | null {
  if (gap <= 0) return 0;
  if (monthly <= 0) return null;
  return new DecimalMath(gap).div(monthly).toDecimalPlaces(0, Decimal.ROUND_UP).toNumber();
}

/**
 * Avalia a reserva. O valor atual deve incluir apenas dinheiro de liquidez imediata
 * separado para emergências (contas marcadas como reserva), nunca valores comprometidos.
 */
export function evaluateReserve(input: {
  currentCents: Cents;
  monthlyEssentialCents: Cents;
  targetMonths: number;
  today: ISODate;
  /** Capacidade mensal que o usuário pode destinar à reserva. */
  monthlyCapacityCents?: Cents;
  /** Prazo desejado para completar, em meses (padrão 12). */
  desiredMonthsToComplete?: number;
  /** Meses mínimos (abaixo disso, a reserva tem prioridade sobre metas de consumo). Padrão 3. */
  minimumMonths?: number;
}): ReserveEvaluation {
  const months = Math.max(0, input.targetMonths);
  const essential = Math.max(0, input.monthlyEssentialCents);
  const target = essential * months;
  const current = Math.max(0, input.currentCents);
  const gap = Math.max(0, target - current);
  const coverage = essential > 0 ? new DecimalMath(current).div(essential).toDecimalPlaces(1).toNumber() : 0;
  const desired = Math.max(1, input.desiredMonthsToComplete ?? 12);
  let recommended = gap > 0 ? new DecimalMath(gap).div(desired).toDecimalPlaces(0, Decimal.ROUND_UP).toNumber() : 0;
  if (input.monthlyCapacityCents !== undefined) recommended = Math.min(recommended, Math.max(0, input.monthlyCapacityCents));
  const toComplete = monthsFor(gap, recommended);
  const minimum = input.minimumMonths ?? 3;
  let status: ReserveStatus;
  if (essential <= 0 || months <= 0) status = "not_configured";
  else if (current <= 0) status = "empty";
  else if (gap > 0) status = "building";
  else status = "complete";

  const base = recommended > 0 ? recommended : Math.max(10_000, Math.round(essential * 0.1));
  const scenarioValues = [...new Set([Math.round(base * 0.5), base, Math.round(base * 1.5), base * 2].filter((v) => v > 0))];
  const scenarios = scenarioValues.map<ReserveScenario>((v) => {
    const m = monthsFor(gap, v);
    return { monthlyContributionCents: v, monthsToComplete: m, completionDate: m === null ? null : addMonths(input.today, m) };
  });

  return {
    status,
    currentCents: current,
    monthlyEssentialCents: essential,
    targetMonths: months,
    targetCents: target,
    gapCents: gap,
    progressPct: target > 0 ? Math.min(100, percentOf(current, target)) : 0,
    coverageMonths: coverage,
    recommendedContributionCents: recommended,
    monthsToComplete: toComplete,
    completionDate: toComplete === null ? null : addMonths(input.today, toComplete),
    scenarios,
    belowMinimum: essential > 0 && coverage < Math.min(minimum, months),
  };
}
