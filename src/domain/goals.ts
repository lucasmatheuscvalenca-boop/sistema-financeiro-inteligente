import Decimal from "decimal.js";
import { addDays, addMonthsToKey, dateWithClampedDay, diffDays, endOfMonth, monthDiff, monthKey, parts, type ISODate, type MonthKey } from "./dates";
import { DecimalMath, assertCents, formatMoney, percentOf, type Cents } from "./money";

/** Taxa mensal equivalente a uma taxa anual efetiva: (1 + a)^(1/12) - 1. */
export function monthlyRateFromAnnual(annualRate: Decimal.Value): Decimal {
  const a = new DecimalMath(annualRate);
  if (a.lte(-1)) throw new Error("Taxa anual inválida");
  return a.plus(1).pow(new DecimalMath(1).div(12)).minus(1);
}

/** Datas mensais de aporte (dia fixo, ajustado ao fim do mês) dentro de [from, to]. */
export function contributionDates(from: ISODate, to: ISODate, contributionDay: number): ISODate[] {
  if (to < from) return [];
  const result: ISODate[] = [];
  const f = parts(from);
  for (let k = 0; k < 1200; k++) {
    const d = dateWithClampedDay(f.year, f.month + k, contributionDay);
    if (d > to) break;
    if (d >= from) result.push(d);
  }
  return result;
}

export type RequiredContributionStatus =
  | "completed"
  | "no_deadline"
  | "overdue"
  | "insufficient_periods"
  | "ok"
  | "covered_by_projected_yield";

export interface RequiredContributionResult {
  status: RequiredContributionStatus;
  remainingCents: Cents;
  periods: number;
  perPeriodCents: Cents | null;
  firstContributionDate: ISODate | null;
  lastContributionDate: ISODate | null;
  /** Rendimento projetado incluído no cálculo (hipotético, nunca garantido). */
  projectedYieldCents: Cents;
  explanation: string;
}

/**
 * Aporte necessário por período.
 * Sem rendimento: (alvo - acumulado) / períodos restantes, arredondado para cima.
 * Com rendimento i ao mês, avaliando na data do último aporte:
 *   alvo = acumulado·(1+i)^m + PMT·((1+i)^n - 1)/i
 * onde n = número de aportes e m = meses entre hoje e o último aporte.
 */
export function requiredContribution(input: {
  targetCents: Cents;
  currentCents: Cents;
  today: ISODate;
  targetDate?: ISODate | null;
  contributionDay: number;
  annualReturnRate?: number | null;
}): RequiredContributionResult {
  assertCents(input.targetCents, "valor-alvo");
  assertCents(input.currentCents, "valor acumulado");
  const remaining = input.targetCents - input.currentCents;
  const base = {
    remainingCents: Math.max(0, remaining),
    projectedYieldCents: 0,
    firstContributionDate: null,
    lastContributionDate: null,
  };
  if (remaining <= 0) {
    return { ...base, status: "completed", periods: 0, perPeriodCents: 0, explanation: "A meta já atingiu o valor-alvo." };
  }
  if (!input.targetDate) {
    return {
      ...base,
      status: "no_deadline",
      periods: 0,
      perPeriodCents: null,
      explanation: "Sem data desejada não é possível calcular um aporte mensal. Defina um prazo ou um valor de aporte.",
    };
  }
  if (input.targetDate < input.today) {
    return {
      ...base,
      status: "overdue",
      periods: 0,
      perPeriodCents: null,
      explanation: "O prazo desta meta já passou. Defina uma nova data ou ajuste o valor-alvo.",
    };
  }
  const dates = contributionDates(input.today, input.targetDate, input.contributionDay);
  const n = dates.length;
  if (n === 0) {
    return {
      ...base,
      status: "insufficient_periods",
      periods: 0,
      perPeriodCents: null,
      explanation: "Não há nenhuma data de aporte antes do prazo. Seria preciso um aporte extraordinário ou um prazo maior.",
    };
  }
  const first = dates[0]!;
  const last = dates[n - 1]!;
  const rate = input.annualReturnRate ?? 0;
  if (!rate) {
    const per = new DecimalMath(remaining).div(n).toDecimalPlaces(0, Decimal.ROUND_UP).toNumber();
    return {
      ...base,
      status: "ok",
      periods: n,
      perPeriodCents: per,
      firstContributionDate: first,
      lastContributionDate: last,
      explanation: `Faltam ${formatMoney(remaining)} divididos em ${n} aporte(s) mensal(is), sem considerar rendimento.`,
    };
  }
  const i = monthlyRateFromAnnual(rate);
  const m = new DecimalMath(diffDays(input.today, last)).div(30.4375);
  const fvCurrent = new DecimalMath(input.currentCents).mul(i.plus(1).pow(m));
  const target = new DecimalMath(input.targetCents);
  if (fvCurrent.gte(target)) {
    return {
      ...base,
      status: "covered_by_projected_yield",
      periods: n,
      perPeriodCents: 0,
      firstContributionDate: first,
      lastContributionDate: last,
      projectedYieldCents: target.minus(input.currentCents).toDecimalPlaces(0).toNumber(),
      explanation: "Pelo rendimento hipotético informado, o valor acumulado chegaria ao alvo sem novos aportes. Rendimento não é garantido.",
    };
  }
  const annuityFactor = i.isZero() ? new DecimalMath(n) : i.plus(1).pow(n).minus(1).div(i);
  const pmt = target.minus(fvCurrent).div(annuityFactor).toDecimalPlaces(0, Decimal.ROUND_UP);
  const projectedYield = target.minus(input.currentCents).minus(pmt.mul(n));
  return {
    ...base,
    status: "ok",
    periods: n,
    perPeriodCents: pmt.toNumber(),
    firstContributionDate: first,
    lastContributionDate: last,
    projectedYieldCents: Math.max(0, projectedYield.toDecimalPlaces(0).toNumber()),
    explanation: `Considera ${n} aporte(s) mensal(is) e rendimento hipotético de ${(rate * 100).toFixed(2)}% ao ano (não garantido).`,
  };
}

