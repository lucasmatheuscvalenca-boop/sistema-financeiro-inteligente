import type { Cents } from "./money";

/**
 * Divisão de contas do casal: as despesas "nossas" são somadas e cada um deveria pagar a sua parte
 * (meio a meio ou proporcional à renda). O que alguém pagou só pela outra pessoa ("seu") entra
 * inteiro na conta dela. Acertos já feitos abatem a diferença. O resultado diz quem transfere
 * quanto para quem.
 */

export type SplitMode = "equal" | "income";

export interface SplitPerson {
  id: string;
  name: string;
  /** Renda mensal, usada no modo proporcional. */
  incomeCents: Cents;
}

export interface SharedExpense {
  paidBy: string;
  amountCents: Cents;
  /** Pago inteiro pela outra pessoa ("seu"): ela deve tudo, não divide. */
  forOther?: boolean;
}

export interface Settlement {
  fromId: string;
  toId: string;
  amountCents: Cents;
}

export interface SplitResult {
  /** Total das despesas nossas (sem as pagas só pela outra pessoa). */
  sharedCents: Cents;
  /** Total das despesas pagas só pela outra pessoa. */
  forOtherCents: Cents;
  people: Array<SplitPerson & { sharePct: number; shouldPayCents: Cents; paidCents: Cents; settledCents: Cents; balanceCents: Cents }>;
  /** O que ainda falta transferir (no máximo uma transferência entre as duas pessoas). */
  settlement: Settlement | null;
}

export function splitShared(people: readonly [SplitPerson, SplitPerson], expenses: readonly SharedExpense[], mode: SplitMode, settled: readonly Settlement[] = []): SplitResult {
  const shared = expenses.filter((e) => !e.forOther);
  const forOther = expenses.filter((e) => e.forOther);
  const sharedCents = shared.reduce((t, e) => t + e.amountCents, 0);
  const incomes = people[0].incomeCents + people[1].incomeCents;
  const shareA = mode === "income" && incomes > 0 ? people[0].incomeCents / incomes : 0.5;
  const shouldA = Math.round(sharedCents * shareA);
  const should = [shouldA, sharedCents - shouldA];
  // O que foi pago só pela outra pessoa vira parte do que ela deveria pagar.
  for (const e of forOther) {
    const other = e.paidBy === people[0].id ? 1 : 0;
    should[other]! += e.amountCents;
  }
  const paid = people.map((p) => expenses.filter((e) => e.paidBy === p.id).reduce((t, e) => t + e.amountCents, 0));
  // Transferência já feita: quem mandou "pagou" a mais, quem recebeu, a menos.
  const settledNet = people.map((p) => settled.reduce((t, s) => t + (s.fromId === p.id ? s.amountCents : s.toId === p.id ? -s.amountCents : 0), 0));
  const result = people.map((p, i) => ({
    ...p,
    sharePct: (i === 0 ? shareA : 1 - shareA) * 100,
    shouldPayCents: should[i]!,
    paidCents: paid[i]!,
    settledCents: settledNet[i]!,
    balanceCents: paid[i]! + settledNet[i]! - should[i]!,
  }));
  const a = result[0]!;
  const b = result[1]!;
  const settlement = a.balanceCents === 0 ? null : a.balanceCents < 0 ? { fromId: a.id, toId: b.id, amountCents: -a.balanceCents } : { fromId: b.id, toId: a.id, amountCents: a.balanceCents };
  return { sharedCents, forOtherCents: forOther.reduce((t, e) => t + e.amountCents, 0), people: result, settlement };
}
