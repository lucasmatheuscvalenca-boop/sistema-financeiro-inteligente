import { and, eq, gte, lte } from "drizzle-orm";
import * as s from "../db/schema";
import { buildRetrospective, type Retrospective } from "@/domain/retrospective";
import { listCategories } from "./categories";
import type { ServiceContext } from "./context";
import { loadTransactions } from "./ledger";

export interface YearInReview extends Retrospective {
  goalsCompleted: string[];
  contributedCents: number;
  netWorth: { startCents: number; endCents: number; startMonth: string; endMonth: string } | null;
}

export async function getYearInReview(ctx: ServiceContext, year: number): Promise<YearInReview> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [txs, categories, goals, contributions, snapshots] = await Promise.all([
    loadTransactions(ctx, { from: start, to: end }),
    listCategories(ctx, { includeArchived: true }),
    ctx.db.select({ name: s.goals.name, completedAt: s.goals.completedAt }).from(s.goals).where(and(eq(s.goals.userId, ctx.userId), eq(s.goals.status, "completed"))),
    ctx.db
      .select({ kind: s.goalContributions.kind, amountCents: s.goalContributions.amountCents })
      .from(s.goalContributions)
      .where(and(eq(s.goalContributions.userId, ctx.userId), gte(s.goalContributions.date, start), lte(s.goalContributions.date, end))),
    ctx.db
      .select({ month: s.netWorthSnapshots.month, netWorthCents: s.netWorthSnapshots.netWorthCents })
      .from(s.netWorthSnapshots)
      .where(and(eq(s.netWorthSnapshots.userId, ctx.userId), gte(s.netWorthSnapshots.month, `${year}-01`), lte(s.netWorthSnapshots.month, `${year}-12`))),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rootName = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    return (c?.parentId ? byId.get(c.parentId)?.name : c?.name) ?? null;
  };
  const base = buildRetrospective(
    year,
    txs.filter((t) => t.status === "realized").map((t) => ({ date: t.date, kind: t.kind, amountCents: t.amountCents, description: t.description, category: rootName(t.categoryId) })),
  );
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    ...base,
    goalsCompleted: goals.filter((g) => g.completedAt && g.completedAt.toISOString().startsWith(`${year}-`)).map((g) => g.name),
    contributedCents: contributions.reduce((t, c) => t + (c.kind === "deposit" ? c.amountCents : c.kind === "withdrawal" ? -c.amountCents : 0), 0),
    netWorth: first && last && first.month !== last.month ? { startCents: first.netWorthCents, endCents: last.netWorthCents, startMonth: first.month, endMonth: last.month } : null,
  };
}
