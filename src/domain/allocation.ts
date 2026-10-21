import Decimal from "decimal.js";
import { addMonths, type ISODate } from "./dates";
import { DecimalMath, type Cents } from "./money";

/**
 * Priorização de metas: distribui a capacidade mensal de aporte sem usar o mesmo
 * dinheiro duas vezes. Ordem:
 *  1. Reserva de emergência abaixo do mínimo (segurança antes de consumo).
 *  2. Prioridade declarada (1 = mais alta).
 *  3. Urgência (prazo mais próximo).
 *  4. Ordem de criação (desempate estável).
 */
export interface GoalNeed {
  goalId: string;
  name: string;
  priority: number;
  targetDate?: ISODate | null;
  requiredMonthlyCents: Cents;
  remainingCents: Cents;
  isEmergencyReserve?: boolean;
  /** Reserva abaixo do mínimo recomendado tem precedência absoluta. */
  belowMinimum?: boolean;
  createdOrder?: number;
}

export interface Allocation {
  goalId: string;
  name: string;
  requiredCents: Cents;
  allocatedCents: Cents;
  shortfallCents: Cents;
  fullyFunded: boolean;
  rank: number;
}

export interface AllocationAlternative {
  goalId: string;
  name: string;
  /** Com o valor alocado, quantos meses seriam necessários (sem rendimento). */
  monthsWithAllocated: number | null;
  newCompletionDate: ISODate | null;
  /** Valor-alvo que caberia no prazo atual com o valor alocado. */
  reachableByDeadlineCents: Cents | null;
}

export interface AllocationResult {
  capacityCents: Cents;
  totalRequiredCents: Cents;
  allocations: Allocation[];
  unallocatedCents: Cents;
  hasConflict: boolean;
  conflicts: Array<{ goalIds: string[]; shortfallCents: Cents; message: string }>;
  alternatives: AllocationAlternative[];
}

export function rankGoals(needs: readonly GoalNeed[]): GoalNeed[] {
  return [...needs].sort((a, b) => {
    const ea = a.isEmergencyReserve && a.belowMinimum ? 0 : 1;
    const eb = b.isEmergencyReserve && b.belowMinimum ? 0 : 1;
    if (ea !== eb) return ea - eb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const da = a.targetDate ?? "9999-12-31";
    const db = b.targetDate ?? "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return (a.createdOrder ?? 0) - (b.createdOrder ?? 0);
  });
}

export function allocateMonthlyCapacity(input: {
  capacityCents: Cents;
  needs: readonly GoalNeed[];
  today: ISODate;
}): AllocationResult {
  const ranked = rankGoals(input.needs);
  let left = Math.max(0, input.capacityCents);
  const allocations: Allocation[] = ranked.map((need, idx) => {
    const required = Math.max(0, need.requiredMonthlyCents);
    const allocated = Math.min(required, left);
    left -= allocated;
    return {
      goalId: need.goalId,
      name: need.name,
      requiredCents: required,
      allocatedCents: allocated,
      shortfallCents: required - allocated,
      fullyFunded: allocated >= required,
      rank: idx + 1,
    };
  });
  const totalRequired = allocations.reduce((s, a) => s + a.requiredCents, 0);
  const underfunded = allocations.filter((a) => !a.fullyFunded);
  const conflicts: AllocationResult["conflicts"] = [];
  if (underfunded.length > 0) {
    const shortfall = underfunded.reduce((s, a) => s + a.shortfallCents, 0);
    conflicts.push({
      goalIds: underfunded.map((a) => a.goalId),
      shortfallCents: shortfall,
      message:
        underfunded.length === 1
          ? `A capacidade mensal não cobre todo o aporte de "${underfunded[0]!.name}".`
          : `${underfunded.length} metas disputam o mesmo dinheiro e não cabem juntas na capacidade mensal.`,
    });
  }
  const needById = new Map(ranked.map((n) => [n.goalId, n]));
  const alternatives = underfunded.map<AllocationAlternative>((a) => {
    const need = needById.get(a.goalId)!;
    if (a.allocatedCents <= 0) {
      return { goalId: a.goalId, name: a.name, monthsWithAllocated: null, newCompletionDate: null, reachableByDeadlineCents: null };
    }
    const months = new DecimalMath(need.remainingCents).div(a.allocatedCents).toDecimalPlaces(0, Decimal.ROUND_UP).toNumber();
    let reachable: Cents | null = null;
    if (need.targetDate && a.requiredCents > 0) {
      // Proporção do restante que cabe no prazo com o valor alocado.
      reachable = new DecimalMath(need.remainingCents).mul(a.allocatedCents).div(a.requiredCents).toDecimalPlaces(0).toNumber();
    }
    return {
      goalId: a.goalId,
      name: a.name,
      monthsWithAllocated: months,
      newCompletionDate: addMonths(input.today, months),
      reachableByDeadlineCents: reachable,
    };
  });
  return {
    capacityCents: input.capacityCents,
    totalRequiredCents: totalRequired,
    allocations,
    unallocatedCents: left,
    hasConflict: underfunded.length > 0,
    conflicts,
    alternatives,
  };
}