export interface GoalSimulationInput {
  targetCents: Cents;
  currentCents: Cents;
  startDate: ISODate;
  monthlyContributionCents: Cents;
  contributionDay: number;
  annualReturnRate?: number | null;
  /** Aporte extraordinário aplicado na data inicial. */
  extraContributionCents?: Cents;
  /** Quantidade de aportes mensais pulados a partir do próximo (interrupção temporária). */
  pauseMonths?: number;
  targetDate?: ISODate | null;
  maxMonths?: number;
}

export interface GoalSimulationPoint {
  date: ISODate;
  balanceCents: Cents;
  contributedCents: Cents;
  yieldCents: Cents;
}

export interface GoalSimulationResult {
  reached: boolean;
  completionDate: ISODate | null;
  monthsToComplete: number | null;
  totalContributedCents: Cents;
  /** Rendimento projetado (hipotético). */
  totalYieldCents: Cents;
  finalBalanceCents: Cents;
  onTime: boolean | null;
  monthsLate: number | null;
  series: GoalSimulationPoint[];
}

/** Simulação mês a mês de uma meta. Rendimento mensal arredondado para centavos a cada mês. */
export function simulateGoal(input: GoalSimulationInput): GoalSimulationResult {
  const maxMonths = Math.min(input.maxMonths ?? 600, 1200);
  const i = input.annualReturnRate ? monthlyRateFromAnnual(input.annualReturnRate) : new DecimalMath(0);
  const pause = Math.max(0, Math.floor(input.pauseMonths ?? 0));
  let balance = input.currentCents + (input.extraContributionCents ?? 0);
  let contributed = input.extraContributionCents ?? 0;
  let yieldTotal = 0;
  const series: GoalSimulationPoint[] = [
    { date: input.startDate, balanceCents: balance, contributedCents: contributed, yieldCents: 0 },
  ];
  const finish = (completionDate: ISODate | null, months: number | null): GoalSimulationResult => {
    let onTime: boolean | null = null;
    let monthsLate: number | null = null;
    if (input.targetDate) {
      if (completionDate) {
        onTime = completionDate <= input.targetDate;
        monthsLate = onTime ? 0 : Math.max(1, monthDiff(input.targetDate, completionDate));
      } else {
        onTime = false;
      }
    }
    return {
      reached: completionDate !== null,
      completionDate,
      monthsToComplete: months,
      totalContributedCents: contributed,
      totalYieldCents: yieldTotal,
      finalBalanceCents: balance,
      onTime,
      monthsLate,
      series,
    };
  };
  if (balance >= input.targetCents) return finish(input.startDate, 0);
  if (input.monthlyContributionCents <= 0 && (i.isZero() || balance <= 0)) return finish(null, null);

  const dates = contributionDates(input.startDate, addDays(input.startDate, Math.ceil(maxMonths * 31)), input.contributionDay).slice(
    0,
    maxMonths,
  );
  for (let k = 0; k < dates.length; k++) {
    const date = dates[k]!;
    if (k > 0 && !i.isZero()) {
      const y = new DecimalMath(balance).mul(i).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
      balance += y;
      yieldTotal += y;
    }
    if (k >= pause) {
      balance += input.monthlyContributionCents;
      contributed += input.monthlyContributionCents;
    }
    series.push({ date, balanceCents: balance, contributedCents: contributed, yieldCents: yieldTotal });
    if (balance >= input.targetCents) return finish(date, k + 1);
  }
  return finish(null, null);
}

