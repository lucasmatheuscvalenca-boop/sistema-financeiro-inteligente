import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { allocateMonthlyCapacity, type AllocationResult } from "@/domain/allocation";
import { diagnoseGoal, goalBalances, simulateGoal, type ContributionRecord, type GoalDiagnosis, type GoalSimulationInput } from "@/domain/goals";
import * as s from "../db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import type { ServiceContext } from "./context";
import { assertOwned, centsPositive, isoDate, optionalUuid, parse } from "./common";
import { estimateMonthlyBasis } from "./planning";
import { goalAccess, sharedGoalIds, type GoalAccess } from "./sharing";

export type GoalRow = typeof s.goals.$inferSelect;
export type ContributionRow = typeof s.goalContributions.$inferSelect;

export const GOAL_KINDS = ["travel", "vehicle", "home", "wedding", "education", "independence", "retirement", "other"] as const;
export const GOAL_KIND_LABEL: Record<(typeof GOAL_KINDS)[number], string> = {
  travel: "Viagem",
  vehicle: "Veículo",
  home: "Moradia",
  wedding: "Casamento",
  education: "Formação",
  independence: "Independência financeira",
  retirement: "Aposentadoria",
  other: "Outro projeto",
};

const goalSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à meta").max(80),
  description: z.string().trim().max(500).nullish(),
  kind: z.enum(GOAL_KINDS).default("other"),
  targetCents: centsPositive,
  targetDate: isoDate.nullish(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  plannedMonthlyCents: z.number().int().min(0).max(100_000_000_00).nullish(),
  contributionDay: z.coerce.number().int().min(1).max(31).default(5),
  expectedAnnualReturnBps: z.coerce.number().int().min(0).max(5000).nullish(),
  holdingAccountId: optionalUuid,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  imageUrl: z.url().max(500).nullish(),
});

export type GoalInput = z.input<typeof goalSchema>;

function toRecords(rows: ContributionRow[]): ContributionRecord[] {
  return rows.map((c) => ({ date: c.date, amountCents: c.kind === "withdrawal" ? -c.amountCents : c.amountCents, kind: c.kind as ContributionRecord["kind"] }));
}

export interface GoalView {
  goal: GoalRow;
  access: GoalAccess;
  balances: ReturnType<typeof goalBalances>;
  diagnosis: GoalDiagnosis;
}

export function buildGoalView(ctx: ServiceContext, goal: GoalRow, contributions: ContributionRow[], access: GoalAccess): GoalView {
  const records = toRecords(contributions);
  const balances = goalBalances(records);
  const diagnosis = diagnoseGoal({
    targetCents: goal.targetCents,
    currentCents: balances.balanceCents,
    targetDate: goal.targetDate,
    annualReturnRate: goal.expectedAnnualReturnBps ? goal.expectedAnnualReturnBps / 10000 : null,
    contributionDay: goal.contributionDay,
    plannedMonthlyCents: goal.plannedMonthlyCents,
    paused: goal.status === "paused",
    contributions: records,
    today: ctx.today,
  });
  return { goal, access, balances, diagnosis };
}

export async function listGoals(ctx: ServiceContext, opts: { includeArchived?: boolean; includeShared?: boolean } = {}): Promise<GoalView[]> {
  const own = await ctx.db
    .select()
    .from(s.goals)
    .where(opts.includeArchived ? eq(s.goals.userId, ctx.userId) : and(eq(s.goals.userId, ctx.userId), ne(s.goals.status, "archived")))
    .orderBy(asc(s.goals.priority), asc(s.goals.targetDate), asc(s.goals.createdAt));
  const shared = opts.includeShared ? await sharedGoalIds(ctx) : [];
  const sharedGoals = shared.length
    ? await ctx.db
        .select()
        .from(s.goals)
        .where(and(inArray(s.goals.id, shared.map((x) => x.goalId)), ne(s.goals.status, "archived")))
    : [];
  const all = [...own, ...sharedGoals];
  if (all.length === 0) return [];
  const contributions = await ctx.db
    .select()
    .from(s.goalContributions)
    .where(inArray(s.goalContributions.goalId, all.map((g) => g.id)));
  const perm = new Map(shared.map((x) => [x.goalId, x.permission]));
  return all.map((g) =>
    buildGoalView(
      ctx,
      g,
      contributions.filter((c) => c.goalId === g.id),
      g.userId === ctx.userId ? "owner" : (perm.get(g.id) ?? "view"),
    ),
  );
}

