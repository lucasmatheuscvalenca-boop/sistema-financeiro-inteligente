import Decimal from "decimal.js";
import { DecimalMath, percentOf, type Cents } from "./money";

export interface CategoryAmount {
  categoryId: string;
  name: string;
  amountCents: Cents;
}

export interface SpendingChange {
  categoryId: string;
  name: string;
  currentCents: Cents;
  previousCents: Cents;
  deltaCents: Cents;
  deltaPct: number | null;
  direction: "up" | "down" | "new" | "gone";
}

/** Compara gastos por categoria entre dois períodos e ordena pelas maiores variações absolutas. */
export function spendingChanges(
  current: readonly CategoryAmount[],
  previous: readonly CategoryAmount[],
  minDeltaCents = 5_000,
): SpendingChange[] {
  const map = new Map<string, SpendingChange>();
  for (const p of previous) {
    map.set(p.categoryId, {
      categoryId: p.categoryId,
      name: p.name,
      currentCents: 0,
      previousCents: p.amountCents,
      deltaCents: -p.amountCents,
      deltaPct: -100,
      direction: "gone",
    });
  }
  for (const c of current) {
    const prev = map.get(c.categoryId)?.previousCents ?? 0;
    const delta = c.amountCents - prev;
    map.set(c.categoryId, {
      categoryId: c.categoryId,
      name: c.name,
      currentCents: c.amountCents,
      previousCents: prev,
      deltaCents: delta,
      deltaPct: prev > 0 ? percentOf(delta, prev) : null,
      direction: prev === 0 ? "new" : delta >= 0 ? "up" : "down",
    });
  }
  return [...map.values()].filter((c) => Math.abs(c.deltaCents) >= minDeltaCents).sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}

export interface IncomeShockResult {
  dropPct: number;
  incomeBeforeCents: Cents;
  incomeAfterCents: Cents;
  committedCents: Cents;
  marginBeforeCents: Cents;
  marginAfterCents: Cents;
  /** Quanto cortar de despesas não essenciais para manter a margem em zero. */
  cutNeededCents: Cents;
  nonEssentialCents: Cents;
  coverableByNonEssential: boolean;
  monthsReserveCovers: number | null;
}

/**
 * "Como ficaria meu orçamento se minha renda caísse X%?"
 * committed = despesas mensais esperadas (essenciais + não essenciais + parcelas + aportes planejados).
 */
export function simulateIncomeShock(input: {
  monthlyIncomeCents: Cents;
  essentialCents: Cents;
  nonEssentialCents: Cents;
  plannedContributionsCents: Cents;
  reserveCents: Cents;
  dropPct: number;
}): IncomeShockResult {
  const drop = Math.min(100, Math.max(0, input.dropPct));
  const after = new DecimalMath(input.monthlyIncomeCents)
    .mul(new DecimalMath(100).minus(drop))
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  const committed = input.essentialCents + input.nonEssentialCents + input.plannedContributionsCents;
  const marginBefore = input.monthlyIncomeCents - committed;
  const marginAfter = after - committed;
  const cut = Math.max(0, -marginAfter);
  const deficitAfterCuts = after - input.essentialCents;
  return {
    dropPct: drop,
    incomeBeforeCents: input.monthlyIncomeCents,
    incomeAfterCents: after,
    committedCents: committed,
    marginBeforeCents: marginBefore,
    marginAfterCents: marginAfter,
    cutNeededCents: cut,
    nonEssentialCents: input.nonEssentialCents,
    coverableByNonEssential: cut <= input.nonEssentialCents + input.plannedContributionsCents,
    monthsReserveCovers:
      deficitAfterCuts < 0 ? new DecimalMath(input.reserveCents).div(-deficitAfterCuts).toDecimalPlaces(1).toNumber() : null,
  };
}

/** Média simples de uma série de valores mensais (ignora meses sem dado). */
export function average(values: readonly Cents[]): Cents {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}