export interface ContributionRecord {
  date: ISODate;
  /** Positivo = aporte, negativo = resgate. */
  amountCents: Cents;
  kind: "deposit" | "withdrawal" | "yield";
}

export function goalBalances(contributions: readonly ContributionRecord[]): {
  contributedCents: Cents;
  withdrawnCents: Cents;
  yieldCents: Cents;
  balanceCents: Cents;
} {
  let contributed = 0;
  let withdrawn = 0;
  let yields = 0;
  for (const c of contributions) {
    if (c.kind === "deposit") contributed += c.amountCents;
    else if (c.kind === "withdrawal") withdrawn += Math.abs(c.amountCents);
    else yields += c.amountCents;
  }
  return { contributedCents: contributed, withdrawnCents: withdrawn, yieldCents: yields, balanceCents: contributed - withdrawn + yields };
}

export interface GoalEvolutionPoint {
  month: MonthKey;
  /** Saldo acumulado ao fim do mês (até hoje no mês corrente). Nulo nos meses futuros. */
  actualCents: Cents | null;
  /** Saldo projetado ao fim do mês, do mês corrente até a conclusão. Nulo nos meses passados. */
  projectedCents: Cents | null;
}

/**
 * Evolução de uma meta para o gráfico: saldo real mês a mês (a partir do primeiro registro,
 * limitado a `historyMonths`) seguido da projeção mensal até a conclusão. Projeções longas são
 * amostradas para no máximo `maxProjectionPoints` pontos, sempre mantendo o mês de conclusão.
 */
export function goalEvolution(input: {
  contributions: readonly ContributionRecord[];
  today: ISODate;
  projection: readonly GoalSimulationPoint[] | null;
  historyMonths?: number;
  maxProjectionPoints?: number;
}): GoalEvolutionPoint[] {
  const current = monthKey(input.today);
  const historyMonths = Math.max(1, input.historyMonths ?? 12);
  const past = input.contributions.filter((c) => c.date <= input.today);
  const first = past.reduce<ISODate | null>((min, c) => (min === null || c.date < min ? c.date : min), null);
  let start = addMonthsToKey(current, -(historyMonths - 1));
  if (first && monthKey(first) > start) start = monthKey(first);
  if (!first) start = current;

  const points: GoalEvolutionPoint[] = [];
  for (let m = start; m <= current; m = addMonthsToKey(m, 1)) {
    const cutoff = m === current ? input.today : endOfMonth(m);
    points.push({ month: m, actualCents: goalBalances(past.filter((c) => c.date <= cutoff)).balanceCents, projectedCents: null });
  }

  if (input.projection && input.projection.length > 1) {
    // Último saldo projetado de cada mês.
    const byMonth = new Map<MonthKey, Cents>();
    for (const p of input.projection) byMonth.set(monthKey(p.date), p.balanceCents);
    const today = points[points.length - 1]!;
    today.projectedCents = byMonth.get(current) ?? today.actualCents;
    const future = [...byMonth.entries()].filter(([m]) => m > current).sort(([a], [b]) => a.localeCompare(b));
    const max = Math.max(2, input.maxProjectionPoints ?? 24);
    const step = Math.ceil(future.length / max);
    future.forEach(([month, cents], idx) => {
      if (idx % step === step - 1 || idx === future.length - 1) points.push({ month, actualCents: null, projectedCents: cents });
    });
  }
  return points;
}

/** Média mensal de aportes líquidos nos últimos N meses (janela de N*30 dias até hoje). */
export function averageMonthlyContribution(contributions: readonly ContributionRecord[], today: ISODate, months = 3): Cents {
  const from = addDays(today, -months * 30);
  let total = 0;
  for (const c of contributions) {
    if (c.kind === "yield") continue;
    if (c.date > from && c.date <= today) total += c.kind === "deposit" ? c.amountCents : -Math.abs(c.amountCents);
  }
  return Math.max(0, Math.round(total / months));
}