export async function getGoal(ctx: ServiceContext, id: string): Promise<GoalView & { contributions: Array<ContributionRow & { contributorName: string | null }> }> {
  const { goal, access } = await goalAccess(ctx, id);
  const contributions = await ctx.db
    .select({ c: s.goalContributions, contributorName: s.users.name })
    .from(s.goalContributions)
    .leftJoin(s.users, eq(s.users.id, s.goalContributions.contributorUserId))
    .where(eq(s.goalContributions.goalId, goal.id))
    .orderBy(desc(s.goalContributions.date), desc(s.goalContributions.createdAt));
  const rows = contributions.map((r) => ({ ...r.c, contributorName: r.contributorName }));
  return { ...buildGoalView(ctx, goal, rows, access), contributions: rows };
}

async function checkHolding(ctx: ServiceContext, holdingAccountId: string | null | undefined) {
  await assertOwned(ctx.db, s.accounts, ctx.userId, [holdingAccountId], "Conta da meta");
}

export async function createGoal(ctx: ServiceContext, input: GoalInput): Promise<GoalRow> {
  const data = parse(goalSchema, input);
  if (data.targetDate && data.targetDate < ctx.today) throw new ValidationError("A data desejada precisa ser futura", { targetDate: "Data no passado" });
  await checkHolding(ctx, data.holdingAccountId);
  const [row] = await ctx.db
    .insert(s.goals)
    .values({ ...data, userId: ctx.userId, holdingAccountId: data.holdingAccountId ?? null })
    .returning();
  await audit(ctx.db, { userId: ctx.userId, action: "goal.created", entityType: "goal", entityId: row!.id });
  return row!;
}

/** Só o dono altera a meta. Alterações em objetivos importantes exigem ação explícita do usuário. */
export async function updateGoal(ctx: ServiceContext, id: string, input: Partial<GoalInput>): Promise<GoalRow> {
  const { goal, access } = await goalAccess(ctx, id);
  if (access !== "owner") throw new ForbiddenError("Só quem criou a meta pode alterá-la");
  const data = parse(goalSchema.partial(), input);
  await checkHolding(ctx, data.holdingAccountId);
  const [row] = await ctx.db
    .update(s.goals)
    .set(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)))
    .where(and(eq(s.goals.id, goal.id), eq(s.goals.userId, ctx.userId)))
    .returning();
  return row!;
}

export async function setGoalStatus(ctx: ServiceContext, id: string, status: "active" | "paused" | "completed" | "archived"): Promise<void> {
  const { goal, access } = await goalAccess(ctx, id);
  if (access !== "owner") throw new ForbiddenError("Só quem criou a meta pode alterá-la");
  await ctx.db
    .update(s.goals)
    .set({ status, completedAt: status === "completed" ? new Date() : null })
    .where(and(eq(s.goals.id, goal.id), eq(s.goals.userId, ctx.userId)));
}

export async function deleteGoal(ctx: ServiceContext, id: string): Promise<void> {
  const { goal, access } = await goalAccess(ctx, id);
  if (access !== "owner") throw new ForbiddenError("Só quem criou a meta pode excluí-la");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.resourceShares).where(and(eq(s.resourceShares.resourceType, "goal"), eq(s.resourceShares.resourceId, goal.id)));
    await tx.delete(s.goals).where(and(eq(s.goals.id, goal.id), eq(s.goals.userId, ctx.userId)));
  });
  await audit(ctx.db, { userId: ctx.userId, action: "goal.deleted", entityType: "goal", entityId: goal.id });
}

const contributionSchema = z.object({
  kind: z.enum(["deposit", "withdrawal", "yield"]).default("deposit"),
  amountCents: centsPositive,
  date: isoDate,
  note: z.string().trim().max(200).nullish(),
  sourceAccountId: optionalUuid,
});

/**
 * Registra aporte, resgate ou rendimento. Se o dono informar a conta de origem e a meta
 * tiver conta própria, uma transferência entre contas é criada (não é receita nem despesa).
 */
