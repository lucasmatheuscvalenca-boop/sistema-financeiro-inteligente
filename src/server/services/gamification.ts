import { and, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { addDays, addMonthsToKey, monthKey, type ISODate } from "@/domain/dates";
import {
  ACHIEVEMENTS,
  challengeProgress,
  evaluateAchievements,
  reviewStreakWeeks,
  weekStart,
  weeklyMissions,
  type AchievementCode,
  type GamificationStats,
} from "@/domain/gamification";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { getBudgetEvaluation } from "./budgets";
import type { ServiceContext } from "./context";
import { isoDate, parse } from "./common";
import { getEmergencyOverview } from "./emergency";
import { listGoals } from "./goals";

async function countOf(ctx: ServiceContext, table: typeof s.accounts | typeof s.budgets | typeof s.goals | typeof s.importBatches) {
  const [row] = await ctx.db.select({ n: count() }).from(table).where(eq(table.userId, ctx.userId));
  return row?.n ?? 0;
}

export async function gatherStats(ctx: ServiceContext): Promise<GamificationStats & { reviewDates: ISODate[] }> {
  const [accounts, budgets, goalsCount, imports, goals, emergency, reviews, [briefing], [retirement], [challenges], [contributions]] = await Promise.all([
    countOf(ctx, s.accounts),
    countOf(ctx, s.budgets),
    countOf(ctx, s.goals),
    countOf(ctx, s.importBatches),
    listGoals(ctx, { includeArchived: true }),
    getEmergencyOverview(ctx),
    ctx.db.select({ d: s.financialReviews.reviewDate }).from(s.financialReviews).where(eq(s.financialReviews.userId, ctx.userId)),
    ctx.db.select({ done: s.userPreferences.onboardingCompletedAt }).from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId)),
    ctx.db.select({ u: s.retirementPlans.userId }).from(s.retirementPlans).where(eq(s.retirementPlans.userId, ctx.userId)),
    ctx.db
      .select({ n: count() })
      .from(s.savingsChallenges)
      .where(and(eq(s.savingsChallenges.userId, ctx.userId), eq(s.savingsChallenges.status, "completed"))),
    ctx.db.select({ n: count() }).from(s.goalContributions).where(and(eq(s.goalContributions.userId, ctx.userId), eq(s.goalContributions.kind, "deposit"))),
  ]);
  const own = goals.filter((g) => g.access === "owner");
  const lastMonth = addMonthsToKey(monthKey(ctx.today), -1);
  const lastBudget = await getBudgetEvaluation(ctx, lastMonth);
  const reviewDates = reviews.map((r) => r.d);
  return {
    briefingComplete: !!briefing?.done,
    accounts,
    budgets,
    goals: goalsCount,
    contributions: contributions?.n ?? 0,
    maxGoalProgressPct: own.reduce((m, g) => Math.max(m, g.diagnosis.progressPct), 0),
    goalsCompleted: own.filter((g) => g.diagnosis.health === "completed" || g.goal.status === "completed").length,
    reserveCoverageMonths: emergency.evaluation.coverageMonths,
    reserveComplete: emergency.evaluation.status === "complete",
    reviewStreakWeeks: reviewStreakWeeks(reviewDates, ctx.today),
    budgetKeptLastMonth: lastBudget.lines.length > 0 && lastBudget.lines.every((l) => l.status !== "exceeded"),
    imports,
    hasRetirementPlan: !!retirement,
    challengesCompleted: challenges?.n ?? 0,
    reviewDates,
  };
}

/** Avalia conquistas e grava as novas. Conquistas nunca são removidas. */
export async function syncAchievements(ctx: ServiceContext): Promise<{ unlocked: Array<{ code: AchievementCode; unlockedAt: Date; seenAt: Date | null }>; newlyUnlocked: AchievementCode[]; stats: Awaited<ReturnType<typeof gatherStats>> }> {
  const stats = await gatherStats(ctx);
  const codes = evaluateAchievements(stats);
  const existing = await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, ctx.userId));
  const have = new Set(existing.map((e) => e.code));
  const fresh = codes.filter((c) => !have.has(c));
  if (fresh.length > 0) {
    await ctx.db
      .insert(s.userAchievements)
      .values(fresh.map((code) => ({ userId: ctx.userId, code })))
      .onConflictDoNothing();
  }
  const unlocked = await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, ctx.userId)).orderBy(desc(s.userAchievements.unlockedAt));
  return { unlocked: unlocked.map((u) => ({ code: u.code as AchievementCode, unlockedAt: u.unlockedAt, seenAt: u.seenAt })), newlyUnlocked: fresh, stats };
}

export async function markAchievementsSeen(ctx: ServiceContext): Promise<void> {
  await ctx.db
    .update(s.userAchievements)
    .set({ seenAt: new Date() })
    .where(and(eq(s.userAchievements.userId, ctx.userId), isNull(s.userAchievements.seenAt)));
}