export type GoalHealth =
  | "completed"
  | "paused"
  | "overdue"
  | "insufficient_periods"
  | "on_track"
  | "at_risk"
  | "not_started"
  | "no_deadline";

export interface GoalDiagnosisInput {
  targetCents: Cents;
  currentCents: Cents;
  targetDate?: ISODate | null;
  annualReturnRate?: number | null;
  contributionDay: number;
  plannedMonthlyCents?: Cents | null;
  paused?: boolean;
  contributions: readonly ContributionRecord[];
  today: ISODate;
}

export interface GoalDiagnosis {
  health: GoalHealth;
  progressPct: number;
  remainingCents: Cents;
  required: RequiredContributionResult;
  /** Aporte usado na projeção: planejado ou média dos últimos 3 meses. */
  basisMonthlyCents: Cents;
  basis: "planned" | "average" | "none";
  projection: GoalSimulationResult | null;
  contributedThisMonthCents: Cents;
}

export function diagnoseGoal(input: GoalDiagnosisInput): GoalDiagnosis {
  const required = requiredContribution(input);
  const progressPct = Math.min(100, percentOf(input.currentCents, input.targetCents));
  const remaining = Math.max(0, input.targetCents - input.currentCents);
  const avg = averageMonthlyContribution(input.contributions, input.today);
  const planned = input.plannedMonthlyCents ?? null;
  const basisMonthly = planned && planned > 0 ? planned : avg;
  const basis: GoalDiagnosis["basis"] = planned && planned > 0 ? "planned" : avg > 0 ? "average" : "none";
  const thisMonth = input.today.slice(0, 7);
  const contributedThisMonth = input.contributions
    .filter((c) => c.kind !== "yield" && c.date.slice(0, 7) === thisMonth)
    .reduce((s, c) => s + (c.kind === "deposit" ? c.amountCents : -Math.abs(c.amountCents)), 0);

  const projection =
    remaining > 0 && basisMonthly > 0
      ? simulateGoal({
          targetCents: input.targetCents,
          currentCents: input.currentCents,
          startDate: input.today,
          monthlyContributionCents: basisMonthly,
          contributionDay: input.contributionDay,
          annualReturnRate: input.annualReturnRate,
          targetDate: input.targetDate,
        })
      : null;

  let health: GoalHealth;
  if (remaining <= 0) health = "completed";
  else if (input.paused) health = "paused";
  else if (required.status === "overdue") health = "overdue";
  else if (required.status === "insufficient_periods") health = "insufficient_periods";
  else if (basis === "none" && input.currentCents <= 0) health = "not_started";
  else if (!input.targetDate) health = "no_deadline";
  else if (projection?.onTime) health = "on_track";
  else health = "at_risk";

  return {
    health,
    progressPct,
    remainingCents: remaining,
    required,
    basisMonthlyCents: basisMonthly,
    basis,
    projection,
    contributedThisMonthCents: contributedThisMonth,
  };
}

/**
 * Quantos meses uma meta atrasa se o saldo dela ficar `reductionCents` menor
 * (ex.: um aporte deste mês deixa de ser feito para cobrir uma despesa).
 */
export function delayFromReduction(input: {
  targetCents: Cents;
  currentCents: Cents;
  monthlyContributionCents: Cents;
  contributionDay: number;
  annualReturnRate?: number | null;
  today: ISODate;
  reductionCents: Cents;
}): { baseMonths: number | null; newMonths: number | null; delayMonths: number | null } {
  const common = {
    targetCents: input.targetCents,
    startDate: input.today,
    monthlyContributionCents: input.monthlyContributionCents,
    contributionDay: input.contributionDay,
    annualReturnRate: input.annualReturnRate,
  };
  const base = simulateGoal({ ...common, currentCents: input.currentCents });
  const reduced = simulateGoal({ ...common, currentCents: input.currentCents - input.reductionCents });
  const delay =
    base.monthsToComplete !== null && reduced.monthsToComplete !== null ? reduced.monthsToComplete - base.monthsToComplete : null;
  return { baseMonths: base.monthsToComplete, newMonths: reduced.monthsToComplete, delayMonths: delay };
}