export async function addContribution(ctx: ServiceContext, goalId: string, input: z.input<typeof contributionSchema>): Promise<string> {
  const { goal, access } = await goalAccess(ctx, goalId);
  if (access === "view") throw new ForbiddenError("Você pode apenas visualizar esta meta");
  const data = parse(contributionSchema, input);
  if (data.date > ctx.today) throw new ValidationError("Aportes registrados precisam ter data de hoje ou anterior");
  if (access !== "owner" && data.kind !== "deposit") throw new ForbiddenError("Apenas aportes podem ser registrados em metas compartilhadas");
  if (access !== "owner" && data.sourceAccountId) throw new ValidationError("Em metas compartilhadas o aporte é apenas registrado");
  if (data.kind === "withdrawal") {
    const view = await getGoal(ctx, goalId);
    if (data.amountCents > view.balances.balanceCents) throw new ValidationError("O resgate é maior que o saldo da meta");
  }
  await assertOwned(ctx.db, s.accounts, ctx.userId, [data.sourceAccountId], "Conta de origem");
  return ctx.db.transaction(async (tx) => {
    let transactionId: string | null = null;
    if (access === "owner" && data.sourceAccountId && goal.holdingAccountId && data.sourceAccountId !== goal.holdingAccountId && data.kind !== "yield") {
      const deposit = data.kind === "deposit";
      const [t] = await tx
        .insert(s.transactions)
        .values({
          userId: ctx.userId,
          kind: "transfer",
          status: "realized",
          amountCents: data.amountCents,
          date: data.date,
          description: `${deposit ? "Aporte" : "Resgate"}: ${goal.name}`,
          accountId: deposit ? data.sourceAccountId : goal.holdingAccountId,
          toAccountId: deposit ? goal.holdingAccountId : data.sourceAccountId,
        })
        .returning({ id: s.transactions.id });
      transactionId = t!.id;
      await tx.insert(s.transactionHistory).values({ transactionId, userId: ctx.userId, action: "create", actorUserId: ctx.userId, changes: {} });
    }
    const [row] = await tx
      .insert(s.goalContributions)
      .values({
        goalId: goal.id,
        userId: goal.userId,
        contributorUserId: ctx.userId,
        kind: data.kind,
        amountCents: data.amountCents,
        date: data.date,
        note: data.note ?? null,
        sourceAccountId: access === "owner" ? (data.sourceAccountId ?? null) : null,
        transactionId,
      })
      .returning({ id: s.goalContributions.id });
    return row!.id;
  });
}

export async function deleteContribution(ctx: ServiceContext, contributionId: string): Promise<void> {
  const [c] = await ctx.db.select().from(s.goalContributions).where(eq(s.goalContributions.id, contributionId)).limit(1);
  if (!c) throw new NotFoundError("Aporte não encontrado");
  const { access } = await goalAccess(ctx, c.goalId);
  if (access !== "owner" && c.contributorUserId !== ctx.userId) throw new NotFoundError("Aporte não encontrado");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.goalContributions).where(eq(s.goalContributions.id, c.id));
    if (c.transactionId && access === "owner") {
      await tx.delete(s.transactions).where(and(eq(s.transactions.id, c.transactionId), eq(s.transactions.userId, ctx.userId)));
    }
  });
}

export async function simulateGoalScenario(ctx: ServiceContext, goalId: string, changes: Partial<Omit<GoalSimulationInput, "startDate" | "currentCents">>) {
  const view = await getGoal(ctx, goalId);
  const base: GoalSimulationInput = {
    targetCents: view.goal.targetCents,
    currentCents: view.balances.balanceCents,
    startDate: ctx.today,
    monthlyContributionCents: view.diagnosis.basisMonthlyCents || view.diagnosis.required.perPeriodCents || 0,
    contributionDay: view.goal.contributionDay,
    annualReturnRate: view.goal.expectedAnnualReturnBps ? view.goal.expectedAnnualReturnBps / 10000 : null,
    targetDate: view.goal.targetDate,
  };
  const scenarioInput = { ...base, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v))) };
  return { base: simulateGoal(base), scenario: simulateGoal(scenarioInput as GoalSimulationInput), baseInput: base, scenarioInput };
}

/** Plano de priorização: distribui a capacidade mensal entre as metas ativas. */
export async function goalAllocationPlan(ctx: ServiceContext): Promise<{ allocation: AllocationResult; capacityPremises: string[]; capacityCents: number }> {
  const [goals, basis] = await Promise.all([listGoals(ctx), estimateMonthlyBasis(ctx)]);
  const active = goals.filter((g) => g.access === "owner" && g.goal.status === "active" && g.diagnosis.remainingCents > 0);
  const needs = active.map((g, idx) => ({
    goalId: g.goal.id,
    name: g.goal.name,
    priority: g.goal.priority,
    targetDate: g.goal.targetDate,
    requiredMonthlyCents: g.diagnosis.required.perPeriodCents ?? g.goal.plannedMonthlyCents ?? 0,
    remainingCents: g.diagnosis.remainingCents,
    createdOrder: idx,
  }));
  const allocation = allocateMonthlyCapacity({ capacityCents: basis.capacityCents, needs, today: ctx.today });
  return { allocation, capacityPremises: basis.premises, capacityCents: basis.capacityCents };
}