export async function getGamification(ctx: ServiceContext) {
  const { unlocked, newlyUnlocked, stats } = await syncAchievements(ctx);
  const week = weekStart(ctx.today);
  const [[contribWeek], [pastScheduled], challenges] = await Promise.all([
    ctx.db
      .select({ n: count() })
      .from(s.goalContributions)
      .where(and(eq(s.goalContributions.contributorUserId, ctx.userId), gte(s.goalContributions.date, week))),
    ctx.db
      .select({ n: count() })
      .from(s.transactions)
      .where(and(eq(s.transactions.userId, ctx.userId), eq(s.transactions.status, "scheduled"), lt(s.transactions.date, ctx.today))),
    listChallenges(ctx),
  ]);
  // Transferências não têm categoria por definição: não contam como "sem categoria".
  const missions = weeklyMissions({
    today: ctx.today,
    reviewedThisWeek: stats.reviewDates.some((d) => d >= week),
    uncategorizedCount: await uncategorizedNonTransfer(ctx),
    contributionsThisWeek: contribWeek?.n ?? 0,
    activeGoals: stats.goals,
    budgets: stats.budgets,
    pendingScheduledPast: pastScheduled?.n ?? 0,
    activeChallenges: challenges.filter((c) => c.status === "active").length,
  });
  const unlockedSet = new Map(unlocked.map((u) => [u.code, u]));
  return {
    stats,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: unlockedSet.get(a.code)?.unlockedAt ?? null, isNew: newlyUnlocked.includes(a.code) || (unlockedSet.has(a.code) && !unlockedSet.get(a.code)!.seenAt) })),
    missions,
    streakWeeks: stats.reviewStreakWeeks,
    challenges,
  };
}

async function uncategorizedNonTransfer(ctx: ServiceContext): Promise<number> {
  const rows = await ctx.db
    .select({ kind: s.transactions.kind })
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), isNull(s.transactions.categoryId), eq(s.transactions.status, "realized"), gte(s.transactions.date, addDays(ctx.today, -60))));
  return rows.filter((r) => r.kind === "income" || r.kind === "expense").length;
}

const reviewSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  checklist: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().trim().max(1000).nullish(),
});

export async function recordReview(ctx: ServiceContext, input: z.input<typeof reviewSchema>): Promise<void> {
  const data = parse(reviewSchema, input);
  await ctx.db.insert(s.financialReviews).values({ ...data, userId: ctx.userId, reviewDate: ctx.today, notes: data.notes ?? null });
}

export async function listReviews(ctx: ServiceContext) {
  return ctx.db.select().from(s.financialReviews).where(eq(s.financialReviews.userId, ctx.userId)).orderBy(desc(s.financialReviews.createdAt)).limit(30);
}

const challengeSchema = z.object({
  title: z.string().trim().min(3, "Dê um nome ao desafio").max(80),
  description: z.string().trim().max(300).nullish(),
  targetCheckIns: z.coerce.number().int().min(1).max(366),
  startDate: isoDate,
  endDate: isoDate,
});

export async function createChallenge(ctx: ServiceContext, input: z.input<typeof challengeSchema>): Promise<void> {
  const data = parse(challengeSchema, input);
  if (data.endDate < data.startDate) throw new ValidationError("A data final precisa ser depois da inicial");
  await ctx.db.insert(s.savingsChallenges).values({ ...data, userId: ctx.userId, description: data.description ?? null });
}

export async function listChallenges(ctx: ServiceContext) {
  const rows = await ctx.db.select().from(s.savingsChallenges).where(eq(s.savingsChallenges.userId, ctx.userId)).orderBy(desc(s.savingsChallenges.createdAt));
  const checkIns = await ctx.db.select().from(s.challengeCheckIns).where(eq(s.challengeCheckIns.userId, ctx.userId));
  return rows.map((c) => {
    const mine = checkIns.filter((x) => x.challengeId === c.id);
    return {
      ...c,
      checkedInToday: mine.some((x) => x.date === ctx.today),
      progress: challengeProgress({ checkIns: mine.length, targetCheckIns: c.targetCheckIns, endDate: c.endDate, today: ctx.today }),
    };
  });
}

export async function checkInChallenge(ctx: ServiceContext, challengeId: string, note?: string): Promise<{ completed: boolean }> {
  const [c] = await ctx.db
    .select()
    .from(s.savingsChallenges)
    .where(and(eq(s.savingsChallenges.id, challengeId), eq(s.savingsChallenges.userId, ctx.userId)))
    .limit(1);
  if (!c) throw new NotFoundError("Desafio não encontrado");
  if (c.status !== "active") throw new ValidationError("Este desafio não está ativo");
  if (ctx.today < c.startDate || ctx.today > c.endDate) throw new ValidationError("Fora do período do desafio");
  await ctx.db
    .insert(s.challengeCheckIns)
    .values({ challengeId: c.id, userId: ctx.userId, date: ctx.today, note: note ?? null })
    .onConflictDoNothing();
  const [{ n }] = (await ctx.db.select({ n: count() }).from(s.challengeCheckIns).where(eq(s.challengeCheckIns.challengeId, c.id))) as [{ n: number }];
  const completed = n >= c.targetCheckIns;
  if (completed) await ctx.db.update(s.savingsChallenges).set({ status: "completed" }).where(eq(s.savingsChallenges.id, c.id));
  return { completed };
}

export async function abandonChallenge(ctx: ServiceContext, challengeId: string): Promise<void> {
  const r = await ctx.db
    .update(s.savingsChallenges)
    .set({ status: "abandoned" })
    .where(and(eq(s.savingsChallenges.id, challengeId), eq(s.savingsChallenges.userId, ctx.userId)))
    .returning({ id: s.savingsChallenges.id });
  if (r.length === 0) throw new NotFoundError("Desafio não encontrado");
}
