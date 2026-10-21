import Decimal from "decimal.js";
import { daysInMonth, parts, type ISODate, type MonthKey } from "./dates";
import { DecimalMath, percentOf, type Cents } from "./money";

export interface BudgetLineInput {
  categoryId: string;
  categoryName: string;
  limitCents: Cents;
  /** Percentual do limite que dispara alerta (padrão 80). */
  alertThresholdPct?: number;
}

export type BudgetStatus = "ok" | "warning" | "exceeded";

export interface BudgetLineResult {
  categoryId: string;
  categoryName: string;
  limitCents: Cents;
  spentCents: Cents;
  scheduledCents: Cents;
  committedCents: Cents;
  remainingCents: Cents;
  usedPct: number;
  status: BudgetStatus;
  /** Projeção de fechamento: ritmo diário atual aplicado aos dias restantes, nunca abaixo do comprometido. */
  projectedCents: Cents;
  projectedStatus: BudgetStatus;
  alertThresholdPct: number;
}

export interface BudgetEvaluation {
  month: MonthKey;
  lines: BudgetLineResult[];
  totals: {
    limitCents: Cents;
    spentCents: Cents;
    committedCents: Cents;
    remainingCents: Cents;
    projectedCents: Cents;
    usedPct: number;
  };
  /** Gastos em categorias sem orçamento definido. */
  unbudgetedSpentCents: Cents;
  elapsedFraction: number;
}

export function statusFor(amount: Cents, limit: Cents, thresholdPct: number): BudgetStatus {
  if (limit <= 0) return amount > 0 ? "exceeded" : "ok";
  if (amount > limit) return "exceeded";
  if (percentOf(amount, limit) >= thresholdPct) return "warning";
  return "ok";
}

/** Fração do mês já transcorrida numa data (0 antes do mês, 1 depois). */
export function elapsedFractionOfMonth(month: MonthKey, today: ISODate): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const todayMonth = today.slice(0, 7);
  if (todayMonth < month) return 0;
  if (todayMonth > month) return 1;
  return parts(today).day / daysInMonth(year, m);
}

export function evaluateBudget(input: {
  month: MonthKey;
  today: ISODate;
  lines: readonly BudgetLineInput[];
  spentByCategory: ReadonlyMap<string, Cents>;
  scheduledByCategory?: ReadonlyMap<string, Cents>;
}): BudgetEvaluation {
  const elapsed = elapsedFractionOfMonth(input.month, input.today);
  const budgeted = new Set(input.lines.map((l) => l.categoryId));
  const lines = input.lines.map<BudgetLineResult>((line) => {
    const threshold = line.alertThresholdPct ?? 80;
    const spent = input.spentByCategory.get(line.categoryId) ?? 0;
    const scheduled = input.scheduledByCategory?.get(line.categoryId) ?? 0;
    const committed = spent + scheduled;
    let projected = committed;
    if (elapsed > 0 && elapsed < 1) {
      const paced = new DecimalMath(spent).div(elapsed).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
      projected = Math.max(committed, paced);
    }
    return {
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      limitCents: line.limitCents,
      spentCents: spent,
      scheduledCents: scheduled,
      committedCents: committed,
      remainingCents: line.limitCents - committed,
      usedPct: percentOf(committed, line.limitCents),
      status: statusFor(committed, line.limitCents, threshold),
      projectedCents: projected,
      projectedStatus: statusFor(projected, line.limitCents, threshold),
      alertThresholdPct: threshold,
    };
  });
  let unbudgeted = 0;
  for (const [categoryId, spent] of input.spentByCategory) {
    if (!budgeted.has(categoryId)) unbudgeted += spent;
  }
  const totals = lines.reduce(
    (acc, l) => {
      acc.limitCents += l.limitCents;
      acc.spentCents += l.spentCents;
      acc.committedCents += l.committedCents;
      acc.projectedCents += l.projectedCents;
      return acc;
    },
    { limitCents: 0, spentCents: 0, committedCents: 0, projectedCents: 0 },
  );
  return {
    month: input.month,
    lines,
    totals: {
      ...totals,
      remainingCents: totals.limitCents - totals.committedCents,
      usedPct: percentOf(totals.committedCents, totals.limitCents),
    },
    unbudgetedSpentCents: unbudgeted,
    elapsedFraction: elapsed,
  };
}

export interface BudgetAdjustment {
  categoryId: string;
  newLimitCents: Cents;
}

/** Simula novos limites sem gravar nada. Mostra a variação da margem mensal planejada. */
export function simulateBudgetAdjustments(
  evaluation: BudgetEvaluation,
  adjustments: readonly BudgetAdjustment[],
  plannedIncomeCents: Cents,
): {
  before: { limitCents: Cents; marginCents: Cents };
  after: { limitCents: Cents; marginCents: Cents };
  lines: Array<{ categoryId: string; categoryName: string; oldLimitCents: Cents; newLimitCents: Cents; newStatus: BudgetStatus }>;
} {
  const byId = new Map(adjustments.map((a) => [a.categoryId, a.newLimitCents]));
  const lines = evaluation.lines.map((l) => {
    const newLimit = byId.get(l.categoryId) ?? l.limitCents;
    return {
      categoryId: l.categoryId,
      categoryName: l.categoryName,
      oldLimitCents: l.limitCents,
      newLimitCents: newLimit,
      newStatus: statusFor(l.projectedCents, newLimit, l.alertThresholdPct),
    };
  });
  const before = evaluation.totals.limitCents;
  const after = lines.reduce((s, l) => s + l.newLimitCents, 0);
  return {
    before: { limitCents: before, marginCents: plannedIncomeCents - before },
    after: { limitCents: after, marginCents: plannedIncomeCents - after },
    lines,
  };
}
