import { eq } from "drizzle-orm";
import { z } from "zod";
import { canISpend, type SpendAnalysis, type SpendPayment } from "@/domain/can-i-spend";
import { monthKey } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { getBudgetEvaluation } from "./budgets";
import { cycleOf, listCardsOverview } from "./cards";
import { buildCashContext } from "./cashflow";
import type { ServiceContext } from "./context";
import { centsPositive, isoDate, optionalUuid, parse } from "./common";
import { listGoals } from "./goals";
import { estimateMonthlyBasis } from "./planning";
import { getDataQuality } from "./snapshot";

export const spendSchema = z.object({
  amountCents: centsPositive,
  description: z.string().trim().max(140).optional(),
  categoryId: optionalUuid,
  method: z.enum(["account", "card"]).default("account"),
  cardId: optionalUuid,
  installments: z.coerce.number().int().min(1).max(24).default(1),
  date: isoDate.optional(),
  cheaperAlternativeCents: z.number().int().positive().optional(),
});

export type SpendRequest = z.input<typeof spendSchema>;

/** Margem de segurança: preferência do usuário ou 10% das despesas essenciais (mínimo R$ 100). */
export async function safetyMargin(ctx: ServiceContext): Promise<{ cents: number; source: "preference" | "automatic" }> {
  const [prefs] = await ctx.db.select({ m: s.userPreferences.safetyMarginCents }).from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId));
  if (prefs?.m != null) return { cents: prefs.m, source: "preference" };
  const basis = await estimateMonthlyBasis(ctx);
  return { cents: Math.max(10_000, Math.round(basis.essentialCents * 0.1)), source: "automatic" };
}

/**
 * "Posso gastar?" com dados reais do usuário. Só lê dados: nenhuma opção retornada é aplicada
 * sem confirmação explícita em outra ação.
 */
export async function evaluateSpend(ctx: ServiceContext, request: SpendRequest): Promise<SpendAnalysis & { categoryName: string | null }> {
  const data = parse(spendSchema, request);
  const [cash, goals, margin] = await Promise.all([buildCashContext(ctx, 120), listGoals(ctx), safetyMargin(ctx)]);

  let payment: SpendPayment = { method: "account" };
  if (data.method === "card") {
    if (!data.cardId) throw new ValidationError("Escolha o cartão", { cardId: "Obrigatório" });
    const cards = await listCardsOverview(ctx);
    const card = cards.find((c) => c.id === data.cardId);
    if (!card) throw new NotFoundError("Cartão não encontrado");
    payment = { method: "card", cardName: card.name, cycle: cycleOf(card), installments: data.installments, availableLimitCents: card.limit.availableCents };
  }

  let budget = null;
  let otherBudgets: Array<{ categoryId: string; categoryName: string; remainingCents: number }> = [];
  let categoryName: string | null = null;
  const month = monthKey(data.date && data.date > ctx.today ? data.date : ctx.today);
  if (data.categoryId) {
    const [cat] = await ctx.db.select().from(s.categories).where(eq(s.categories.id, data.categoryId));
    if (!cat || cat.userId !== ctx.userId) throw new NotFoundError("Categoria não encontrada");
    categoryName = cat.name;
    const evaluation = await getBudgetEvaluation(ctx, month);
    const targetId = evaluation.lines.some((l) => l.categoryId === cat.id) ? cat.id : cat.parentId;
    const line = evaluation.lines.find((l) => l.categoryId === targetId);
    if (line) budget = { categoryId: line.categoryId, categoryName: line.categoryName, limitCents: line.limitCents, committedCents: line.committedCents };
    otherBudgets = evaluation.lines.map((l) => ({ categoryId: l.categoryId, categoryName: l.categoryName, remainingCents: l.remainingCents }));
  }

  const dq = await getDataQuality(ctx, cash.hasSpendingAccounts, cash.events);
  const analysis = canISpend({
    today: ctx.today,
    amountCents: data.amountCents,
    description: data.description,
    purchaseDate: data.date,
    payment,
    openingAvailableCents: cash.hasSpendingAccounts ? cash.freeCents : null,
    events: cash.events,
    safetyMarginCents: margin.cents,
    budget,
    otherBudgets,
    goals: goals
      .filter((g) => g.access === "owner" && g.goal.status === "active")
      .map((g) => ({
        goalId: g.goal.id,
        name: g.goal.name,
        priority: g.goal.priority,
        currentCents: g.balances.balanceCents,
        targetCents: g.goal.targetCents,
        monthlyContributionCents: g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents ?? 0,
        contributionDay: g.goal.contributionDay,
        annualReturnRate: g.goal.expectedAnnualReturnBps ? g.goal.expectedAnnualReturnBps / 10000 : null,
      })),
    dataQuality: {
      lastDataUpdate: dq.lastDataUpdate,
      hasIncomeInfo: dq.hasIncomeInfo,
      hasBankConnection: dq.hasBankConnection,
      connectionStale: dq.connectionStale,
      missing: dq.missing.filter((m) => !m.includes("conta disponível")),
    },
    cheaperAlternativeCents: data.cheaperAlternativeCents,
  });
  if (cash.reservedForGoalsCents > 0) {
    analysis.assumptions.unshift(
      `Do saldo das contas de gasto, ${formatMoney(cash.reservedForGoalsCents)} já pertencem a metas e foram descontados.`,
    );
  }
  if (margin.source === "automatic") analysis.assumptions.push("Margem de segurança automática: 10% das despesas essenciais mensais (mínimo de R$ 100,00). Ajuste em Configurações.");
  return { ...analysis, categoryName };
}
